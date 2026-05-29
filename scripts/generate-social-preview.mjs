import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const WIDTH = 1200;
const HEIGHT = 630;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const publicDir = join(rootDir, 'public');
const previewPath = join(publicDir, 'social-preview-v1.png');
const logoSourcePath = join(rootDir, 'logo.png');
const logoPublicPath = join(publicDir, 'logo.png');
const dryRun = process.argv.includes('--dry-run');

if (!dryRun) {
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(logoSourcePath, logoPublicPath);
}

const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

const font = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '.': ['000', '000', '000', '000', '000', '110', '110'],
  ':': ['000', '110', '110', '000', '110', '110', '000'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
};

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function blendPixel(x, y, color) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (Math.trunc(y) * WIDTH + Math.trunc(x)) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  pixels[index] = clamp(color[0] * alpha + pixels[index] * inverse);
  pixels[index + 1] = clamp(color[1] * alpha + pixels[index + 1] * inverse);
  pixels[index + 2] = clamp(color[2] * alpha + pixels[index + 2] * inverse);
  pixels[index + 3] = 255;
}

function setPixel(x, y, color) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3] ?? 255;
}

function fillRect(x, y, width, height, color) {
  const xStart = Math.max(0, Math.trunc(x));
  const yStart = Math.max(0, Math.trunc(y));
  const xEnd = Math.min(WIDTH, Math.trunc(x + width));
  const yEnd = Math.min(HEIGHT, Math.trunc(y + height));

  for (let yy = yStart; yy < yEnd; yy += 1) {
    for (let xx = xStart; xx < xEnd; xx += 1) {
      blendPixel(xx, yy, color);
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) blendPixel(x, y, color);
    }
  }
}

function drawGlowLine(x1, y1, x2, y2, color, width, alpha) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(length);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = mix(x1, x2, t);
    const y = mix(y1, y2, t);
    fillCircle(x, y, width, [color[0], color[1], color[2], alpha]);
  }
}

function drawLine(x1, y1, x2, y2, color, width = 1) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(length);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fillCircle(mix(x1, x2, t), mix(y1, y2, t), width / 2, color);
  }
}

function drawRect(x, y, width, height, color, strokeWidth = 1) {
  fillRect(x, y, width, strokeWidth, color);
  fillRect(x, y + height - strokeWidth, width, strokeWidth, color);
  fillRect(x, y, strokeWidth, height, color);
  fillRect(x + width - strokeWidth, y, strokeWidth, height, color);
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawBackground() {
  const random = mulberry32(424242);

  for (let y = 0; y < HEIGHT; y += 1) {
    const vertical = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const warmDistance = Math.hypot((x - 230) / 680, (y - 520) / 420);
      const blueDistance = Math.hypot((x - 940) / 540, (y - 250) / 340);
      const warm = Math.max(0, 1 - warmDistance);
      const blue = Math.max(0, 1 - blueDistance);
      const grain = (random() - 0.5) * 10;

      const r = mix(4, 15, vertical) + warm * 70 + blue * 10 + grain;
      const g = mix(3, 21, vertical) + warm * 30 + blue * 48 + grain;
      const b = mix(10, 14, vertical) + warm * 8 + blue * 88 + grain;
      setPixel(x, y, [clamp(r), clamp(g), clamp(b), 255]);
    }
  }

  for (let i = 0; i < 520; i += 1) {
    const x = Math.floor(random() * WIDTH);
    const y = Math.floor(random() * HEIGHT);
    const size = 1 + Math.floor(random() * 3);
    const color = i % 5 === 0 ? [232, 160, 32, 70] : i % 7 === 0 ? [58, 184, 255, 62] : [240, 236, 224, 44];
    fillCircle(x, y, size, color);
  }

  for (let y = 0; y < HEIGHT; y += 6) {
    fillRect(0, y, WIDTH, 1, [240, 236, 224, 18]);
  }
}

function drawMeteors() {
  const meteors = [
    [140, 36, -120, 146, 11],
    [930, 20, 600, 158, 14],
    [650, 88, 430, 180, 8],
    [1030, 190, 850, 266, 7],
  ];

  for (const [x1, y1, x2, y2, width] of meteors) {
    drawGlowLine(x1, y1, x2, y2, [255, 85, 24], width * 2.8, 25);
    drawGlowLine(x1, y1, x2, y2, [255, 85, 24], width * 1.4, 70);
    drawLine(x1, y1, x2, y2, [255, 210, 106, 230], 2);
  }
}

function drawTerrain() {
  const points = [
    [0, 500], [130, 460], [250, 486], [355, 438], [500, 474],
    [620, 420], [750, 470], [875, 438], [1040, 488], [1200, 448],
  ];

  for (let x = 0; x < WIDTH; x += 1) {
    let y = 500;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      if (x >= x1 && x <= x2) {
        y = mix(y1, y2, (x - x1) / (x2 - x1));
        break;
      }
    }
    fillRect(x, y, 1, HEIGHT - y, [4, 3, 10, 236]);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    drawLine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], [232, 160, 32, 120], 2);
  }

  fillCircle(595, 510, 210, [232, 160, 32, 36]);
  fillRect(375, 508, 440, 7, [232, 160, 32, 82]);
}

function glyphFor(character) {
  return font[character] ?? font[' '];
}

function textWidth(text, scale) {
  let width = 0;
  for (const character of text) {
    width += (glyphFor(character)[0].length + 1) * scale;
  }
  return width - scale;
}

function drawText(text, x, y, scale, color, options = {}) {
  const align = options.align ?? 'left';
  const upper = text.toUpperCase();
  let cursorX = align === 'center' ? x - textWidth(upper, scale) / 2 : x;
  const block = Math.max(1, scale - Math.ceil(scale / 6));
  const colorAt = typeof color === 'function' ? color : () => color;

  for (let index = 0; index < upper.length; index += 1) {
    const glyph = glyphFor(upper[index]);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') {
          fillRect(cursorX + col * scale, y + row * scale, block, block, colorAt(row, col, index));
        }
      }
    }
    cursorX += (glyph[0].length + 1) * scale;
  }
}

function drawOutlinedText(text, x, y, scale, fill, options = {}) {
  const align = options.align ?? 'left';
  const shadow = options.shadow ?? [0, 0, 0, 185];
  const offsets = [
    [-3, 0], [3, 0], [0, -3], [0, 3], [5, 5],
  ];
  for (const [dx, dy] of offsets) {
    drawText(text, x + dx, y + dy, scale, shadow, { align });
  }
  drawText(text, x, y, scale, fill, { align });
}

function drawUiFrame() {
  drawRect(42, 38, 1116, 554, [232, 160, 32, 145], 3);
  drawRect(62, 58, 1076, 514, [58, 184, 255, 82], 1);

  const corner = [232, 160, 32, 218];
  drawLine(42, 38, 142, 38, corner, 5);
  drawLine(42, 38, 42, 138, corner, 5);
  drawLine(1158, 38, 1058, 38, corner, 5);
  drawLine(1158, 38, 1158, 138, corner, 5);
  drawLine(42, 592, 142, 592, corner, 5);
  drawLine(42, 592, 42, 492, corner, 5);
  drawLine(1158, 592, 1058, 592, corner, 5);
  drawLine(1158, 592, 1158, 492, corner, 5);

  fillRect(78, 82, 325, 118, [4, 3, 10, 92]);
  drawRect(78, 82, 325, 118, [58, 184, 255, 112], 1);
  drawText('> SURFACE SCAN', 98, 102, 3, [58, 184, 255, 230]);
  drawText('ATMOSPHERE .... NOMINAL', 98, 133, 2, [154, 139, 102, 205]);
  drawText('ANOMALY INDEX . CRITICAL', 98, 163, 2, [255, 85, 24, 230]);

  fillRect(810, 82, 315, 118, [4, 3, 10, 86]);
  drawRect(810, 82, 315, 118, [232, 160, 32, 120], 1);
  drawText('BUNKER_OS V2.1', 830, 104, 4, [232, 160, 32, 238]);
  drawText('LIMITED ACCESS // OPEN FILE', 834, 150, 2, [154, 139, 102, 210]);

  drawGlowLine(262, 548, 938, 548, [232, 160, 32], 3, 150);
  drawText('THUNDERROCK424242.GITHUB.IO/WILDERNESS-ODYSSEY', 92, 562, 3, [154, 139, 102, 210]);
}

function drawBrand() {
  const greenGradient = (row) => {
    const t = row / 6;
    return [clamp(mix(129, 235, t)), clamp(mix(219, 255, t)), clamp(mix(53, 112, t)), 248];
  };
  const goldGradient = (row) => {
    const t = row / 6;
    return [clamp(mix(255, 228, t)), clamp(mix(225, 116, t)), clamp(mix(86, 40, t)), 250];
  };

  drawOutlinedText('WILDERNESS', WIDTH / 2, 98, 12, greenGradient, { align: 'center', shadow: [1, 2, 1, 210] });
  drawOutlinedText('ODYSSEY', WIDTH / 2, 194, 15, goldGradient, { align: 'center', shadow: [1, 2, 1, 220] });
  drawOutlinedText('THE WORLD REBORN', WIDTH / 2, 338, 8, [240, 236, 224, 248], { align: 'center', shadow: [0, 0, 0, 210] });
  drawText('50 YEARS POST-IMPACT // ALPHA SURVIVAL MODPACK', WIDTH / 2, 432, 4, [232, 160, 32, 245], { align: 'center' });
  drawText('WAKE IN THE BUNKER. CROSS THE RECLAIMED WILDERNESS. SURVIVE THE ANOMALY.', WIDTH / 2, 482, 3, [154, 139, 102, 220], { align: 'center' });
}

function writePng(path) {
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowStart = y * (WIDTH * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, y * WIDTH * 4, WIDTH * 4).copy(raw, rowStart + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  if (!dryRun) {
    writeFileSync(path, png);
  }

  return png;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

drawBackground();
drawMeteors();
drawTerrain();
drawUiFrame();
drawBrand();
const png = writePng(previewPath);

console.log(`${dryRun ? 'Prepared' : 'Generated'} ${previewPath} (${Math.round(png.length / 1024)} KB)`);
