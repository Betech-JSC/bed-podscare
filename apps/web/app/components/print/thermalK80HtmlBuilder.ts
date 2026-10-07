/**
 * thermalK80HtmlBuilder.ts
 * Module tạo mã HTML độc lập cho máy in nhiệt cuộn 80mm (K80).
 * Hỗ trợ in 2 liên tự động ngắt trang (Auto-Cut) cho máy in POS (Xprinter, Epson...).
 * Liên 1: Bản giao khách hàng (đầy đủ bảng checklist, giá dự kiến, mã QR tra cứu realtime, chữ ký).
 * Liên 2: Bản lưu cửa hàng & Kỹ thuật dán khay (bảo mật tuyệt đối giá tiền, mã phiếu to rõ, barcode).
 * 100% TypeScript thuần, không chứa React JSX, tương thích hoàn toàn với Node.js test runner.
 */

import type { RepairOrder } from '@podscare/types';

// ==========================================
// 1. BARCODE CODE 128 (SUBSET B) GENERATOR
// ==========================================

const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106
];

const CODE128_START_B = 104;
const CODE128_STOP = 106;

interface BarcodeOptions {
  height?: number;
  barWidth?: number;
  showText?: boolean;
  fontSize?: number;
}

function generateBarcodeSVG(code: string, options: BarcodeOptions = {}): string {
  const height = options.height ?? 40;
  const barWidth = options.barWidth ?? 1.5;
  const showText = options.showText ?? true;
  const fontSize = options.fontSize ?? 10;
  const textHeight = showText ? fontSize + 4 : 0;
  const quietZoneModules = 10;

  const cleanCode = (code || '').split('').filter((c) => {
    const codePoint = c.charCodeAt(0);
    return codePoint >= 32 && codePoint <= 126;
  }).join('');

  if (!cleanCode) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${height}"></svg>`;
  }

  const indices: number[] = [CODE128_START_B];
  let checksum = CODE128_START_B;

  for (let i = 0; i < cleanCode.length; i++) {
    const val = cleanCode.charCodeAt(i) - 32;
    indices.push(val);
    checksum += (i + 1) * val;
  }

  const checkDigit = checksum % 103;
  indices.push(checkDigit);
  indices.push(CODE128_STOP);

  const widths: number[] = [];
  for (const idx of indices) {
    const pattern = CODE128_PATTERNS[idx];
    if (pattern) {
      for (let j = 0; j < pattern.length; j++) {
        widths.push(parseInt(pattern[j], 10));
      }
    }
  }

  const totalModules = widths.reduce((sum, w) => sum + w, 0) + quietZoneModules * 2;
  const totalSvgWidth = totalModules * barWidth;
  const totalSvgHeight = height + textHeight;

  let currentX = quietZoneModules * barWidth;
  const rects: string[] = [];

  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * barWidth;
    if (i % 2 === 0) {
      rects.push(`<rect x="${currentX.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`);
    }
    currentX += w;
  }

  const textElement = showText
    ? `<text x="${(totalSvgWidth / 2).toFixed(2)}" y="${(height + fontSize + 1).toFixed(2)}" font-family="monospace, monospace" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="#000000" letter-spacing="1.2">${cleanCode}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth.toFixed(2)} ${totalSvgHeight.toFixed(2)}" width="${totalSvgWidth.toFixed(2)}" height="${totalSvgHeight.toFixed(2)}" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="#ffffff" />
    ${rects.join('\n    ')}
    ${textElement}
  </svg>`;
}

// ==========================================
// 2. QR CODE MATRIX GENERATOR (ZERO DEPENDENCY)
// ==========================================

interface QRCodeOptions {
  size?: number;
  margin?: number;
}

class MinimalQRCode {
  version: number;
  moduleCount: number;
  modules: (boolean | null)[][];

  constructor(version: number) {
    this.version = version;
    this.moduleCount = version * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () =>
      Array(this.moduleCount).fill(null)
    );
  }

  isDark(row: number, col: number): boolean {
    return this.modules[row]?.[col] === true;
  }

  setupPositionProbePattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        if (
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4)
        ) {
          this.modules[row + r][col + c] = true;
        } else {
          this.modules[row + r][col + c] = false;
        }
      }
    }
  }

  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] !== null) continue;
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] !== null) continue;
      this.modules[6][c] = c % 2 === 0;
    }
  }

  setupPositionAdjustPattern() {
    const pos = MinimalQRCode.getAlignmentPatternPositions(this.version);
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (
              r === -2 ||
              r === 2 ||
              c === -2 ||
              c === 2 ||
              (r === 0 && c === 0)
            ) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  }

  setupTypeNumber(test: boolean) {
    if (this.version < 7) return;
    const bits = MinimalQRCode.getBCHTypeNumber(this.version);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
      this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (0 << 3) | maskPattern;
    const bits = MinimalQRCode.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) {
        this.modules[i][8] = mod;
      } else if (i < 8) {
        this.modules[i + 1][8] = mod;
      } else {
        this.modules[this.moduleCount - 15 + i][8] = mod;
      }

      if (i < 8) {
        this.modules[8][this.moduleCount - i - 1] = mod;
      } else if (i < 9) {
        this.modules[8][15 - i - 1 + 1] = mod;
      } else {
        this.modules[8][15 - i - 1] = mod;
      }
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }

  mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;

    const maskFn = MinimalQRCode.getMaskFunction(maskPattern);

    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            }
            const mask = maskFn(row, col - c);
            if (mask) {
              dark = !dark;
            }
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  static getMaskFunction(maskPattern: number): (r: number, c: number) => boolean {
    switch (maskPattern) {
      case 0: return (r, c) => (r + c) % 2 === 0;
      case 1: return (r) => r % 2 === 0;
      case 2: return (_, c) => c % 3 === 0;
      case 3: return (r, c) => (r + c) % 3 === 0;
      case 4: return (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return () => false;
    }
  }

  static getAlignmentPatternPositions(version: number): number[] {
    const table: Record<number, number[]> = {
      1: [],
      2: [6, 18],
      3: [6, 22],
      4: [6, 26],
      5: [6, 30],
      6: [6, 34],
      7: [6, 22, 38],
      8: [6, 24, 42],
      9: [6, 26, 46],
      10: [6, 28, 50],
    };
    return table[version] || [];
  }

  static getBCHTypeInfo(data: number): number {
    let d = data << 10;
    while (MinimalQRCode.getBCHDigit(d) - MinimalQRCode.getBCHDigit(1335) >= 0) {
      d ^= 1335 << (MinimalQRCode.getBCHDigit(d) - MinimalQRCode.getBCHDigit(1335));
    }
    return ((data << 10) | d) ^ 21522;
  }

  static getBCHTypeNumber(data: number): number {
    let d = data << 12;
    while (MinimalQRCode.getBCHDigit(d) - MinimalQRCode.getBCHDigit(7973) >= 0) {
      d ^= 7973 << (MinimalQRCode.getBCHDigit(d) - MinimalQRCode.getBCHDigit(7973));
    }
    return (data << 12) | d;
  }

  static getBCHDigit(data: number): number {
    let digit = 0;
    while (data !== 0) {
      digit++;
      data >>>= 1;
    }
    return digit;
  }
}

const EC_M_DATA_CAPACITY: Record<number, number> = {
  1: 16, 2: 28, 3: 44, 4: 64, 5: 86,
  6: 108, 7: 124, 8: 154, 9: 182, 10: 216,
};

const EC_M_SPECS: Record<number, [number, number, number, number, number, number, number]> = {
  1: [26, 16, 10, 1, 16, 0, 0],
  2: [44, 28, 16, 1, 28, 0, 0],
  3: [70, 44, 26, 1, 44, 0, 0],
  4: [100, 64, 18, 2, 32, 0, 0],
  5: [134, 86, 24, 2, 43, 0, 0],
  6: [172, 108, 16, 4, 27, 0, 0],
  7: [196, 124, 18, 4, 31, 0, 0],
  8: [242, 154, 22, 2, 38, 2, 39],
  9: [292, 182, 22, 3, 36, 2, 37],
  10: [346, 216, 26, 4, 43, 1, 44],
};

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], factor);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function calculateReedSolomon(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const result = new Uint8Array(ecLength);

  for (let i = 0; i < data.length; i++) {
    const feedback = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[ecLength - 1] = 0;
    if (feedback !== 0) {
      for (let j = 0; j < ecLength; j++) {
        result[j] ^= gfMul(gen[gen.length - 2 - j], feedback);
      }
    }
  }
  return result;
}

function buildQRMatrix(text: string): boolean[][] {
  const utf8Bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let charcode = text.charCodeAt(i);
    if (charcode < 0x80) {
      utf8Bytes.push(charcode);
    } else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  let version = 1;
  while (version <= 10) {
    const cap = EC_M_DATA_CAPACITY[version];
    const headerBits = 4 + (version < 10 ? 8 : 16);
    const totalDataBits = headerBits + utf8Bytes.length * 8;
    if (Math.ceil(totalDataBits / 8) <= cap) {
      break;
    }
    version++;
  }
  if (version > 10) version = 10;

  const maxDataWords = EC_M_DATA_CAPACITY[version];
  const bufferBits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bufferBits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(utf8Bytes.length, version < 10 ? 8 : 16);
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }

  const terminatorLen = Math.min(4, maxDataWords * 8 - bufferBits.length);
  for (let i = 0; i < terminatorLen; i++) bufferBits.push(0);

  while (bufferBits.length % 8 !== 0) {
    bufferBits.push(0);
  }

  const dataWords: number[] = [];
  for (let i = 0; i < bufferBits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bufferBits[i + b];
    }
    dataWords.push(byte);
  }

  let padToggle = false;
  while (dataWords.length < maxDataWords) {
    dataWords.push(padToggle ? 0x11 : 0xec);
    padToggle = !padToggle;
  }

  const spec = EC_M_SPECS[version];
  const [, , ecWordsPerBlock, numBlocks1, dataWords1, numBlocks2, dataWords2] = spec;

  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks1; b++) {
    const slice = new Uint8Array(dataWords.slice(offset, offset + dataWords1));
    offset += dataWords1;
    const ec = calculateReedSolomon(slice, ecWordsPerBlock);
    blocks.push({ data: slice, ec });
  }

  for (let b = 0; b < numBlocks2; b++) {
    const slice = new Uint8Array(dataWords.slice(offset, offset + dataWords2));
    offset += dataWords2;
    const ec = calculateReedSolomon(slice, ecWordsPerBlock);
    blocks.push({ data: slice, ec });
  }

  const interleaved: number[] = [];
  const maxBlockDataLen = Math.max(dataWords1, dataWords2);
  for (let i = 0; i < maxBlockDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) {
        interleaved.push(b.data[i]);
      }
    }
  }

  for (let i = 0; i < ecWordsPerBlock; i++) {
    for (const b of blocks) {
      if (i < b.ec.length) {
        interleaved.push(b.ec[i]);
      }
    }
  }

  const qr = new MinimalQRCode(version);
  qr.setupPositionProbePattern(0, 0);
  qr.setupPositionProbePattern(qr.moduleCount - 7, 0);
  qr.setupPositionProbePattern(0, qr.moduleCount - 7);
  qr.setupPositionAdjustPattern();
  qr.setupTimingPattern();
  qr.setupTypeInfo(true, 0);
  qr.setupTypeNumber(true);

  qr.mapData(interleaved, 0);
  qr.setupTypeInfo(false, 0);
  qr.setupTypeNumber(false);

  const matrix: boolean[][] = [];
  for (let r = 0; r < qr.moduleCount; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < qr.moduleCount; c++) {
      row.push(qr.isDark(r, c));
    }
    matrix.push(row);
  }

  return matrix;
}

function generateQRCodeSVG(data: string, options: QRCodeOptions = {}): string {
  const margin = options.margin ?? 2;
  const size = options.size ?? 120;

  if (!data) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"></svg>`;
  }

  const matrix = buildQRMatrix(data);
  const n = matrix.length;
  const totalCells = n + margin * 2;

  const pathParts: string[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        pathParts.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }

  const pathData = pathParts.join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalCells} ${totalCells}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalCells}" height="${totalCells}" fill="#ffffff" />
    <path d="${pathData}" fill="#000000" />
  </svg>`;
}

// ==========================================
// 3. LOGOS & HELPERS
// ==========================================

export const FIXO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36">
  <rect width="100" height="100" rx="20" fill="#000000" />
  <!-- F: vát cong & stem bo tròn -->
  <path d="M 8.5 40.5 C 8.5 37.5 10.5 35.5 13.5 35.5 H 24.5 C 28 35.5 30 38 28.5 41 C 26 45 22.5 47 16.5 47.5 H 14.5 V 49.5 H 22 C 24.5 49.5 26.5 51.5 25.5 54 C 24 57 21 59 16 59.5 H 14.5 V 61.5 C 14.5 63 13.2 64.5 11.5 64.5 C 9.8 64.5 8.5 63 8.5 61.5 Z" fill="#ffffff" />
  <!-- I: thanh bo góc -->
  <rect x="31" y="35.5" width="6.5" height="29" rx="3.2" fill="#ffffff" />
  <!-- X: hai thanh chéo cắt nhau -->
  <path d="M 40.5 38.5 C 39.5 36.5 41 35.5 43 35.5 L 46.5 35.5 C 48 35.5 49.5 36.5 50.5 38 L 62.5 59.5 C 63.5 61.5 62 64.5 59.5 64.5 L 56 64.5 C 54.5 64.5 53 63.5 52 62 Z" fill="#ffffff" />
  <path d="M 42.5 61.5 C 41.5 63.5 43 64.5 45 64.5 L 48.5 64.5 C 50 64.5 51.5 63.5 52.5 62 L 64.5 40.5 C 65.5 38.5 64 35.5 61.5 35.5 L 58 35.5 C 56.5 35.5 55 36.5 54 38 Z" fill="#ffffff" />
  <!-- O: biểu tượng cờ lê nghiêng 45 độ -->
  <g transform="translate(80, 50) rotate(-45)">
    <path fill-rule="evenodd" d="M 0 -14.5 A 14.5 14.5 0 1 1 -11 -9.5 L -14.5 -9.5 A 14.5 14.5 0 0 1 0 -14.5 Z M 0 -8.5 A 8.5 8.5 0 1 0 0 8.5 A 8.5 8.5 0 0 0 0 -8.5 Z" fill="#ffffff" />
    <path d="M -14.5 -1.6 H -2 C -3.5 -3.5 -2.5 -6 0.5 -6 C 2.5 -6 4.5 -4.5 5.5 -2.5 L 2.5 -1.2 C 1.8 -1.8 0.8 -1.8 0.2 -1.2 C -0.5 -0.5 -0.5 0.5 0.2 1.2 C 0.8 1.8 1.8 1.8 2.5 1.2 L 5.5 2.5 C 4.5 4.5 2.5 6 0.5 6 C -2.5 6 -3.5 3.5 -2 1.6 H -14.5 Z" fill="#ffffff" />
  </g>
</svg>`;

export const FIXO_LOGO_A4_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="34" height="34">
  <rect width="100" height="100" rx="18" fill="#176b58" />
  <!-- F: vát cong & stem bo tròn -->
  <path d="M 8.5 40.5 C 8.5 37.5 10.5 35.5 13.5 35.5 H 24.5 C 28 35.5 30 38 28.5 41 C 26 45 22.5 47 16.5 47.5 H 14.5 V 49.5 H 22 C 24.5 49.5 26.5 51.5 25.5 54 C 24 57 21 59 16 59.5 H 14.5 V 61.5 C 14.5 63 13.2 64.5 11.5 64.5 C 9.8 64.5 8.5 63 8.5 61.5 Z" fill="#10b981" />
  <!-- I: thanh bo góc -->
  <rect x="31" y="35.5" width="6.5" height="29" rx="3.2" fill="#ffffff" />
  <!-- X: hai thanh chéo cắt nhau -->
  <path d="M 40.5 38.5 C 39.5 36.5 41 35.5 43 35.5 L 46.5 35.5 C 48 35.5 49.5 36.5 50.5 38 L 62.5 59.5 C 63.5 61.5 62 64.5 59.5 64.5 L 56 64.5 C 54.5 64.5 53 63.5 52 62 Z" fill="#10b981" />
  <path d="M 42.5 61.5 C 41.5 63.5 43 64.5 45 64.5 L 48.5 64.5 C 50 64.5 51.5 63.5 52.5 62 L 64.5 40.5 C 65.5 38.5 64 35.5 61.5 35.5 L 58 35.5 C 56.5 35.5 55 36.5 54 38 Z" fill="#ffffff" />
  <!-- O: biểu tượng cờ lê nghiêng 45 độ -->
  <g transform="translate(80, 50) rotate(-45)">
    <path fill-rule="evenodd" d="M 0 -14.5 A 14.5 14.5 0 1 1 -11 -9.5 L -14.5 -9.5 A 14.5 14.5 0 0 1 0 -14.5 Z M 0 -8.5 A 8.5 8.5 0 1 0 0 8.5 A 8.5 8.5 0 0 0 0 -8.5 Z" fill="#ffffff" />
    <path d="M -14.5 -1.6 H -2 C -3.5 -3.5 -2.5 -6 0.5 -6 C 2.5 -6 4.5 -4.5 5.5 -2.5 L 2.5 -1.2 C 1.8 -1.8 0.8 -1.8 0.2 -1.2 C -0.5 -0.5 -0.5 0.5 0.2 1.2 C 0.8 1.8 1.8 1.8 2.5 1.2 L 5.5 2.5 C 4.5 4.5 2.5 6 0.5 6 C -2.5 6 -3.5 3.5 -2 1.6 H -14.5 Z" fill="#ffffff" />
  </g>
</svg>`;

export function formatMoney(n?: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

export type ThermalK80SlipMode = 'dual' | 'customer_only' | 'store_only' | 'routing';
export type K80SlipMode = ThermalK80SlipMode;

export interface TenantReceiptBranding {
  logoUrl?: string | null;
  storeLogoUrl?: string | null;
  storeName?: string;
  hotline?: string | null;
  storeHotline?: string | null;
  footerNote?: string | null;
  receiptFooterNote?: string | null;
}

export interface ThermalK80RenderOptions {
  origin?: string;
  isRoutingSlip?: boolean;
  slipMode?: ThermalK80SlipMode; // Mặc định là 'dual'
  branding?: TenantReceiptBranding;
}

/**
 * Xây dựng nội dung Liên 1: Bản giao khách hàng giữ (Customer Copy).
 * Chứa logo FIXO, chi nhánh, hotline, barcode, thông tin khách, thiết bị,
 * bảng kiểm tra tại quầy, giá dự kiến, mã QR tra cứu realtime, 2 chữ ký và lưu ý bảo hành.
 * Cuối liên có đệm đẩy giấy 15mm và vạch chỉ dẫn cắt giấy.
 */
export function buildCustomerCopyHtml(order: RepairOrder, origin?: string, branding?: TenantReceiptBranding): string {
  const currentOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${order.id}`;

  const effectiveLogoUrl = branding?.logoUrl || branding?.storeLogoUrl || (order as any).tenant?.logo_url;
  const effectiveStoreName = branding?.storeName || (order as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = order.branch || branding?.storeName || (order as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = branding?.hotline || branding?.storeHotline || (order as any).tenant?.hotline || '1900.6868 · fixo.vn';
  const effectiveFooterNote = branding?.footerNote || branding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note || '* Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!';

  const barcodeSvg = generateBarcodeSVG(order.id, {
    height: 36,
    barWidth: 1.35,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 96,
    margin: 1,
  });

  const checks = Array.isArray(order.checks) ? order.checks : [];
  const checksHtml =
    checks.length > 0
      ? `
      <div class="k80-section">
        <div class="k80-section-title">KIỂM TRA CHỨC NĂNG TẠI QUẦY</div>
        <table class="k80-table">
          ${checks
            .map(
              (c) => `
            <tr>
              <td class="td-label">${c.label}</td>
              <td class="td-status ${
                c.status === 'Hoạt động'
                  ? 'status-pass'
                  : c.status === 'Lỗi'
                  ? 'status-fail'
                  : 'status-na'
              }">${c.status}</td>
            </tr>`
            )
            .join('')}
        </table>
        ${order.testNote ? `<div class="k80-test-note"><b>Ghi chú:</b> ${order.testNote}</div>` : ''}
      </div>`
      : '';

  const additionalServices = (order.additional_services || (order as any).additionalServices || []) as any[];
  const hasAdditional = Array.isArray(additionalServices) && additionalServices.length > 0;
  const initialPriceVal = order.initial_price !== undefined && order.initial_price !== null
    ? order.initial_price
    : (order as any).initialPrice !== undefined && (order as any).initialPrice !== null
    ? (order as any).initialPrice
    : order.price;
  const totalPriceVal = order.total_price !== undefined && order.total_price !== null ? order.total_price : order.price;

  return `<div class="k80-wrapper k80-customer-copy">
    <div class="k80-header">
      ${effectiveLogoUrl ? `
      <div style="text-align: center; margin-bottom: 3px;">
        <img src="${effectiveLogoUrl}" class="k80-store-logo" alt="Logo" onerror="this.style.display='none'" />
      </div>
      <div class="k80-brand">${effectiveStoreName}</div>
      <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
      ` : `
      <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
        ${FIXO_LOGO_SVG}
        <div style="text-align: left;">
          <div class="k80-brand">FIXO REPAIR OS</div>
          <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
        </div>
      </div>
      `}
      <div class="k80-branch-info">
        <b>Chi nhánh:</b> ${effectiveBranch}
      </div>
      <div class="k80-branch-info">
        <b>Hotline CSKH:</b> ${effectiveHotline}
      </div>
    </div>

    <div class="k80-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ PHIẾU TIẾP NHẬN</div>
      <div class="k80-order-code">${order.id}</div>
      <div class="k80-barcode">
        ${barcodeSvg}
      </div>
    </div>

    <div class="k80-meta">
      <span>Ngày nhận: <b>${order.date || 'Hôm nay'}</b></span>
      <span>NV: <b>${order.createdBy || 'FIXO'}</b></span>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${order.name || 'Khách lẻ'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Số điện thoại:</span>
        <span class="k80-val">${order.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${((order as any).order_type === 'cod' || (order as any).orderType === 'cod') ? 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)' : 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'}</div>
      <div class="k80-row">
        <span class="k80-label">Thiết bị:</span>
        <span class="k80-val">${order.device || 'Thiết bị Apple'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Serial / Model:</span>
        <span class="k80-val">${order.serial || 'Chưa cập nhật'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Phụ kiện:</span>
        <span class="k80-val">${order.accessories || 'Không gửi kèm'}</span>
      </div>
      ${order.appearance ? `
      <div class="k80-row">
        <span class="k80-label">Ngoại hình:</span>
        <span class="k80-val">${order.appearance}</span>
      </div>` : ''}
    </div>

    <div class="k80-section">
      <div class="k80-section-title">LỖI KHÁCH BÁO TIẾP NHẬN</div>
      <div class="k80-issue-box">${order.issue || 'Kiểm tra tổng quát'}</div>
    </div>

    ${checksHtml}

    ${hasAdditional ? `
    <div class="k80-section" style="margin-top: 4px; padding-top: 3px; border-top: 1px dashed #000;">
      <div class="k80-section-title" style="font-size: 9px; font-weight: 800;">BẢNG KÊ DỊCH VỤ & CHI PHÍ:</div>
      <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1.5px 0;">
        <span>• Tiếp nhận ban đầu:</span>
        <span style="font-weight: 600;">${formatMoney(initialPriceVal)}</span>
      </div>
      ${additionalServices.map((srv: any) => `
      <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1.5px 0;">
        <span>• [Thêm] ${srv.name}:</span>
        <span style="font-weight: 600;">+${formatMoney(srv.price)}</span>
      </div>`).join('')}
    </div>` : ''}

    <div class="k80-price-box">
      <div>
        <div class="k80-price-title">${hasAdditional ? 'TỔNG CỘNG THANH TOÁN:' : 'GIÁ DỰ KIẾN:'}</div>
        ${order.priceNote ? `<div style="font-size: 8px; color: #555555;">(${order.priceNote})</div>` : ''}
      </div>
      <div class="k80-price-amount">${formatMoney(totalPriceVal)}</div>
    </div>

    <div class="k80-qr-wrapper">
      <div class="k80-qr-box" data-track-url="${trackUrl}">
        ${qrCodeSvg}
      </div>
      <div class="k80-qr-hint">Quét mã QR để theo dõi tiến độ sửa chữa realtime</div>
    </div>

    <div class="k80-signatures">
      <div class="k80-sig-col">
        <b>KHÁCH HÀNG</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${order.name || ''}</div>
      </div>
      <div class="k80-sig-col">
        <b>TIẾP NHẬN</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${order.createdBy || 'FIXO'}</div>
      </div>
    </div>

    <div class="k80-footer-note">
      ${effectiveFooterNote}
    </div>
    <div class="k80-powered-by" style="font-size: 8px; color: #666; margin-top: 4px; text-align: center;">⚡ Powered by FIXO Repair OS · fixo.vn</div>

    <div class="k80-feed-spacer"></div>
    <div class="k80-cut-line">✂ - - - - - CẮT GIẤY - - - - - ✂</div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 2: Bản lưu cửa hàng & Kỹ thuật dán khay (Store Copy).
 * Thiết kế gọn nhẹ, tối ưu dán khay linh kiện:
 * - Header nhận diện bản lưu cửa hàng và tem khay kỹ thuật.
 * - Mã phiếu to đậm (font-size 18-20px) kèm Barcode Code 128 (cao 24px) dễ quét.
 * - Thông tin khách hàng, số điện thoại, thiết bị, phụ kiện, ngoại hình.
 * - Ô nổi bật BỆNH MÁY TIẾP NHẬN viền đậm, font 12px bold.
 * - Vùng ghi chú viết tay cho KTV: Khay số và Tên Kỹ thuật viên.
 * - TUYỆT ĐỐI KHÔNG CHỨA: Giá tiền, mã QR tra cứu, chữ ký khách và cam kết bảo hành.
 * - Cuối liên có đệm đẩy giấy 18mm để máy in cắt trọn vẹn không sót mép giấy.
 */
export function buildStoreCopyHtml(order: RepairOrder): string {
  const barcodeSvgStore = generateBarcodeSVG(order.id, {
    height: 24,
    barWidth: 1.35,
    showText: false,
  });

  const checks = Array.isArray(order.checks) ? order.checks : [];
  const checksHtml =
    checks.length > 0
      ? `
      <div class="k80-section">
        <div class="k80-section-title">TEST TẠI QUẦY</div>
        <table class="k80-table">
          ${checks
            .map(
              (c) => `
            <tr>
              <td class="td-label">${c.label}</td>
              <td class="td-status ${
                c.status === 'Hoạt động'
                  ? 'status-pass'
                  : c.status === 'Lỗi'
                  ? 'status-fail'
                  : 'status-na'
              }">${c.status}</td>
            </tr>`
            )
            .join('')}
        </table>
        ${order.testNote ? `<div class="k80-test-note"><b>Ghi chú:</b> ${order.testNote}</div>` : ''}
      </div>`
      : '';

  return `<div class="k80-wrapper k80-store-copy">
    <div class="k80-store-header">FIXO REPAIR OS · BẢN LƯU CỬA HÀNG & KỸ THUẬT</div>
    <div class="k80-store-title">PHIẾU ĐIỀU PHỐI / TEM KHAY KỸ THUẬT</div>
    <div class="k80-store-sub">Chi nhánh: ${order.branch || 'FIXO Store'} · Ngày: ${order.date || 'Hôm nay'} · NV: ${order.createdBy || 'FIXO'}</div>

    <div class="k80-order-box k80-store-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ PHIẾU TIẾP NHẬN</div>
      <div class="k80-order-code k80-store-order-code">${order.id}</div>
      <div class="k80-barcode">
        ${barcodeSvgStore}
      </div>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${order.name || 'Khách lẻ'} - ${order.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${((order as any).order_type === 'cod' || (order as any).orderType === 'cod') ? 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)' : 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'}</div>
      <div class="k80-row">
        <span class="k80-label">Thiết bị:</span>
        <span class="k80-val">${order.device || 'Thiết bị Apple'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Serial / Model:</span>
        <span class="k80-val">${order.serial || 'Chưa cập nhật'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Phụ kiện:</span>
        <span class="k80-val">${order.accessories || 'Không gửi kèm'}</span>
      </div>
      ${order.appearance ? `
      <div class="k80-row">
        <span class="k80-label">Ngoại hình:</span>
        <span class="k80-val">${order.appearance}</span>
      </div>` : ''}
    </div>

    <div class="k80-section">
      <div class="k80-section-title">BỆNH MÁY TIẾP NHẬN</div>
      <div class="k80-store-issue-box">${order.issue || 'Kiểm tra tổng quát'}</div>
    </div>

    ${checksHtml}

    <div class="k80-handwrite-box">
      Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]
    </div>

    <div class="k80-feed-spacer end"></div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 1 Gộp: Bản giao khách hàng cho đợt tiếp nhận nhiều thiết bị.
 * Hiển thị đầy đủ danh sách thiết bị [1], [2]..., giá từng máy và khối tổng cộng tiếp nhận.
 */
export function buildCombinedCustomerCopyHtml(
  orders: RepairOrder[],
  origin?: string,
  branding?: TenantReceiptBranding
): string {
  const primaryOrder = orders[0];
  const currentOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');
  const trackUrl = `${currentOrigin}/track/${primaryOrder.id}`;

  const effectiveLogoUrl = branding?.logoUrl || branding?.storeLogoUrl || (primaryOrder as any).tenant?.logo_url;
  const effectiveStoreName = branding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO REPAIR OS';
  const effectiveBranch = primaryOrder.branch || branding?.storeName || (primaryOrder as any).tenant?.name || 'FIXO Store';
  const effectiveHotline = branding?.hotline || branding?.storeHotline || (primaryOrder as any).tenant?.hotline || '1900.6868 · fixo.vn';
  const effectiveFooterNote = branding?.footerNote || branding?.receiptFooterNote || (primaryOrder as any).tenant?.receipt_footer_note || '* Quý khách vui lòng giữ phiếu này để đối chiếu khi nhận máy.<br />Cảm ơn quý khách đã tin tưởng dịch vụ FIXO Care!';

  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.map((o) => o.id.replace(/^FX\d+-/, '')).join('-')}`;
  const barcodeSvg = generateBarcodeSVG(primaryOrder.intake_batch_code || primaryOrder.id, {
    height: 36,
    barWidth: 1.35,
    showText: false,
  });

  const qrCodeSvg = generateQRCodeSVG(trackUrl, {
    size: 96,
    margin: 1,
  });

  const totalPrice = orders.reduce((sum, o) => sum + (Number((o as any).total_price || o.price) || 0), 0);
  const allOrderCodes = orders.map((o) => o.id).join(', ');

  const devicesHtml = orders
    .map((dev, idx) => {
      const checks = Array.isArray(dev.checks) ? dev.checks : [];
      const failChecks = checks.filter((c) => c.status === 'Lỗi');

      return `
      <div class="k80-combined-device" style="margin: 5px 0 7px 0; padding: 5px 6px; border: 1px dashed #555555; border-radius: 4px; background: #fafafa;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #bbbbbb; padding-bottom: 3px; margin-bottom: 3px;">
          <span style="font-weight: 700; font-size: 11.5px; color: #000000;">[${idx + 1}] ${dev.device || 'Thiết bị Apple'}</span>
          <span style="font-size: 9.5px; font-family: monospace; font-weight: 700; color: #333333;">${dev.id}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Serial:</span>
          <span class="k80-val">${dev.serial || 'Chưa cập nhật'}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Phụ kiện:</span>
          <span class="k80-val">${dev.accessories || 'Không gửi kèm'}</span>
        </div>
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Lỗi khách báo:</span>
          <span class="k80-val" style="color: #000000; font-weight: 700;">${dev.issue || 'Kiểm tra tổng quát'}</span>
        </div>
        ${dev.appearance ? `
        <div class="k80-row" style="margin: 1.5px 0;">
          <span class="k80-label" style="width: 22mm;">Ngoại hình:</span>
          <span class="k80-val">${dev.appearance}</span>
        </div>` : ''}
        ${checks.length > 0 ? `
        <div style="font-size: 9px; margin-top: 2px; color: #444444;">
          Test quầy: ${failChecks.length > 0 ? `<b style="color: #000; text-decoration: underline;">Lỗi (${failChecks.length}): ${failChecks.map((f) => f.label).join(', ')}</b>` : 'Tất cả chức năng cơ bản đạt'}
        </div>` : ''}
        ${dev.testNote ? `<div class="k80-test-note" style="margin-top: 2px;"><b>Ghi chú test:</b> ${dev.testNote}</div>` : ''}
        ${((dev as any).additional_services?.length || (dev as any).additionalServices?.length) ? `
        <div style="font-size: 8.5px; color: #444; margin-top: 2px; padding: 2px 0; border-top: 1px dotted #ddd;">
          <span style="font-weight: 700;">Dịch vụ làm thêm:</span>
          ${((dev as any).additional_services || (dev as any).additionalServices).map((s: any) => `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>+ ${s.name}:</span>
              <b>+${formatMoney(s.price)}</b>
            </div>`).join('')}
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 3px; border-top: 1px dotted #cccccc;">
          <span style="font-size: 9.5px; font-weight: 700;">Chi phí máy [${idx + 1}]:</span>
          <span style="font-size: 12px; font-weight: 700; color: #000000;">${formatMoney((dev as any).total_price || dev.price)}</span>
        </div>
      </div>`;
    })
    .join('');

  return `<div class="k80-wrapper k80-customer-copy">
    <div class="k80-header">
      ${effectiveLogoUrl ? `
      <div style="text-align: center; margin-bottom: 3px;">
        <img src="${effectiveLogoUrl}" class="k80-store-logo" alt="Logo" onerror="this.style.display='none'" />
      </div>
      <div class="k80-brand">${effectiveStoreName}</div>
      <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
      <div style="font-size: 9px; font-weight: 800; color: #176b58; margin-top: 1px;">(ĐỢT TIẾP NHẬN GỘP ${orders.length} THIẾT BỊ)</div>
      ` : `
      <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
        ${FIXO_LOGO_SVG}
        <div style="text-align: left;">
          <div class="k80-brand">FIXO REPAIR OS</div>
          <div class="k80-subtitle">PHIẾU TIẾP NHẬN SỬA CHỮA · LIÊN KHÁCH HÀNG</div>
          <div style="font-size: 9px; font-weight: 800; color: #176b58; margin-top: 1px;">(ĐỢT TIẾP NHẬN GỘP ${orders.length} THIẾT BỊ)</div>
        </div>
      </div>
      `}
      <div class="k80-branch-info">
        <b>Chi nhánh:</b> ${effectiveBranch}
      </div>
      <div class="k80-branch-info">
        <b>Hotline CSKH:</b> ${effectiveHotline}
      </div>
    </div>

    <div class="k80-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ ĐỢT TIẾP NHẬN GỘP</div>
      <div class="k80-order-code">${batchCode}</div>
      <div class="k80-barcode">
        ${barcodeSvg}
      </div>
      <div style="font-size: 8.5px; color: #444444; margin-top: 3px; padding: 0 4px;">
        Mã phiếu: <b>${allOrderCodes}</b>
      </div>
    </div>

    <div class="k80-meta">
      <span>Ngày nhận: <b>${primaryOrder.date || 'Hôm nay'}</b></span>
      <span>NV: <b>${primaryOrder.createdBy || 'FIXO'}</b></span>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${primaryOrder.name || 'Khách lẻ'}</span>
      </div>
      <div class="k80-row">
        <span class="k80-label">Số điện thoại:</span>
        <span class="k80-val">${primaryOrder.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${orders.some(o => (o as any).order_type === 'cod' || (o as any).orderType === 'cod') ? 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)' : 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'}</div>
      <div class="k80-row">
        <span class="k80-label">Số lượng máy:</span>
        <span class="k80-val"><b>${orders.length} thiết bị</b></span>
      </div>
    </div>

    <div class="k80-section" style="margin-top: 4px; padding-top: 4px;">
      <div class="k80-section-title" style="font-weight: 800;">DANH SÁCH THIẾT BỊ (${orders.length} MÁY)</div>
      ${devicesHtml}
    </div>

    <div class="k80-price-box" style="margin-top: 7px; padding: 7px 8px; border: 2px solid #000000; background: #fbfbfb;">
      <div>
        <div class="k80-price-title" style="font-size: 11px;">TỔNG CỘNG TIẾP NHẬN:</div>
        <div style="font-size: 8.5px; color: #555555;">(${orders.length} thiết bị gửi sửa)</div>
      </div>
      <div class="k80-price-amount" style="font-size: 16px; font-weight: 700; color: #000000;">${formatMoney(totalPrice)}</div>
    </div>

    <div class="k80-qr-wrapper">
      <div class="k80-qr-box" data-track-url="${trackUrl}">
        ${qrCodeSvg}
      </div>
      <div class="k80-qr-hint">Quét mã QR để theo dõi tiến độ sửa chữa realtime</div>
    </div>

    <div class="k80-signatures">
      <div class="k80-sig-col">
        <b>KHÁCH HÀNG</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${primaryOrder.name || ''}</div>
      </div>
      <div class="k80-sig-col">
        <b>TIẾP NHẬN</b>
        <div class="k80-sig-space"></div>
        <div style="font-weight: 600;">${primaryOrder.createdBy || 'FIXO'}</div>
      </div>
    </div>

    <div class="k80-footer-note">
      ${effectiveFooterNote}
    </div>
    <div class="k80-powered-by" style="font-size: 8px; color: #666; margin-top: 4px; text-align: center;">⚡ Powered by FIXO Repair OS · fixo.vn</div>

    <div class="k80-feed-spacer"></div>
    <div class="k80-cut-line">✂ - - - - - CẮT GIẤY - - - - - ✂</div>
  </div>`;
}

/**
 * Xây dựng nội dung Liên 2 Gộp: Bản lưu cửa hàng & Kỹ thuật dán khay cho đợt tiếp nhận nhiều thiết bị.
 * Liệt kê tất cả các máy trong đợt để thủ kho/kỹ thuật kẹp khay đối soát.
 */
export function buildCombinedStoreCopyHtml(orders: RepairOrder[]): string {
  const primaryOrder = orders[0];
  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.map((o) => o.id.replace(/^FX\d+-/, '')).join('-')}`;
  const barcodeSvgStore = generateBarcodeSVG(primaryOrder.intake_batch_code || primaryOrder.id, {
    height: 24,
    barWidth: 1.35,
    showText: false,
  });
  const allOrderCodes = orders.map((o) => o.id).join(', ');

  const devicesHtml = orders
    .map((dev, idx) => {
      const checks = Array.isArray(dev.checks) ? dev.checks : [];
      return `
      <div style="margin: 4px 0 6px 0; padding: 4px 5px; border: 1.5px solid #000000; border-radius: 4px; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000000; padding-bottom: 2px; margin-bottom: 3px;">
          <span style="font-weight: 800; font-size: 11px;">[${idx + 1}] ${dev.id}</span>
          <span style="font-weight: 700; font-size: 10.5px;">${dev.device || 'Thiết bị Apple'}</span>
        </div>
        <div class="k80-row" style="margin: 1px 0;">
          <span class="k80-label" style="width: 20mm;">Serial:</span>
          <span class="k80-val">${dev.serial || 'Chưa cập nhật'}</span>
        </div>
        <div class="k80-row" style="margin: 1px 0;">
          <span class="k80-label" style="width: 20mm;">Phụ kiện:</span>
          <span class="k80-val">${dev.accessories || 'Không gửi kèm'}</span>
        </div>
        <div style="font-size: 9.5px; margin: 2px 0;">
          <b>Bệnh máy:</b> <span style="font-weight: 700;">${dev.issue || 'Kiểm tra'}</span>
        </div>
        ${checks.length > 0 ? `
        <div style="font-size: 8.5px; color: #333333;">
          Kiểm tra quầy: ${checks.map((c) => `${c.label}: ${c.status}`).join(' | ')}
        </div>` : ''}
        <div class="k80-handwrite-box" style="margin-top: 3px; padding: 3px; font-size: 9px;">
          Khay số: [ ..... ] | Kỹ Thuật: [ .......... ]
        </div>
      </div>`;
    })
    .join('');

  return `<div class="k80-wrapper k80-store-copy">
    <div class="k80-store-header">FIXO REPAIR OS · BẢN LƯU CỬA HÀNG & KỸ THUẬT</div>
    <div class="k80-store-title">PHIẾU ĐIỀU PHỐI / BẢN LƯU GỘP (${orders.length} THIẾT BỊ)</div>
    <div class="k80-store-sub">Chi nhánh: ${primaryOrder.branch || 'FIXO Store'} · Ngày: ${primaryOrder.date || 'Hôm nay'} · NV: ${primaryOrder.createdBy || 'FIXO'}</div>

    <div class="k80-order-box k80-store-order-box">
      <div style="font-size: 8.5px; font-weight: bold; color: #555555; text-transform: uppercase;">MÃ ĐỢT TIẾP NHẬN GỘP</div>
      <div class="k80-order-code k80-store-order-code">${batchCode}</div>
      <div class="k80-barcode">
        ${barcodeSvgStore}
      </div>
      <div style="font-size: 8.5px; color: #333333; margin-top: 2px;">
        Mã đơn: <b>${allOrderCodes}</b>
      </div>
    </div>

    <div class="k80-section" style="border-top: none; margin-top: 0; padding-top: 0;">
      <div class="k80-row">
        <span class="k80-label">Khách hàng:</span>
        <span class="k80-val">${primaryOrder.name || 'Khách lẻ'} - ${primaryOrder.phone || '—'}</span>
      </div>
      <div style="font-weight: bold; font-size: 11px; margin: 4px 0;">${orders.some(o => (o as any).order_type === 'cod' || (o as any).orderType === 'cod') ? 'LOẠI ĐƠN: ĐƠN COD (KHÁCH TỈNH)' : 'LOẠI ĐƠN: ĐƠN TẠI CỬA HÀNG'}</div>
      <div class="k80-row">
        <span class="k80-label">Số lượng máy:</span>
        <span class="k80-val"><b>${orders.length} thiết bị</b></span>
      </div>
    </div>

    <div class="k80-section" style="margin-top: 4px; padding-top: 4px;">
      <div class="k80-section-title">DANH SÁCH THIẾT BỊ DÁN KHAY</div>
      ${devicesHtml}
    </div>

    <div class="k80-feed-spacer end"></div>
  </div>`;
}

/**
 * Sinh chuỗi HTML độc lập cho mẫu in nhiệt cuộn 80mm (K80) gộp nhiều thiết bị.
 */
export function renderCombinedThermalK80HTML(
  orders: RepairOrder[],
  options?: ThermalK80RenderOptions
): string {
  if (!orders || orders.length === 0) return '';
  if (orders.length === 1) return renderThermalK80HTML(orders[0], options);

  const primaryOrder = orders[0];
  const effectiveOrigin =
    options?.origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');

  const effectiveMode: ThermalK80SlipMode =
    options?.slipMode || (options?.isRoutingSlip ? 'store_only' : 'dual');

  const effectiveBranding: TenantReceiptBranding | undefined =
    options?.branding || (primaryOrder as any).tenant
      ? {
          logoUrl: options?.branding?.logoUrl || options?.branding?.storeLogoUrl || (primaryOrder as any).tenant?.logo_url,
          storeName: options?.branding?.storeName || (primaryOrder as any).tenant?.name,
          hotline: options?.branding?.hotline || options?.branding?.storeHotline || (primaryOrder as any).tenant?.hotline,
          footerNote: options?.branding?.footerNote || options?.branding?.receiptFooterNote || (primaryOrder as any).tenant?.receipt_footer_note,
        }
      : undefined;

  let bodyContent = '';
  if (effectiveMode === 'dual') {
    bodyContent = `${buildCombinedCustomerCopyHtml(orders, effectiveOrigin, effectiveBranding)}
    <div class="k80-slip-separator"></div>
    ${buildCombinedStoreCopyHtml(orders)}`;
  } else if (effectiveMode === 'customer_only') {
    bodyContent = buildCombinedCustomerCopyHtml(orders, effectiveOrigin, effectiveBranding);
  } else {
    bodyContent = buildCombinedStoreCopyHtml(orders);
  }

  const batchCode = primaryOrder.intake_batch_code || `IB26-${orders.length}Devices`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${batchCode} - In nhiệt K80 Gộp (${orders.length} thiết bị)</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 3mm 5mm 3mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .k80-wrapper {
      padding: 2mm 1mm;
    }
    .k80-slip-separator {
      page-break-after: always;
      break-after: page;
      clear: both;
      display: block;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    .k80-feed-spacer {
      height: 15mm;
      display: block;
    }
    .k80-feed-spacer.end {
      height: 18mm;
      display: block;
    }
    .k80-cut-line {
      text-align: center;
      font-size: 9px;
      font-family: monospace;
      color: #333333;
      margin: 4px 0;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .k80-store-logo {
      max-width: 42mm;
      max-height: 24mm;
      object-fit: contain;
      margin: 0 auto 3px auto;
      display: block;
      filter: contrast(110%);
    }
    .k80-powered-by {
      font-size: 8px;
      color: #666666;
      margin-top: 4px;
      text-align: center;
    }
    .k80-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .k80-brand {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 4px 0 2px 0;
    }
    .k80-subtitle {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .k80-branch-info {
      font-size: 9.5px;
      color: #222222;
      margin-top: 3px;
      line-height: 1.25;
    }
    .k80-order-box {
      text-align: center;
      margin: 6px 0;
      padding: 5px 0;
      background: #f4f4f4;
      border: 1px solid #000000;
      border-radius: 4px;
    }
    .k80-order-code {
      font-size: 17px;
      font-weight: 600;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-store-order-code {
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-barcode {
      display: flex;
      justify-content: center;
      margin-top: 4px;
    }
    .k80-barcode svg {
      max-width: 90%;
      height: 32px;
    }
    .k80-meta {
      font-size: 9px;
      display: flex;
      justify-content: space-between;
      margin: 4px 0 6px 0;
      padding: 0 2px;
      border-bottom: 1px dotted #888888;
      padding-bottom: 4px;
    }
    .k80-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 3px 0;
      font-size: 10.5px;
    }
    .k80-label {
      color: #333333;
      flex-shrink: 0;
      width: 25mm;
      font-weight: normal;
    }
    .k80-val {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
      flex-grow: 1;
      word-break: break-word;
    }
    .k80-section {
      margin-top: 6px;
      padding-top: 5px;
      border-top: 1px dashed #444444;
    }
    .k80-section-title {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-bottom: 4px;
      color: #000000;
    }
    .k80-store-header {
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .k80-store-title {
      font-size: 14px;
      font-weight: 800;
      text-align: center;
      margin: 2px 0;
    }
    .k80-store-sub {
      font-size: 9px;
      text-align: center;
      color: #333333;
      margin-bottom: 4px;
    }
    .k80-store-order-box {
      border: 2px solid #000000;
      background: #ffffff;
      padding: 4px 0;
    }
    .k80-handwrite-box {
      margin-top: 6px;
      padding: 5px 6px;
      border: 1.5px dashed #000000;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      background: #ffffff;
      letter-spacing: 0.3px;
    }
    .k80-price-box {
      margin-top: 7px;
      padding: 6px;
      border: 1.5px solid #000000;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fbfbfb;
    }
    .k80-price-title {
      font-size: 10.5px;
      font-weight: 700;
    }
    .k80-price-amount {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.5px;
      font-variant-numeric: tabular-nums;
    }
    .k80-qr-wrapper {
      text-align: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #444444;
    }
    .k80-qr-box {
      display: inline-block;
      width: 25mm;
      height: 25mm;
      margin: 0 auto;
    }
    .k80-qr-box svg {
      width: 100%;
      height: 100%;
    }
    .k80-qr-hint {
      font-size: 8.5px;
      font-weight: 600;
      margin-top: 3px;
      color: #333333;
    }
    .k80-signatures {
      display: flex;
      justify-content: space-between;
      text-align: center;
      margin-top: 8px;
      padding-top: 4px;
      font-size: 9.5px;
    }
    .k80-sig-col {
      width: 48%;
    }
    .k80-sig-space {
      height: 28px;
    }
    .k80-footer-note {
      text-align: center;
      font-size: 8px;
      color: #555555;
      margin-top: 6px;
      line-height: 1.25;
      border-top: 1px dotted #888888;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

/**
 * Sinh chuỗi HTML độc lập cho mẫu in nhiệt cuộn 80mm (K80).
 * Hỗ trợ các chế độ:
 * - 'dual' (mặc định): In Liên 1 + Bộ ngắt trang CSS (.k80-slip-separator) + Liên 2.
 * - 'customer_only': Chỉ in duy nhất Liên 1 (bản khách).
 * - 'store_only' / 'routing': Chỉ in duy nhất Liên 2 (bản lưu cửa hàng & kỹ thuật).
 * 
 * Hỗ trợ in 1 đơn hoặc mảng đơn hàng gộp.
 */
export function renderThermalK80HTML(
  orderOrOrders: RepairOrder | RepairOrder[],
  originOrOptions?: string | ThermalK80RenderOptions,
  optionsOrRoutingSlip?: ThermalK80RenderOptions | boolean
): string {
  let origin: string | undefined;
  let options: ThermalK80RenderOptions = {};

  if (typeof originOrOptions === 'string') {
    origin = originOrOptions;
  } else if (originOrOptions && typeof originOrOptions === 'object') {
    options = { ...originOrOptions };
    origin = options.origin;
  }

  if (typeof optionsOrRoutingSlip === 'boolean') {
    options = { ...options, isRoutingSlip: optionsOrRoutingSlip };
  } else if (optionsOrRoutingSlip && typeof optionsOrRoutingSlip === 'object') {
    options = { ...options, ...optionsOrRoutingSlip };
    if (!origin && options.origin) {
      origin = options.origin;
    }
  }

  if (origin && !options.origin) {
    options.origin = origin;
  }

  // Nếu là mảng đơn hàng
  if (Array.isArray(orderOrOrders)) {
    if (orderOrOrders.length === 0) return '';
    if (orderOrOrders.length === 1) {
      return renderThermalK80HTML(orderOrOrders[0], options);
    }
    return renderCombinedThermalK80HTML(orderOrOrders, options);
  }

  const order = orderOrOrders;

  const effectiveOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://fixo.com.vn');

  const effectiveMode: ThermalK80SlipMode =
    options.slipMode || (options.isRoutingSlip ? 'store_only' : 'dual');

  const effectiveBranding: TenantReceiptBranding | undefined =
    options.branding || (order as any).tenant
      ? {
          logoUrl: options.branding?.logoUrl || options.branding?.storeLogoUrl || (order as any).tenant?.logo_url,
          storeName: options.branding?.storeName || (order as any).tenant?.name,
          hotline: options.branding?.hotline || options.branding?.storeHotline || (order as any).tenant?.hotline,
          footerNote: options.branding?.footerNote || options.branding?.receiptFooterNote || (order as any).tenant?.receipt_footer_note,
        }
      : undefined;

  let bodyContent = '';
  if (effectiveMode === 'dual') {
    bodyContent = `${buildCustomerCopyHtml(order, effectiveOrigin, effectiveBranding)}
    <div class="k80-slip-separator"></div>
    ${buildStoreCopyHtml(order)}`;
  } else if (effectiveMode === 'customer_only') {
    bodyContent = buildCustomerCopyHtml(order, effectiveOrigin, effectiveBranding);
  } else {
    // 'store_only' or 'routing'
    bodyContent = buildStoreCopyHtml(order);
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${order.id} - In nhiệt K80</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 3mm 5mm 3mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .k80-wrapper {
      padding: 2mm 1mm;
    }
    .k80-slip-separator {
      page-break-after: always;
      break-after: page;
      clear: both;
      display: block;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    .k80-feed-spacer {
      height: 15mm;
      display: block;
    }
    .k80-feed-spacer.end {
      height: 18mm;
      display: block;
    }
    .k80-cut-line {
      text-align: center;
      font-size: 9px;
      font-family: monospace;
      color: #333333;
      margin: 4px 0;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .k80-store-logo {
      max-width: 42mm;
      max-height: 24mm;
      object-fit: contain;
      margin: 0 auto 3px auto;
      display: block;
      filter: contrast(110%);
    }
    .k80-powered-by {
      font-size: 8px;
      color: #666666;
      margin-top: 4px;
      text-align: center;
    }
    .k80-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .k80-brand {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 4px 0 2px 0;
    }
    .k80-subtitle {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .k80-branch-info {
      font-size: 9.5px;
      color: #222222;
      margin-top: 3px;
      line-height: 1.25;
    }
    .k80-order-box {
      text-align: center;
      margin: 6px 0;
      padding: 5px 0;
      background: #f4f4f4;
      border: 1px solid #000000;
      border-radius: 4px;
    }
    .k80-order-code {
      font-size: 17px;
      font-weight: 600;
      font-family: "Courier New", Courier, monospace;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-store-order-code {
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 1.2px;
      font-variant-numeric: tabular-nums;
    }
    .k80-barcode {
      display: flex;
      justify-content: center;
      margin-top: 4px;
    }
    .k80-barcode svg {
      max-width: 90%;
      height: 32px;
    }
    .k80-meta {
      font-size: 9px;
      display: flex;
      justify-content: space-between;
      margin: 4px 0 6px 0;
      padding: 0 2px;
      border-bottom: 1px dotted #888888;
      padding-bottom: 4px;
    }
    .k80-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 3px 0;
      font-size: 10.5px;
    }
    .k80-label {
      color: #333333;
      flex-shrink: 0;
      width: 25mm;
      font-weight: normal;
    }
    .k80-val {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
      flex-grow: 1;
      word-break: break-word;
    }
    .k80-section {
      margin-top: 6px;
      padding-top: 5px;
      border-top: 1px dashed #444444;
    }
    .k80-section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .k80-issue-box {
      background: #fafafa;
      border: 1px solid #cccccc;
      padding: 5px;
      font-size: 10.5px;
      line-height: 1.3;
      border-radius: 3px;
      word-break: break-word;
    }
    .k80-store-issue-box {
      background: #fafafa;
      border: 2px solid #000000;
      padding: 6px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.3;
      border-radius: 3px;
      word-break: break-word;
    }
    .k80-store-header {
      font-size: 11.5px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: -0.2px;
      margin-bottom: 2px;
    }
    .k80-store-title {
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #333333;
      margin-bottom: 2px;
    }
    .k80-store-sub {
      font-size: 9px;
      color: #444444;
      text-align: center;
      margin-top: 2px;
    }
    .k80-handwrite-box {
      margin-top: 6px;
      padding: 5px 6px;
      border: 1.5px dashed #000000;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      background: #ffffff;
      letter-spacing: 0.3px;
    }
    .k80-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      margin-top: 2px;
    }
    .k80-table td {
      padding: 2px 3px;
      border-bottom: 1px dotted #dddddd;
    }
    .td-label {
      width: 65%;
      color: #222222;
    }
    .td-status {
      width: 35%;
      text-align: right;
      font-weight: 700;
    }
    .status-pass {
      color: #000000;
    }
    .status-fail {
      color: #000000;
      text-decoration: underline;
    }
    .k80-test-note {
      font-size: 9px;
      margin-top: 3px;
      font-style: italic;
    }
    .k80-price-box {
      margin-top: 7px;
      padding: 6px;
      border: 1.5px solid #000000;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fbfbfb;
    }
    .k80-price-title {
      font-size: 10.5px;
      font-weight: 700;
    }
    .k80-price-amount {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.5px;
      font-variant-numeric: tabular-nums;
    }
    .k80-qr-wrapper {
      text-align: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #444444;
    }
    .k80-qr-box {
      display: inline-block;
      width: 25mm;
      height: 25mm;
      margin: 0 auto;
    }
    .k80-qr-box svg {
      width: 100%;
      height: 100%;
    }
    .k80-qr-hint {
      font-size: 8.5px;
      font-weight: 600;
      margin-top: 3px;
      color: #333333;
    }
    .k80-signatures {
      display: flex;
      justify-content: space-between;
      text-align: center;
      margin-top: 8px;
      padding-top: 4px;
      font-size: 9.5px;
    }
    .k80-sig-col {
      width: 48%;
    }
    .k80-sig-space {
      height: 28px;
    }
    .k80-footer-note {
      text-align: center;
      font-size: 8px;
      color: #555555;
      margin-top: 6px;
      line-height: 1.25;
      border-top: 1px dotted #888888;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}
