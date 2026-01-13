import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

// Simple PNG icon generator using raw bytes
// Creates solid blue icons (no external dependencies)

const sizes = [16, 32, 48, 128];
const outputDir = 'src/icons';

mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  const png = createPNG(size, [59, 130, 246]); // #3b82f6 blue
  writeFileSync(join(outputDir, `icon-${size}.png`), png);
  console.log(`Created icon-${size}.png`);
}

function createPNG(size, rgb) {
  // Create raw pixel data (RGBA)
  const rawData = Buffer.alloc(size * size * 4 + size); // +size for filter bytes

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0; // Filter byte (none)

    for (let x = 0; x < size; x++) {
      const pixelStart = rowStart + 1 + x * 4;
      rawData[pixelStart] = rgb[0];     // R
      rawData[pixelStart + 1] = rgb[1]; // G
      rawData[pixelStart + 2] = rgb[2]; // B
      rawData[pixelStart + 3] = 255;    // A
    }
  }

  const compressed = deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = createChunk('IHDR', Buffer.concat([
    uint32BE(size),  // width
    uint32BE(size),  // height
    Buffer.from([8, 6, 0, 0, 0]), // bit depth, color type (RGBA), compression, filter, interlace
  ]));

  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = uint32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function uint32BE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return uint32BE((crc ^ 0xFFFFFFFF) >>> 0);
}
