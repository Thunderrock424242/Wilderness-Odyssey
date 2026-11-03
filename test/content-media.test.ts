import assert from 'node:assert/strict';
import test from 'node:test';
import { imageExtension } from '../src/connected/contentMedia';

test('PNG upload rejects an IHDR and IEND without image data', () => {
  const bytes = Buffer.alloc(45);
  Buffer.from('89504e470d0a1a0a','hex').copy(bytes);
  bytes.writeUInt32BE(13,8); bytes.write('IHDR',12);
  bytes.writeUInt32BE(1,16); bytes.writeUInt32BE(1,20);
  bytes.write('IEND',37);
  assert.throws(() => imageExtension(bytes,'image/png'),/valid PNG/);
});
