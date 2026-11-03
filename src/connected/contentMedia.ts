import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as c from '../contracts/v1/content';
import type { ContentService } from './content';
import { authorize, ServiceError, type Actor } from './store';

const metadata = z.object({ slug:c.contentId,purpose:z.enum(['cover','body','gallery']),fileName:z.string().min(1).max(160).refine(value => !/[\\/\u0000-\u001f\u007f]/.test(value)),mimeType:z.enum(['image/png','image/jpeg','image/webp','image/gif']) }).strict();
export class PrivateContentImage {
  constructor(readonly contentType:string,readonly bytes:Buffer) {}
}
const invalid = ():never => { throw new ServiceError(422,'INVALID_IMAGE','Upload a valid PNG, JPEG, GIF or WebP image up to 12 MiB.'); };
const crcTable = Uint32Array.from({length:256},(_value,index) => {
  let value = index;
  for (let bit = 0;bit < 8;bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function validPng(bytes:Buffer):boolean {
  let offset = 8,hasData = false,hasPalette = false,chunks = 0;
  const depth = bytes[24],color = bytes[25];
  if (bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1 || !({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]} as Record<number,number[]>)[color]?.includes(depth)) return false;
  while (offset + 12 <= bytes.length && ++chunks <= 4096) {
    const size = bytes.readUInt32BE(offset),end = offset + 12 + size;
    if (end > bytes.length) return false;
    const kind = bytes.toString('ascii',offset + 4,offset + 8);
    let crc = 0xffffffff;
    for (let index = offset + 4;index < end - 4;index++) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) return false;
    if (chunks === 1 ? kind !== 'IHDR' || size !== 13 : kind === 'IHDR') return false;
    if (kind === 'PLTE') { if (!size || size > 768 || size % 3) return false; hasPalette = true; }
    if (kind === 'IDAT') { if (color === 3 && !hasPalette) return false; hasData ||= size > 0; }
    if (kind === 'IEND') return size === 0 && end === bytes.length && hasData;
    if (!['IHDR','PLTE','IDAT'].includes(kind) && /^[A-Z]/.test(kind)) return false;
    offset = end;
  }
  return false;
}
export function imageExtension(bytes:Buffer,mime:string):string {
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) invalid();
  let width = 0, height = 0,extension = '';
  if (mime === 'image/png' && bytes.length >= 45 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && validPng(bytes)) {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); extension = 'png';
  } else if (mime === 'image/gif' && bytes.length >= 14 && ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)) && bytes[bytes.length - 1] === 0x3b) {
    width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8); extension = 'gif';
  } else if (mime === 'image/jpeg' && bytes.length >= 16 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (marker !== undefined && [0xc0,0xc1,0xc2].includes(marker) && size >= 8) { height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); extension = 'jpg'; break; }
      offset += size;
    }
  } else if (mime === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4) === bytes.length - 8) {
    const kind = bytes.toString('ascii',12,16);
    if (kind === 'VP8X') { width = 1 + bytes.readUIntLE(24,3); height = 1 + bytes.readUIntLE(27,3); }
    else if (kind === 'VP8 ' && bytes.subarray(23,26).equals(Buffer.from('9d012a','hex'))) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L' && bytes[20] === 0x2f) { width = 1 + (bytes.readUInt32LE(21) & 0x3fff); height = 1 + ((bytes.readUInt32LE(21) >>> 14) & 0x3fff); }
    extension = 'webp';
  }
  if (!extension || !width || !height || width * height > 16_777_216) invalid();
  return extension;
}

export class ContentMedia {
  constructor(readonly content:ContentService) { content.store.db.exec('CREATE TABLE IF NOT EXISTS cs_content_image_bytes (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)'); }
  upload(actor:Actor,raw:unknown,type:string,bytes:Buffer,key:string) {
    authorize(actor,'content:write');
    const input = metadata.parse(raw);
    if (input.mimeType !== type) invalid();
    const extension = imageExtension(bytes,type), hash = createHash('sha256').update(bytes).digest('hex');
    return this.content.once(actor,'content:media',key,{ metadata:input,hash },() => {
      const size = this.content.store.db.prepare('SELECT coalesce(sum(length(bytes)),0) AS n FROM cs_content_image_bytes').get() as { n:number };
      if (size.n + bytes.length > 256 * 1024 * 1024) throw new ServiceError(429,'MEDIA_QUOTA','The private image storage limit has been reached.');
      const id = randomUUID();
      const image = c.mediaSchema.parse({ id,src:'/images/transmissions/' + input.slug + '/' + id + '.' + extension,previewUrl:'/api/admin/v1/content/media/' + id,fileName:input.fileName,mimeType:type,kind:'image' });
      this.content.store.db.prepare('INSERT INTO cs_content_image_bytes VALUES (?,?)').run(id,bytes);
      this.content.store.put('content_media',id,'website',image); return image;
    });
  }
  read(actor:Actor,id:string):PrivateContentImage {
    authorize(actor,'content:read');
    const image = this.content.store.record<z.infer<typeof c.mediaSchema>>('content_media',id);
    const row = this.content.store.db.prepare('SELECT bytes FROM cs_content_image_bytes WHERE id=?').get(id) as { bytes:Uint8Array }|undefined;
    if (!image || !row) throw new ServiceError(404,'IMAGE_MISSING','Private image not found.');
    return new PrivateContentImage(image.mimeType,Buffer.from(row.bytes));
  }
}
