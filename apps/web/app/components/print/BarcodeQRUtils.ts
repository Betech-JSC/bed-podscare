/**
 * BarcodeQRUtils.ts
 * Module phát sinh mã Barcode Code128 và QR Code dạng SVG độc lập.
 * 100% Client-side, Zero-network, Không phụ thuộc thư viện bên ngoài.
 */

// ==========================================
// 1. BARCODE CODE 128 (SUBSET B) GENERATOR
// ==========================================

// Bảng mẫu vạch Code 128 (Patterns từ 0 -> 106).
// Mỗi ký tự gồm 6 chỉ số đại diện cho độ rộng của 3 thanh đen và 3 khoảng trắng xen kẽ.
// Riêng STOP (106) có 7 chỉ số (kèm thanh kết thúc 2 module).
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
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (104=Start B, 106=Stop)
];

const CODE128_START_B = 104;
const CODE128_STOP = 106;

export interface BarcodeOptions {
  height?: number;
  barWidth?: number;
  showText?: boolean;
  fontSize?: number;
}

/**
 * Sinh chuỗi SVG cho mã vạch Code 128 (Subset B)
 * @param code Chuỗi ký tự ASCII cần mã hóa (ví dụ mã đơn "PC26-10293")
 * @param options Tùy chọn chiều cao, độ rộng vạch, hiển thị text
 */
export function generateBarcodeSVG(code: string, options: BarcodeOptions = {}): string {
  const height = options.height ?? 40;
  const barWidth = options.barWidth ?? 1.5;
  const showText = options.showText ?? true;
  const fontSize = options.fontSize ?? 10;
  const textHeight = showText ? fontSize + 4 : 0;
  const quietZoneModules = 10;

  // Lọc chỉ giữ các ký tự ASCII in được (32 - 126)
  const cleanCode = (code || '').split('').filter((c) => {
    const codePoint = c.charCodeAt(0);
    return codePoint >= 32 && codePoint <= 126;
  }).join('');

  if (!cleanCode) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${height}"></svg>`;
  }

  // Tạo chuỗi indices theo Code 128 Set B
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

  // Chuyển đổi indices thành chuỗi độ rộng vạch (bar & space)
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
    // Phần tử ở vị trí chẵn là Bar (đen), lẻ là Space (trắng)
    if (i % 2 === 0) {
      rects.push(`<rect x="${currentX.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`);
    }
    currentX += w;
  }

  const textElement = showText
    ? `<text x="${(totalSvgWidth / 2).toFixed(2)}" y="${(height + fontSize + 1).toFixed(2)}" font-family="monospace, monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="#000000" letter-spacing="1">${cleanCode}</text>`
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

export interface QRCodeOptions {
  size?: number; // Kích thước hiển thị (px hoặc mm tùy ngữ cảnh)
  margin?: number; // Số module padding xung quanh (mặc định: 2)
}

/**
 * QR Code Generator độc lập hỗ trợ ISO/IEC 18004 (Model 2, Byte Mode, EC Level M).
 * Hỗ trợ tạo ma trận QR hoàn chỉnh cho URL và mã phiếu sửa chữa.
 */
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
    const data = (0 << 3) | maskPattern; // EC Level M = 0
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

// Bảng số codeword dữ liệu cho EC Level M (Medium ~ 15% recovery)
const EC_M_DATA_CAPACITY: Record<number, number> = {
  1: 16,
  2: 28,
  3: 44,
  4: 64,
  5: 86,
  6: 108,
  7: 124,
  8: 154,
  9: 182,
  10: 216,
};

// Bảng RS Block Parameters: [total_words, data_words, ec_words_per_block, num_blocks_1, data_words_1, num_blocks_2, data_words_2]
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

// Galois Field GF(256) tables
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

  // Chọn version phù hợp cho dữ liệu
  let version = 1;
  while (version <= 10) {
    const cap = EC_M_DATA_CAPACITY[version];
    // Mode 8-bit (4 bits) + Length indicator (8 or 16 bits)
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

  // Mode: 0100 (Byte mode)
  pushBits(0b0100, 4);
  // Character count indicator
  pushBits(utf8Bytes.length, version < 10 ? 8 : 16);
  // Data bytes
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }

  // Terminator
  const terminatorLen = Math.min(4, maxDataWords * 8 - bufferBits.length);
  for (let i = 0; i < terminatorLen; i++) bufferBits.push(0);

  // Align to byte
  while (bufferBits.length % 8 !== 0) {
    bufferBits.push(0);
  }

  // Convert bits to byte array
  const dataWords: number[] = [];
  for (let i = 0; i < bufferBits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bufferBits[i + b];
    }
    dataWords.push(byte);
  }

  // Pad bytes: 0xEC, 0x11
  let padToggle = false;
  while (dataWords.length < maxDataWords) {
    dataWords.push(padToggle ? 0x11 : 0xec);
    padToggle = !padToggle;
  }

  // Phân chia blocks và tính Error Correction
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

  // Interleave data codewords
  const interleaved: number[] = [];
  const maxBlockDataLen = Math.max(dataWords1, dataWords2);
  for (let i = 0; i < maxBlockDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) {
        interleaved.push(b.data[i]);
      }
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < ecWordsPerBlock; i++) {
    for (const b of blocks) {
      if (i < b.ec.length) {
        interleaved.push(b.ec[i]);
      }
    }
  }

  // Tạo và nạp vào ma trận QR
  const qr = new MinimalQRCode(version);
  qr.setupPositionProbePattern(0, 0);
  qr.setupPositionProbePattern(qr.moduleCount - 7, 0);
  qr.setupPositionProbePattern(0, qr.moduleCount - 7);
  qr.setupPositionAdjustPattern();
  qr.setupTimingPattern();
  qr.setupTypeInfo(true, 0);
  qr.setupTypeNumber(true);

  // Mask pattern 0 được dùng làm mẫu mặc định cân bằng
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

/**
 * Sinh chuỗi SVG mã QR Code chất lượng cao dạng vector thuần.
 * @param data Dữ liệu URL hoặc chuỗi văn bản cần tạo mã QR (ví dụ link tra cứu)
 * @param options Tùy chọn kích thước và viền đệm
 */
export function generateQRCodeSVG(data: string, options: QRCodeOptions = {}): string {
  const margin = options.margin ?? 2;
  const size = options.size ?? 120;

  if (!data) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"></svg>`;
  }

  const matrix = buildQRMatrix(data);
  const n = matrix.length;
  const totalCells = n + margin * 2;

  // Xây dựng path SVG tổng hợp để kích thước SVG nhẹ và render nhanh nhất
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
