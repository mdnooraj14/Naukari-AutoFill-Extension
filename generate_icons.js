/**
 * Generates PNG icons for the Naukri AutoFill Chrome Extension.
 * Uses only Node.js built-in modules (zlib, fs) — no npm install needed.
 * Run: node generate_icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR);

// ── PNG writer ──────────────────────────────────────────────────────────
function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(crcInput))]);
}

function createPNG(size, drawFn) {
  // RGBA pixel array
  const pixels = new Uint8Array(size * size * 4);

  // Fill transparent initially
  pixels.fill(0);

  // Helper: set pixel
  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]     = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }

  // Helper: fill circle
  function fillCircle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= radius) setPixel(x, y, r, g, b, a);
      }
    }
  }

  // Helper: fill rect
  function fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        setPixel(x, y, r, g, b, a);
  }

  // Helper: gradient fill circle
  function gradientCircle(cx, cy, radius) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= radius) {
          const t = (x / size); // gradient left→right
          // #4f46e5 → #7c3aed
          const r = Math.round(79  + (124 - 79)  * t);
          const g = Math.round(70  + (58  - 70)  * t);
          const b = Math.round(229 + (237 - 229) * t);
          setPixel(x, y, r, g, b, 255);
        }
      }
    }
  }

  drawFn({ setPixel, fillCircle, fillRect, gradientCircle, size });

  // Build raw PNG data: each row prefixed with filter byte 0
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    rawRows.push(0); // filter type: None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rawRows.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const rawBuf = Buffer.from(rawRows);
  const compressed = zlib.deflateSync(rawBuf);

  // PNG chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(size, 0);    // width
  ihdrData.writeUInt32BE(size, 4);    // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Draw the icon: purple circle with white robot/bot symbol ───────────────
function drawIcon({ gradientCircle, fillRect, fillCircle, setPixel, size }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 1;

  // Background gradient circle
  gradientCircle(cx, cy, radius);

  // Draw a simplified robot/bot face in white
  const s = size / 16; // scale unit

  // Head rectangle (white)
  const headX1 = Math.round(cx - 5 * s);
  const headY1 = Math.round(cy - 4 * s);
  const headX2 = Math.round(cx + 5 * s);
  const headY2 = Math.round(cy + 4 * s);
  fillRect(headX1, headY1, headX2, headY2, 255, 255, 255, 220);

  // Left eye (purple)
  fillCircle(Math.round(cx - 2.2 * s), Math.round(cy - 1 * s), Math.round(1.2 * s), 79, 70, 229, 255);

  // Right eye
  fillCircle(Math.round(cx + 2.2 * s), Math.round(cy - 1 * s), Math.round(1.2 * s), 79, 70, 229, 255);

  // Mouth bar
  fillRect(Math.round(cx - 2.5 * s), Math.round(cy + 1.5 * s), Math.round(cx + 2.5 * s), Math.round(cy + 2.5 * s), 79, 70, 229, 255);

  // Antenna
  fillRect(Math.round(cx - 0.7 * s), Math.round(headY1 - 3 * s), Math.round(cx + 0.7 * s), Math.round(headY1), 255, 255, 255, 220);
  fillCircle(Math.round(cx), Math.round(headY1 - 3 * s), Math.round(1.2 * s), 255, 220, 50, 255);
}

// ── Generate all sizes ─────────────────────────────────────────────────────
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const png = createPNG(size, drawIcon);
  const outPath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✅ Created: icons/icon${size}.png (${png.length} bytes)`);
});

console.log('\n🎉 All icons generated successfully in the icons/ folder!');
