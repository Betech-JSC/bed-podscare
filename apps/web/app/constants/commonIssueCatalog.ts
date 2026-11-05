import type { CommonIssueItem } from '@podscare/api-client';

export const POPULAR_APPLE_WATCH_SIZES = [
  '38mm',
  '40mm',
  '41mm',
  '42mm',
  '44mm',
  '45mm',
  '46mm',
  '49mm (Ultra)',
] as const;

export type AppleWatchSizeOption = (typeof POPULAR_APPLE_WATCH_SIZES)[number] | string;

export type AirPodsModelPrefix = 'AP2' | 'AP3' | 'APP1' | 'APP2L' | 'APP2C' | 'APM';
export type AirPodsPartType = 'BAT' | 'SPK' | 'MIC' | 'MESH';
export type AirPodsEarScope = 'L' | 'R' | 'LR';

export interface LinkedPartItem {
  part_sku: string;
  part_name: string;
  quantity: number;
  unit: string;
  position?: string; // 'Tai trái (L)' | 'Tai phải (R)' | 'L' | 'R' | 'L/R' | 'Case' | 'Body' | ...
  watch_size?: string;
}

export interface IssuePartsPresetItem {
  id: string;
  category: 'AirPods' | 'Apple Watch' | 'Apple Pencil';
  issue_label: string;
  keywords: string[];
  linked_parts: LinkedPartItem[];
}

export interface CommonIssueCatalogItem extends CommonIssueItem {
  id?: number;
  issue_code: string;
  category: string;
  issue_name: string;
  keywords: string[];
  solution?: string;
  estimated_cost?: number;
  estimated_time?: string;
  watch_sizes?: string[];
  linked_parts: LinkedPartItem[];
}

export const AIRPODS_MODEL_META: Record<
  AirPodsModelPrefix,
  {
    prefix: AirPodsModelPrefix;
    displayName: string;
    modelCode: string;
    prices: {
      BAT_SINGLE: number;
      BAT_LR: number;
      SPK_SINGLE: number;
      SPK_LR: number;
      MIC_SINGLE: number;
      MIC_LR: number;
      MESH_SINGLE: number;
      MESH_LR: number;
      CASE_BAT: number;
      CASE_FLEX: number;
    };
  }
> = {
  AP2: {
    prefix: 'AP2',
    displayName: 'AirPods 2',
    modelCode: 'A2031/A2032',
    prices: {
      BAT_SINGLE: 220000,
      BAT_LR: 400000,
      SPK_SINGLE: 250000,
      SPK_LR: 450000,
      MIC_SINGLE: 220000,
      MIC_LR: 400000,
      MESH_SINGLE: 60000,
      MESH_LR: 100000,
      CASE_BAT: 300000,
      CASE_FLEX: 250000,
    },
  },
  AP3: {
    prefix: 'AP3',
    displayName: 'AirPods 3',
    modelCode: 'A2564/A2565',
    prices: {
      BAT_SINGLE: 250000,
      BAT_LR: 450000,
      SPK_SINGLE: 280000,
      SPK_LR: 520000,
      MIC_SINGLE: 250000,
      MIC_LR: 460000,
      MESH_SINGLE: 70000,
      MESH_LR: 120000,
      CASE_BAT: 350000,
      CASE_FLEX: 280000,
    },
  },
  APP1: {
    prefix: 'APP1',
    displayName: 'AirPods Pro',
    modelCode: 'A2083/A2084',
    prices: {
      BAT_SINGLE: 260000,
      BAT_LR: 480000,
      SPK_SINGLE: 350000,
      SPK_LR: 650000,
      MIC_SINGLE: 280000,
      MIC_LR: 520000,
      MESH_SINGLE: 70000,
      MESH_LR: 120000,
      CASE_BAT: 380000,
      CASE_FLEX: 300000,
    },
  },
  APP2L: {
    prefix: 'APP2L',
    displayName: 'AirPods Pro 2 (Lightning)',
    modelCode: 'A2698/A2699',
    prices: {
      BAT_SINGLE: 280000,
      BAT_LR: 520000,
      SPK_SINGLE: 380000,
      SPK_LR: 700000,
      MIC_SINGLE: 300000,
      MIC_LR: 560000,
      MESH_SINGLE: 80000,
      MESH_LR: 140000,
      CASE_BAT: 420000,
      CASE_FLEX: 320000,
    },
  },
  APP2C: {
    prefix: 'APP2C',
    displayName: 'AirPods Pro 2 (USB-C)',
    modelCode: 'A3047/A3048',
    prices: {
      BAT_SINGLE: 300000,
      BAT_LR: 550000,
      SPK_SINGLE: 400000,
      SPK_LR: 750000,
      MIC_SINGLE: 320000,
      MIC_LR: 600000,
      MESH_SINGLE: 80000,
      MESH_LR: 140000,
      CASE_BAT: 450000,
      CASE_FLEX: 350000,
    },
  },
  APM: {
    prefix: 'APM',
    displayName: 'AirPods Max',
    modelCode: 'A2096',
    prices: {
      BAT_SINGLE: 650000,
      BAT_LR: 1200000,
      SPK_SINGLE: 800000,
      SPK_LR: 1500000,
      MIC_SINGLE: 500000,
      MIC_LR: 900000,
      MESH_SINGLE: 250000,
      MESH_LR: 450000,
      CASE_BAT: 600000,
      CASE_FLEX: 550000,
    },
  },
};

/**
 * Phân giải tên dòng máy AirPods sang mã tiền tố SKU chuẩn (AP2, AP3, APP1, APP2L, APP2C, APM)
 */
export function resolveAirPodsModelPrefix(modelName?: string | null): AirPodsModelPrefix {
  const lower = (modelName || '').trim().toLowerCase();
  if (!lower) return 'APP2C';

  if (lower.includes('max') || lower.includes('a2096') || lower === 'apm') {
    return 'APM';
  }
  if (
    lower.includes('app2l') ||
    (lower.includes('pro 2') && lower.includes('lightning')) ||
    lower.includes('a2698') ||
    lower.includes('a2699')
  ) {
    return 'APP2L';
  }
  if (
    lower.includes('app2c') ||
    lower.includes('pro 2') ||
    lower.includes('a3047') ||
    lower.includes('a3048')
  ) {
    return 'APP2C';
  }
  if (
    lower.includes('app1') ||
    lower.includes('pro 1') ||
    lower.includes('airpods pro') ||
    lower.includes('a2083') ||
    lower.includes('a2084')
  ) {
    return 'APP1';
  }
  if (
    lower.includes('ap3') ||
    lower.includes('airpods 3') ||
    lower.includes('airpods 4') ||
    lower.includes('gen 3') ||
    lower.includes('a2564') ||
    lower.includes('a2565')
  ) {
    return 'AP3';
  }
  if (
    lower.includes('ap2') ||
    lower.includes('airpods 2') ||
    lower.includes('gen 2') ||
    lower.includes('a2031') ||
    lower.includes('a2032')
  ) {
    return 'AP2';
  }

  return 'APP2C';
}

/**
 * Chuẩn hóa phạm vi sửa chữa tai nghe AirPods về 'L' | 'R' | 'LR'
 */
export function normalizeAirPodsEarScope(side?: string | null): AirPodsEarScope {
  const raw = (side || '').trim().toLowerCase();
  if (!raw) return 'LR';

  if (
    raw === 'lr' ||
    raw === 'l/r' ||
    raw.includes('l + r') ||
    raw.includes('l+r') ||
    raw.includes('cả 2') ||
    raw.includes('2 tai') ||
    raw.includes('hai tai') ||
    raw.includes('both') ||
    raw.includes('cặp')
  ) {
    return 'LR';
  }
  if (
    raw === 'r' ||
    raw.includes('tai phải') ||
    raw.includes('(r)') ||
    raw.includes('bên phải') ||
    raw.endsWith('-r')
  ) {
    return 'R';
  }
  if (
    raw === 'l' ||
    raw.includes('tai trái') ||
    raw.includes('(l)') ||
    raw.includes('bên trái') ||
    raw.endsWith('-l')
  ) {
    return 'L';
  }

  return 'LR';
}

/**
 * Sinh danh sách linked_parts chuẩn BOM tách rời Trái (*-L) và Phải (*-R) cho 4 nhóm linh kiện AirPods
 * (BAT, SPK, MIC, MESH) theo 3 phạm vi: Tai Trái (L), Tai Phải (R), hoặc Cả 2 tai (L + R).
 */
export function resolveAirPodsLRPartsForModel(
  modelName?: string | null,
  partType: AirPodsPartType | string = 'BAT',
  side: AirPodsEarScope | string = 'LR'
): LinkedPartItem[] {
  const prefix = resolveAirPodsModelPrefix(modelName);
  const meta = AIRPODS_MODEL_META[prefix];
  const rawModelTrimmed = (modelName || '').trim();
  const displayName =
    prefix === 'APP2C' &&
    rawModelTrimmed.toLowerCase() === 'airpods pro 2'
      ? 'AirPods Pro 2 (USB-C)'
      : meta.displayName;

  const normType = (partType || 'BAT').trim().toUpperCase() as AirPodsPartType;
  const scope = normalizeAirPodsEarScope(side);

  const baseNameByType: Record<AirPodsPartType, string> = {
    BAT: prefix === 'APM' ? `Pin củ tai ${displayName}` : `Pin tai nghe ${displayName}`,
    SPK: `Cụm loa Driver ${displayName}`,
    MIC: `Cụm cáp Mic ${displayName}`,
    MESH: `Lưới chống bụi âm thanh ${displayName}`,
  };

  const unitByType: Record<AirPodsPartType, string> = {
    BAT: 'Viên',
    SPK: 'Cái',
    MIC: 'Cái',
    MESH: 'Cái',
  };

  const effectiveType: AirPodsPartType = baseNameByType[normType] ? normType : 'BAT';
  const basePartName = baseNameByType[effectiveType];
  const unit = unitByType[effectiveType];

  const leftItem: LinkedPartItem = {
    part_sku: `${effectiveType}-${prefix}-L`,
    part_name: `${basePartName} - Tai Trái (L)`,
    quantity: 1,
    unit,
    position: 'Tai trái (L)',
  };

  const rightItem: LinkedPartItem = {
    part_sku: `${effectiveType}-${prefix}-R`,
    part_name: `${basePartName} - Tai Phải (R)`,
    quantity: 1,
    unit,
    position: 'Tai phải (R)',
  };

  if (scope === 'L') return [leftItem];
  if (scope === 'R') return [rightItem];
  return [leftItem, rightItem];
}

/**
 * Sinh linh kiện Hộp sạc (Case) / Khớp nối theo đúng dòng máy AirPods
 */
export function resolveAirPodsCasePartForModel(
  modelName?: string | null,
  caseType: 'CASE_BAT' | 'CASE_FLEX' = 'CASE_BAT'
): LinkedPartItem {
  const prefix = resolveAirPodsModelPrefix(modelName);
  const meta = AIRPODS_MODEL_META[prefix];

  if (prefix === 'APM') {
    if (caseType === 'CASE_BAT') {
      return {
        part_sku: 'FLEX-SWIVEL-APM',
        part_name: 'Cáp flex xoay khớp nối AirPods Max',
        quantity: 1,
        unit: 'Bộ',
        position: 'Khung Headband',
      };
    }
    return {
      part_sku: 'FLEX-PORT-APM',
      part_name: 'Cáp cụm chân sạc Lightning AirPods Max',
      quantity: 1,
      unit: 'Cái',
      position: 'Cổng sạc',
    };
  }

  if (caseType === 'CASE_BAT') {
    return {
      part_sku: `BAT-CASE-${prefix}`,
      part_name: `Pin hộp sạc ${meta.displayName}`,
      quantity: 1,
      unit: 'Viên',
      position: 'Hộp sạc (Case)',
    };
  }

  return {
    part_sku: `FLEX-CASE-${prefix}`,
    part_name: `Cáp flex chân sạc hộp sạc ${meta.displayName}`,
    quantity: 1,
    unit: 'Cái',
    position: 'Hộp sạc (Case)',
  };
}

/**
 * Nhận diện nhóm linh kiện AirPods (BAT | SPK | MIC | MESH | CASE_BAT | CASE_FLEX) từ object lỗi hoặc chuỗi
 */
export function detectAirPodsPartTypeFromIssue(
  issueOrText?: CommonIssueItem | CommonIssueCatalogItem | string | null
): AirPodsPartType | 'CASE_BAT' | 'CASE_FLEX' | null {
  if (!issueOrText) return null;

  const isString = typeof issueOrText === 'string';
  const code = isString
    ? ''
    : ((issueOrText as CommonIssueCatalogItem).issue_code || '').toUpperCase();
  const name = (isString ? issueOrText : issueOrText.issue_name || '').toLowerCase();
  const parts = isString
    ? []
    : Array.isArray((issueOrText as CommonIssueCatalogItem).linked_parts)
    ? (issueOrText as CommonIssueCatalogItem).linked_parts
    : [];

  if (code.includes('-CASE-BAT') || code.includes('FLEX-SWIVEL')) return 'CASE_BAT';
  if (code.includes('-CASE-FLEX') || code.includes('FLEX-PORT')) return 'CASE_FLEX';
  if (code.includes('-BAT-')) return 'BAT';
  if (code.includes('-SPK-')) return 'SPK';
  if (code.includes('-MIC-')) return 'MIC';
  if (code.includes('-MESH-')) return 'MESH';

  if (name.includes('hộp sạc') || name.includes('(case)') || name.includes('dock sạc')) {
    if (name.includes('pin')) return 'CASE_BAT';
    return 'CASE_FLEX';
  }
  if (name.includes('khớp nối') || name.includes('headband')) return 'CASE_BAT';
  if (name.includes('chân sạc') || name.includes('cáp flex chân')) return 'CASE_FLEX';

  if (
    name.includes('lưới chống bụi') ||
    name.includes('thay lưới') ||
    name.includes('vệ sinh & thay lưới') ||
    name.includes('tắc màng')
  ) {
    return 'MESH';
  }
  if (name.includes('mic đàm thoại') || name.includes('thay mic') || name.includes('mất mic')) {
    return 'MIC';
  }
  if (
    name.includes('loa & anc') ||
    name.includes('thay loa') ||
    name.includes('sửa/thay loa') ||
    name.includes('rè loa') ||
    name.includes('rè bass') ||
    name.includes('bật chống ồn anc')
  ) {
    return 'SPK';
  }
  if (name.includes('thay pin') || name.includes('pin chai') || name.includes('tụt pin')) {
    return 'BAT';
  }

  for (const p of parts) {
    const sku = (p.part_sku || '').toUpperCase();
    if (sku.startsWith('BAT-CASE-') || sku.startsWith('FLEX-SWIVEL-')) return 'CASE_BAT';
    if (sku.startsWith('FLEX-CASE-') || sku.startsWith('CASE-') || sku.startsWith('FLEX-PORT-')) {
      return 'CASE_FLEX';
    }
    if (sku.startsWith('BAT-')) return 'BAT';
    if (sku.startsWith('SPK-')) return 'SPK';
    if (sku.startsWith('MIC-')) return 'MIC';
    if (sku.startsWith('MESH-')) return 'MESH';
  }

  return null;
}

/**
 * Nhận diện phạm vi tai nghe AirPods ('L' | 'R' | 'LR' | 'CASE') từ object lỗi hoặc chuỗi
 */
export function detectAirPodsEarScopeFromIssue(
  issueOrText?: CommonIssueItem | CommonIssueCatalogItem | string | null
): AirPodsEarScope | 'CASE' | null {
  if (!issueOrText) return null;

  const isString = typeof issueOrText === 'string';
  const code = isString
    ? ''
    : ((issueOrText as CommonIssueCatalogItem).issue_code || '').toUpperCase();
  const name = (isString ? issueOrText : issueOrText.issue_name || '').toLowerCase();
  const parts = isString
    ? []
    : Array.isArray((issueOrText as CommonIssueCatalogItem).linked_parts)
    ? (issueOrText as CommonIssueCatalogItem).linked_parts
    : [];

  if (code.includes('-CASE-') || code.includes('FLEX-SWIVEL') || code.includes('FLEX-PORT')) {
    return 'CASE';
  }
  if (code.endsWith('-LR')) return 'LR';
  if (code.endsWith('-L')) return 'L';
  if (code.endsWith('-R')) return 'R';

  if (
    name.includes('hộp sạc') ||
    name.includes('(case)') ||
    name.includes('khớp nối') ||
    name.includes('cổng sạc')
  ) {
    return 'CASE';
  }
  if (
    name.includes('cả 2 tai') ||
    name.includes('2 tai') ||
    name.includes('l + r') ||
    name.includes('l+r') ||
    name.includes('hai tai')
  ) {
    return 'LR';
  }
  if (name.includes('tai trái') || name.includes('(l)') || name.includes('bên trái')) {
    return 'L';
  }
  if (name.includes('tai phải') || name.includes('(r)') || name.includes('bên phải')) {
    return 'R';
  }

  const hasL = parts.some(
    (p) =>
      (p.part_sku || '').toUpperCase().endsWith('-L') ||
      (p.position || '').toLowerCase().includes('trái') ||
      (p.position || '').toUpperCase() === 'L'
  );
  const hasR = parts.some(
    (p) =>
      (p.part_sku || '').toUpperCase().endsWith('-R') ||
      (p.position || '').toLowerCase().includes('phải') ||
      (p.position || '').toUpperCase() === 'R'
  );
  if (hasL && hasR) return 'LR';
  if (hasL) return 'L';
  if (hasR) return 'R';

  if (parts.some((p) => (p.position || '').toUpperCase() === 'L/R')) {
    return 'LR';
  }

  return null;
}

/**
 * Dựng object CommonIssueCatalogItem chuẩn BOM cho 1 nhóm linh kiện tai nghe AirPods (BAT/SPK/MIC/MESH)
 * và phạm vi (L / R / LR) theo dòng máy cụ thể.
 */
export function buildAirPodsScopedIssue(
  partType: AirPodsPartType,
  scope: AirPodsEarScope,
  deviceModelName?: string | null
): CommonIssueCatalogItem {
  const prefix = resolveAirPodsModelPrefix(deviceModelName);
  const meta = AIRPODS_MODEL_META[prefix];
  const normScope = normalizeAirPodsEarScope(scope);
  const scopeLabel =
    normScope === 'L'
      ? '1 bên Tai Trái (L)'
      : normScope === 'R'
      ? '1 bên Tai Phải (R)'
      : 'Cả 2 tai (L + R)';

  const titlePrefixByType: Record<AirPodsPartType, string> = {
    BAT: 'Thay pin',
    SPK: 'Sửa/Thay loa & ANC',
    MIC: 'Thay Mic đàm thoại / Mic ANC',
    MESH: 'Vệ sinh & Thay lưới chống bụi âm thanh',
  };

  const solutionByType: Record<AirPodsPartType, string> = {
    BAT: `Thay pin ${meta.displayName} (${scopeLabel}) chuẩn dung lượng và vệ sinh buồng âm.`,
    SPK: `Thay cụm loa Driver & xử lý chống ồn ANC ${meta.displayName} (${scopeLabel}).`,
    MIC: `Thay cụm cáp Mic đàm thoại / Mic ANC ${meta.displayName} (${scopeLabel}).`,
    MESH: `Vệ sinh siêu âm và thay lưới chống bụi âm thanh ${meta.displayName} (${scopeLabel}).`,
  };

  const costByType: Record<AirPodsPartType, number> = {
    BAT: normScope === 'LR' ? meta.prices.BAT_LR : meta.prices.BAT_SINGLE,
    SPK: normScope === 'LR' ? meta.prices.SPK_LR : meta.prices.SPK_SINGLE,
    MIC: normScope === 'LR' ? meta.prices.MIC_LR : meta.prices.MIC_SINGLE,
    MESH: normScope === 'LR' ? meta.prices.MESH_LR : meta.prices.MESH_SINGLE,
  };

  const linkedParts = resolveAirPodsLRPartsForModel(deviceModelName, partType, normScope);
  const modelLabelInIssue = deviceModelName?.trim() ? meta.displayName : 'AirPods';

  return {
    issue_code: `ISS-${prefix}-${partType}-${normScope}`,
    category: 'AirPods',
    issue_name: `${titlePrefixByType[partType]} ${modelLabelInIssue} - ${scopeLabel}`,
    keywords: [
      partType.toLowerCase(),
      meta.displayName.toLowerCase(),
      scopeLabel.toLowerCase(),
      ...linkedParts.map((p) => p.part_sku.toLowerCase()),
    ],
    solution: solutionByType[partType],
    estimated_cost: costByType[partType],
    estimated_time: normScope === 'LR' ? '60 - 90 phút' : '45 - 60 phút',
    linked_parts: linkedParts,
  };
}

/**
 * Chuyển nhanh phạm vi (Tai L | Tai R | 2 Tai L+R) cho một lỗi AirPods đang chọn
 */
export function switchAirPodsIssueEarScope(
  issue: CommonIssueItem | CommonIssueCatalogItem,
  nextScope: AirPodsEarScope,
  deviceModelName?: string | null
): CommonIssueCatalogItem {
  const detectedType = detectAirPodsPartTypeFromIssue(issue);
  const effectiveType: AirPodsPartType =
    detectedType === 'SPK' || detectedType === 'MIC' || detectedType === 'MESH'
      ? detectedType
      : 'BAT';
  return buildAirPodsScopedIssue(effectiveType, nextScope, deviceModelName);
}

/**
 * Định mức Lỗi phổ biến ↔ Mã SKU Linh kiện thật trong Kho & Mua hàng (/inventory)
 * Tự động trừ tồn kho khi tạo đơn sửa chữa (POST /api/v1/orders)
 */
export const DEFAULT_ISSUE_PARTS_PRESETS: IssuePartsPresetItem[] = [
  {
    id: 'preset-ap-pin-pro2',
    category: 'AirPods',
    issue_label: 'Lỗi Pin AirPods Pro 2 (Chai pin, tụt pin nhanh)',
    keywords: ['pin', 'chai pin', 'tụt pin', 'sụt pin', 'nhanh hết pin', 'airpods pro 2'],
    linked_parts: [
      {
        part_sku: 'BAT-APP2-01',
        part_name: 'Pin tai nghe AirPods Pro 2',
        quantity: 1,
        unit: 'Viên',
        position: 'L/R',
      },
    ],
  },
  {
    id: 'preset-ap-pin-pro1',
    category: 'AirPods',
    issue_label: 'Lỗi Pin AirPods Pro (Chai pin, báo ảo, sập nguồn)',
    keywords: ['pin airpods pro', 'chai pin pro 1', 'thay pin airpods pro'],
    linked_parts: [
      {
        part_sku: 'BAT-APP-01',
        part_name: 'Pin tai nghe AirPods Pro',
        quantity: 1,
        unit: 'Viên',
        position: 'L/R',
      },
    ],
  },
  {
    id: 'preset-ap-pin-gen3',
    category: 'AirPods',
    issue_label: 'Lỗi Pin AirPods 3 / AirPods 2 (Tụt áp, ngắt kết nối sớm)',
    keywords: ['pin airpods 3', 'pin airpods 2', 'thay pin airpods 3'],
    linked_parts: [
      {
        part_sku: 'BAT-APP3-02',
        part_name: 'Pin tai nghe AirPods 3',
        quantity: 1,
        unit: 'Viên',
        position: 'L/R',
      },
    ],
  },
  {
    id: 'preset-ap-bat-l',
    category: 'AirPods',
    issue_label: 'Thay pin AirPods - 1 bên Tai Trái (L)',
    keywords: ['pin tai trái', 'thay pin tai l', 'bat-app2c-l', 'bat-ap2-l', 'bat-ap3-l', 'bat-app1-l'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'L'),
  },
  {
    id: 'preset-ap-bat-r',
    category: 'AirPods',
    issue_label: 'Thay pin AirPods - 1 bên Tai Phải (R)',
    keywords: ['pin tai phải', 'thay pin tai r', 'bat-app2c-r', 'bat-ap2-r', 'bat-ap3-r', 'bat-app1-r'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'R'),
  },
  {
    id: 'preset-ap-bat-lr',
    category: 'AirPods',
    issue_label: 'Thay pin AirPods - Cả 2 tai (L + R)',
    keywords: ['thay pin 2 tai', 'pin cả 2 tai', 'pin l + r', 'bat-app2c-l', 'bat-app2c-r'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'LR'),
  },
  {
    id: 'preset-ap-spk-lr',
    category: 'AirPods',
    issue_label: 'Sửa/Thay loa & ANC AirPods (L / R / Cả 2 tai)',
    keywords: ['thay loa airpods', 'loa anc', 'spk-app2c-l', 'spk-app2c-r'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'SPK', 'LR'),
  },
  {
    id: 'preset-ap-mic-lr',
    category: 'AirPods',
    issue_label: 'Thay Mic đàm thoại / Mic ANC AirPods (L / R / Cả 2 tai)',
    keywords: ['thay mic airpods', 'mic đàm thoại', 'mic-app2c-l', 'mic-app2c-r'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MIC', 'LR'),
  },
  {
    id: 'preset-ap-mesh-lr',
    category: 'AirPods',
    issue_label: 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods (L / R / Cả 2 tai)',
    keywords: ['thay lưới chống bụi', 'mesh-app2c-l', 'mesh-app2c-r'],
    linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MESH', 'LR'),
  },
  {
    id: 'preset-ap-anc-mic',
    category: 'AirPods',
    issue_label: 'Lỗi Mic / Chống ồn ANC / Xuyên âm',
    keywords: ['anc', 'rè', 'rít gió', 'chống ồn', 'xuyên âm', 'mic', 'đàm thoại'],
    linked_parts: [
      {
        part_sku: 'MESH-APP-02',
        part_name: 'Lưới chống bụi AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'L/R',
      },
      {
        part_sku: 'FLEX-CASE-01',
        part_name: 'Cáp flex hộp sạc AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
    ],
  },
  {
    id: 'preset-ap-speaker',
    category: 'AirPods',
    issue_label: 'Lỗi Màng loa / Rè loa / Mất tiếng',
    keywords: ['loa', 'màng loa', 'rè loa', 'nhỏ tiếng', 'mất tiếng', 'rè bass', 'tắc màng'],
    linked_parts: [
      {
        part_sku: 'MESH-APP-02',
        part_name: 'Lưới chống bụi AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'L/R',
      },
    ],
  },
  {
    id: 'preset-ap-case',
    category: 'AirPods',
    issue_label: 'Lỗi Hộp sạc không nhận sạc / Đèn cam nhấp nháy',
    keywords: ['hộp sạc', 'case', 'chân sạc', 'không nhận sạc', 'đèn cam', 'dock sạc'],
    linked_parts: [
      {
        part_sku: 'FLEX-CASE-01',
        part_name: 'Cáp flex hộp sạc AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
      {
        part_sku: 'CASE-APP2-04',
        part_name: 'Hộp sạc AirPods Pro 2 USB-C',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
      {
        part_sku: 'BAT-CASE-APP2C',
        part_name: 'Pin hộp sạc AirPods Pro 2 (USB-C)',
        quantity: 1,
        unit: 'Viên',
        position: 'Hộp sạc (Case)',
      },
      {
        part_sku: 'FLEX-CASE-APP2C',
        part_name: 'Cáp flex chân sạc hộp sạc AirPods Pro 2 (USB-C)',
        quantity: 1,
        unit: 'Cái',
        position: 'Hộp sạc (Case)',
      },
    ],
  },
  {
    id: 'preset-aw-pin',
    category: 'Apple Watch',
    issue_label: 'Lỗi Pin Apple Watch (Pin phù, sụt nhanh, bung màn)',
    keywords: ['pin', 'phù pin', 'bung màn', 'tụt pin', 'sập nguồn', 'pin apple watch'],
    linked_parts: [
      {
        part_sku: 'AW-BAT-01',
        part_name: 'Pin Apple Watch chuẩn dung lượng',
        quantity: 1,
        unit: 'Viên',
        position: 'Body',
      },
    ],
  },
  {
    id: 'preset-aw-glass',
    category: 'Apple Watch',
    issue_label: 'Lỗi Mặt kính / Cảm ứng Apple Watch (Liệt cảm ứng, vỡ mặt kính)',
    keywords: ['cảm ứng', 'liệt cảm ứng', 'loạn cảm ứng', 'vỡ kính', 'ép kính', 'mặt kính', 'màn hình'],
    linked_parts: [
      {
        part_sku: 'AW-GLASS-01',
        part_name: 'Mặt kính cảm ứng Apple Watch',
        quantity: 1,
        unit: 'Cái',
        position: 'Body',
      },
    ],
  },
  {
    id: 'preset-apen-tip-pin',
    category: 'Apple Pencil',
    issue_label: 'Lỗi Apple Pencil (Ngòi mòn, đứt nét, kiệt pin không nhận sạc)',
    keywords: ['apple pencil', 'pencil', 'pin', 'kiệt pin', 'ngòi', 'đứt nét', 'cảm ứng lực', 'đầu bút'],
    linked_parts: [
      {
        part_sku: 'APEN-TIP-01',
        part_name: 'Linh kiện đầu ngòi & cell pin Apple Pencil',
        quantity: 1,
        unit: 'Bộ',
        position: 'Body',
      },
    ],
  },
];

export const COMMON_ISSUE_CATALOG_BY_CATEGORY: Record<string, CommonIssueCatalogItem[]> = {
  AirPods: [
    {
      id: 1,
      issue_code: 'ISS-AP-001',
      category: 'AirPods',
      issue_name: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
      keywords: ['pin', 'chai pin', 'tụt pin', 'sụt pin', 'sập nguồn', 'nhanh hết pin', 'thay pin airpods'],
      solution: 'Thay cell pin tai nghe AirPods chuẩn dung lượng trong kho và vệ sinh lưới loa.',
      estimated_cost: 250000,
      estimated_time: '45 - 60 phút',
      linked_parts: [
        {
          part_sku: 'BAT-APP2-01',
          part_name: 'Pin tai nghe AirPods Pro 2',
          quantity: 1,
          unit: 'Viên',
          position: 'L/R',
        },
      ],
    },
    {
      id: 2,
      issue_code: 'ISS-AP-002',
      category: 'AirPods',
      issue_name: 'Bật chống ồn ANC bị rè, rít gió chói tai',
      keywords: ['anc', 'rè', 'rít gió', 'chống ồn', 'xuyên âm', 'màng loa', 'mic chống ồn'],
      solution: 'Thay lưới chống bụi buồng âm AirPods Pro và kiểm tra cáp flex hộp sạc.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      linked_parts: [
        {
          part_sku: 'MESH-APP-02',
          part_name: 'Lưới chống bụi AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
        {
          part_sku: 'FLEX-CASE-01',
          part_name: 'Cáp flex hộp sạc AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'Case',
        },
      ],
    },
    {
      id: 3,
      issue_code: 'ISS-AP-003',
      category: 'AirPods',
      issue_name: 'Loa một bên nhỏ tiếng hoặc rè bass',
      keywords: ['loa', 'nhỏ tiếng', 'mất tiếng', 'rè bass', 'driver', 'âm thanh nhỏ', 'màng loa', 'rè loa'],
      solution: 'Vệ sinh siêu âm màng loa và thay lưới chống bụi AirPods Pro mới.',
      estimated_cost: 200000,
      estimated_time: '45 phút',
      linked_parts: [
        {
          part_sku: 'MESH-APP-02',
          part_name: 'Lưới chống bụi AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
      ],
    },
    {
      id: 4,
      issue_code: 'ISS-AP-004',
      category: 'AirPods',
      issue_name: 'Hộp sạc không nhận sạc hoặc không sạc được cho tai',
      keywords: ['hộp sạc', 'case', 'chân sạc', 'không nhận sạc', 'dock sạc', 'mất nguồn hộp', 'chấu đồng', 'đèn cam'],
      solution: 'Thay cáp flex hộp sạc AirPods Pro hoặc thay cụm hộp sạc AirPods Pro 2 USB-C.',
      estimated_cost: 300000,
      estimated_time: '60 - 90 phút',
      linked_parts: [
        {
          part_sku: 'FLEX-CASE-01',
          part_name: 'Cáp flex hộp sạc AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'Case',
        },
        {
          part_sku: 'CASE-APP2-04',
          part_name: 'Hộp sạc AirPods Pro 2 USB-C',
          quantity: 1,
          unit: 'Cái',
          position: 'Case',
        },
      ],
    },
    {
      id: 5,
      issue_code: 'ISS-AP-005',
      category: 'AirPods',
      issue_name: 'Bám bẩn lâu ngày, tắc màng âm thanh',
      keywords: ['vệ sinh', 'bẩn', 'tắc màng', 'lưới loa', 'nhỏ tiếng do bẩn'],
      solution: 'Vệ sinh chuyên sâu bằng sóng siêu âm và thay lưới chống bụi AirPods Pro.',
      estimated_cost: 100000,
      estimated_time: '30 phút',
      linked_parts: [
        {
          part_sku: 'MESH-APP-02',
          part_name: 'Lưới chống bụi AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
      ],
    },
    {
      id: 6,
      issue_code: 'ISS-AP-006',
      category: 'AirPods',
      issue_name: 'Mic đàm thoại nhỏ, gọi điện bên kia không nghe',
      keywords: ['mic', 'đàm thoại', 'gọi điện', 'mất mic', 'thu âm'],
      solution: 'Thay lưới chống bụi mic và xử lý cáp flex tiếp xúc hộp sạc.',
      estimated_cost: 250000,
      estimated_time: '60 phút',
      linked_parts: [
        {
          part_sku: 'MESH-APP-02',
          part_name: 'Lưới chống bụi AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
        {
          part_sku: 'FLEX-CASE-01',
          part_name: 'Cáp flex hộp sạc AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'Case',
        },
      ],
    },
    {
      id: 7,
      issue_code: 'ISS-AP-007',
      category: 'AirPods',
      issue_name: 'Pin AirPods Pro 1 chai, báo ảo hoặc sập nguồn',
      keywords: ['pin airpods pro', 'chai pin pro 1', 'thay pin airpods pro 1', 'BAT-APP-01'],
      solution: 'Thay cell pin tai nghe AirPods Pro chuẩn dung lượng.',
      estimated_cost: 250000,
      estimated_time: '45 - 60 phút',
      linked_parts: [
        {
          part_sku: 'BAT-APP-01',
          part_name: 'Pin tai nghe AirPods Pro',
          quantity: 1,
          unit: 'Viên',
          position: 'L/R',
        },
      ],
    },
    {
      id: 8,
      issue_code: 'ISS-AP-008',
      category: 'AirPods',
      issue_name: 'Pin AirPods 3 / AirPods 2 tụt nhanh dưới 30 phút',
      keywords: ['pin airpods 3', 'pin airpods 2', 'thay pin airpods 3', 'BAT-APP3-02'],
      solution: 'Thay cell pin tai nghe AirPods 3 chuẩn dung lượng.',
      estimated_cost: 220000,
      estimated_time: '45 - 60 phút',
      linked_parts: [
        {
          part_sku: 'BAT-APP3-02',
          part_name: 'Pin tai nghe AirPods 3',
          quantity: 1,
          unit: 'Viên',
          position: 'L/R',
        },
      ],
    },
    // --- Bộ danh mục lỗi AirPods chuẩn BOM phân tách rõ L / R / Cả 2 tai (L + R) ---
    {
      id: 101,
      issue_code: 'ISS-APP2C-BAT-L',
      category: 'AirPods',
      issue_name: 'Thay pin AirPods - 1 bên Tai Trái (L)',
      keywords: ['thay pin tai trái', 'pin tai l', '1 bên tai trái', 'tai trái (l)'],
      solution: 'Thay cell pin tai nghe AirPods bên Tai Trái (L) chuẩn dung lượng.',
      estimated_cost: 300000,
      estimated_time: '45 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'L'),
    },
    {
      id: 102,
      issue_code: 'ISS-APP2C-BAT-R',
      category: 'AirPods',
      issue_name: 'Thay pin AirPods - 1 bên Tai Phải (R)',
      keywords: ['thay pin tai phải', 'pin tai r', '1 bên tai phải', 'tai phải (r)'],
      solution: 'Thay cell pin tai nghe AirPods bên Tai Phải (R) chuẩn dung lượng.',
      estimated_cost: 300000,
      estimated_time: '45 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'R'),
    },
    {
      id: 103,
      issue_code: 'ISS-APP2C-BAT-LR',
      category: 'AirPods',
      issue_name: 'Thay pin AirPods - Cả 2 tai (L + R)',
      keywords: ['thay pin cả 2 tai', 'thay pin 2 tai', 'cả 2 tai (l + r)', 'pin 2 bên'],
      solution: 'Thay đồng bộ 2 viên pin tai nghe AirPods (1 Tai Trái L + 1 Tai Phải R).',
      estimated_cost: 550000,
      estimated_time: '60 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'BAT', 'LR'),
    },
    {
      id: 104,
      issue_code: 'ISS-APP2C-SPK-L',
      category: 'AirPods',
      issue_name: 'Sửa/Thay loa & ANC AirPods - 1 bên Tai Trái (L)',
      keywords: ['thay loa tai trái', 'loa tai l', 'anc tai trái', '1 bên tai trái'],
      solution: 'Thay cụm loa Driver & xử lý chống ồn ANC bên Tai Trái (L).',
      estimated_cost: 400000,
      estimated_time: '60 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'SPK', 'L'),
    },
    {
      id: 105,
      issue_code: 'ISS-APP2C-SPK-R',
      category: 'AirPods',
      issue_name: 'Sửa/Thay loa & ANC AirPods - 1 bên Tai Phải (R)',
      keywords: ['thay loa tai phải', 'loa tai r', 'anc tai phải', '1 bên tai phải'],
      solution: 'Thay cụm loa Driver & xử lý chống ồn ANC bên Tai Phải (R).',
      estimated_cost: 400000,
      estimated_time: '60 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'SPK', 'R'),
    },
    {
      id: 106,
      issue_code: 'ISS-APP2C-SPK-LR',
      category: 'AirPods',
      issue_name: 'Sửa/Thay loa & ANC AirPods - Cả 2 tai (L + R)',
      keywords: ['thay loa cả 2 tai', 'thay loa 2 tai', 'anc cả 2 tai', 'cả 2 tai (l + r)'],
      solution: 'Thay đồng bộ 2 cụm loa Driver & cân chỉnh ANC cả 2 tai (1 L + 1 R).',
      estimated_cost: 750000,
      estimated_time: '60 - 90 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'SPK', 'LR'),
    },
    {
      id: 107,
      issue_code: 'ISS-APP2C-MIC-L',
      category: 'AirPods',
      issue_name: 'Thay Mic đàm thoại / Mic ANC AirPods - 1 bên Tai Trái (L)',
      keywords: ['thay mic tai trái', 'mic tai l', '1 bên tai trái'],
      solution: 'Thay cụm cáp Mic đàm thoại / Mic ANC bên Tai Trái (L).',
      estimated_cost: 320000,
      estimated_time: '60 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MIC', 'L'),
    },
    {
      id: 108,
      issue_code: 'ISS-APP2C-MIC-R',
      category: 'AirPods',
      issue_name: 'Thay Mic đàm thoại / Mic ANC AirPods - 1 bên Tai Phải (R)',
      keywords: ['thay mic tai phải', 'mic tai r', '1 bên tai phải'],
      solution: 'Thay cụm cáp Mic đàm thoại / Mic ANC bên Tai Phải (R).',
      estimated_cost: 320000,
      estimated_time: '60 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MIC', 'R'),
    },
    {
      id: 109,
      issue_code: 'ISS-APP2C-MIC-LR',
      category: 'AirPods',
      issue_name: 'Thay Mic đàm thoại / Mic ANC AirPods - Cả 2 tai (L + R)',
      keywords: ['thay mic cả 2 tai', 'thay mic 2 tai', 'cả 2 tai (l + r)'],
      solution: 'Thay đồng bộ 2 cụm cáp Mic đàm thoại / Mic ANC cả 2 tai (1 L + 1 R).',
      estimated_cost: 600000,
      estimated_time: '60 - 90 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MIC', 'LR'),
    },
    {
      id: 110,
      issue_code: 'ISS-APP2C-MESH-L',
      category: 'AirPods',
      issue_name: 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - 1 bên Tai Trái (L)',
      keywords: ['thay lưới tai trái', 'lưới tai l', '1 bên tai trái'],
      solution: 'Vệ sinh siêu âm và thay lưới chống bụi âm thanh bên Tai Trái (L).',
      estimated_cost: 80000,
      estimated_time: '30 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MESH', 'L'),
    },
    {
      id: 111,
      issue_code: 'ISS-APP2C-MESH-R',
      category: 'AirPods',
      issue_name: 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - 1 bên Tai Phải (R)',
      keywords: ['thay lưới tai phải', 'lưới tai r', '1 bên tai phải'],
      solution: 'Vệ sinh siêu âm và thay lưới chống bụi âm thanh bên Tai Phải (R).',
      estimated_cost: 80000,
      estimated_time: '30 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MESH', 'R'),
    },
    {
      id: 112,
      issue_code: 'ISS-APP2C-MESH-LR',
      category: 'AirPods',
      issue_name: 'Vệ sinh & Thay lưới chống bụi âm thanh AirPods - Cả 2 tai (L + R)',
      keywords: ['thay lưới cả 2 tai', 'thay lưới 2 tai', 'cả 2 tai (l + r)'],
      solution: 'Vệ sinh siêu âm và thay đồng bộ 2 lưới chống bụi âm thanh cả 2 tai (1 L + 1 R).',
      estimated_cost: 140000,
      estimated_time: '30 - 45 phút',
      linked_parts: resolveAirPodsLRPartsForModel('AirPods Pro 2 (USB-C)', 'MESH', 'LR'),
    },
    {
      id: 113,
      issue_code: 'ISS-APP2C-CASE-BAT',
      category: 'AirPods',
      issue_name: 'Thay pin hộp sạc (Case) AirPods',
      keywords: ['thay pin hộp sạc', 'pin case airpods', 'bat-case-app2c'],
      solution: 'Thay pin hộp sạc (Case) AirPods chuẩn dung lượng.',
      estimated_cost: 450000,
      estimated_time: '60 phút',
      linked_parts: [resolveAirPodsCasePartForModel('AirPods Pro 2 (USB-C)', 'CASE_BAT')],
    },
    {
      id: 114,
      issue_code: 'ISS-APP2C-CASE-FLEX',
      category: 'AirPods',
      issue_name: 'Thay cáp flex chân tiếp xúc sạc (Case) AirPods',
      keywords: ['thay cáp flex chân tiếp xúc', 'cáp flex hộp sạc', 'flex-case-app2c'],
      solution: 'Thay cáp flex chân tiếp xúc sạc trong hộp sạc (Case) AirPods.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      linked_parts: [resolveAirPodsCasePartForModel('AirPods Pro 2 (USB-C)', 'CASE_FLEX')],
    },
  ],
  'Apple Watch': [
    {
      id: 11,
      issue_code: 'ISS-AW-001',
      category: 'Apple Watch',
      issue_name: 'Pin phù, sụt nhanh hoặc đẩy bung màn hình',
      keywords: ['pin', 'phù pin', 'bung màn', 'tụt pin', 'sập nguồn', 'pin apple watch'],
      solution: 'Thay pin Apple Watch chuẩn dung lượng và đi lại ron keo áp suất chống nước.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'AW-BAT-01',
          part_name: 'Pin Apple Watch chuẩn dung lượng',
          quantity: 1,
          unit: 'Viên',
          position: 'Body',
        },
      ],
    },
    {
      id: 12,
      issue_code: 'ISS-AW-002',
      category: 'Apple Watch',
      issue_name: 'Cảm ứng liệt hoặc loạn sau va đập / Vỡ mặt kính',
      keywords: ['cảm ứng', 'liệt cảm ứng', 'loạn cảm ứng', 'vỡ kính', 'ép kính', 'mặt kính', 'màn hình'],
      solution: 'Ép lại mặt kính cảm ứng Apple Watch liền mạch trong phòng sạch và đóng ron chống nước.',
      estimated_cost: 450000,
      estimated_time: '90 - 120 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'AW-GLASS-01',
          part_name: 'Mặt kính cảm ứng Apple Watch',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ],
    },
    {
      id: 13,
      issue_code: 'ISS-AW-003',
      category: 'Apple Watch',
      issue_name: 'Không nhận sạc không dây',
      keywords: ['không nhận sạc', 'sạc không dây', 'đế sạc', 'nóng máy khi sạc', 'ic nguồn', 'mâm sạc'],
      solution: 'Kiểm tra nguồn sạc và thay pin Apple Watch chuẩn dung lượng nếu chạm cell.',
      estimated_cost: 300000,
      estimated_time: '90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'AW-BAT-01',
          part_name: 'Pin Apple Watch chuẩn dung lượng',
          quantity: 1,
          unit: 'Viên',
          position: 'Body',
        },
      ],
    },
    {
      id: 14,
      issue_code: 'ISS-AW-004',
      category: 'Apple Watch',
      issue_name: 'Lỗi nút xoay Digital Crown hoặc nút nguồn sườn',
      keywords: ['digital crown', 'nút xoay', 'nút nguồn', 'liệt nút', 'kẹt nút'],
      solution: 'Tháo mặt kính cảm ứng Apple Watch, vệ sinh cổ trục Digital Crown và đóng lại màn.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'AW-GLASS-01',
          part_name: 'Mặt kính cảm ứng Apple Watch',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ],
    },
  ],
  'Apple Pencil': [
    {
      id: 21,
      issue_code: 'ISS-PN-001',
      category: 'Apple Pencil',
      issue_name: 'Pin kiệt không nhận sạc từ iPad',
      keywords: ['pin', 'kiệt pin', 'không nhận sạc', 'bút không lên nguồn', 'pencil'],
      solution: 'Kích áp hoặc thay bộ linh kiện đầu ngòi & cell pin Apple Pencil.',
      estimated_cost: 250000,
      estimated_time: '60 phút',
      linked_parts: [
        {
          part_sku: 'APEN-TIP-01',
          part_name: 'Linh kiện đầu ngòi & cell pin Apple Pencil',
          quantity: 1,
          unit: 'Bộ',
          position: 'Body',
        },
      ],
    },
    {
      id: 22,
      issue_code: 'ISS-PN-002',
      category: 'Apple Pencil',
      issue_name: 'Ngòi mòn, đứt nét hoặc mất cảm ứng lực',
      keywords: ['ngòi', 'đứt nét', 'cảm ứng lực', 'mất nét', 'đầu bút'],
      solution: 'Thay linh kiện đầu ngòi & cell pin Apple Pencil chính hãng và căn chỉnh áp lực.',
      estimated_cost: 150000,
      estimated_time: '30 phút',
      linked_parts: [
        {
          part_sku: 'APEN-TIP-01',
          part_name: 'Linh kiện đầu ngòi & cell pin Apple Pencil',
          quantity: 1,
          unit: 'Bộ',
          position: 'Body',
        },
      ],
    },
  ],
};

// Hỗ trợ truy cập qua cả key 'AirPods' lẫn 'AIRPODS' mà không làm nhân đôi Object.values()
Object.defineProperty(COMMON_ISSUE_CATALOG_BY_CATEGORY, 'AIRPODS', {
  get() {
    return COMMON_ISSUE_CATALOG_BY_CATEGORY.AirPods;
  },
  enumerable: false,
  configurable: true,
});

export const ALL_COMMON_ISSUE_CATALOG: CommonIssueCatalogItem[] = Object.values(
  COMMON_ISSUE_CATALOG_BY_CATEGORY
).flat();

const KNOWN_CATEGORY_NAMES = new Set([
  'airpods',
  'apple watch',
  'apple pencil',
  'macbook',
  'ipad',
  'khác',
]);

function normalizeCategoryAndModelInputs(
  issueCategory?: string | null,
  categoryOrModelName?: string | null,
  watchSize?: string | null,
  deviceModelName?: string | null
): {
  resolvedCategory: string;
  effectiveWatchSize?: string;
  effectiveModelName?: string;
} {
  const rawArg2 = (categoryOrModelName || '').trim();
  const rawModel = (deviceModelName || '').trim();
  const isArg2KnownCategory = rawArg2 ? KNOWN_CATEGORY_NAMES.has(rawArg2.toLowerCase()) : false;

  const effectiveModelName = rawModel || (!isArg2KnownCategory && rawArg2 ? rawArg2 : undefined);

  let resolvedCategory = isArg2KnownCategory
    ? rawArg2 === 'AIRPODS'
      ? 'AirPods'
      : rawArg2
    : (issueCategory || '').trim();

  if (!resolvedCategory || resolvedCategory.toUpperCase() === 'AIRPODS') {
    const modelLower = (effectiveModelName || '').toLowerCase();
    if (modelLower.includes('watch')) {
      resolvedCategory = 'Apple Watch';
    } else if (modelLower.includes('pencil') || modelLower.includes('bút')) {
      resolvedCategory = 'Apple Pencil';
    } else {
      resolvedCategory = 'AirPods';
    }
  }

  return {
    resolvedCategory,
    effectiveWatchSize: (watchSize || '').trim() || undefined,
    effectiveModelName,
  };
}

/**
 * Gắn thông tin watch_size vào tên linh kiện nếu là Apple Watch và đã chọn size
 */
export function applyWatchSizeToLinkedPart(
  part: LinkedPartItem,
  watchSize?: string,
  category?: string
): LinkedPartItem {
  const cleanSize = (watchSize || part.watch_size || '').trim();
  const isWatch =
    category === 'Apple Watch' ||
    part.part_sku.startsWith('AW-') ||
    part.part_sku.includes('-AW') ||
    part.part_name.toLowerCase().includes('apple watch');

  if (!cleanSize || !isWatch) {
    return { ...part };
  }

  // Strip existing [Size ...] tag before re-attaching
  const baseName = part.part_name.replace(/\s*\[Size[:\s]*[^\]]+\]/gi, '').trim();
  return {
    ...part,
    watch_size: cleanSize,
    part_name: `${baseName} [Size ${cleanSize}]`,
  };
}

const LEGACY_UNSCOPED_AIRPODS_CODES = new Set([
  'ISS-AP-002',
  'ISS-AP-003',
  'ISS-AP-004',
  'ISS-AP-005',
  'ISS-AP-006',
]);

/**
 * Bổ sung tự động linked_parts và keywords cho cả dữ liệu từ API.
 * Hỗ trợ gọi theo cả 2 dạng:
 * - enrichCommonIssueWithParts(issue, modelName)
 * - enrichCommonIssueWithParts(issue, category, watchSize, deviceModelName)
 * Khi có modelName (ví dụ 'AirPods 2'), tự động đồng bộ mã SKU và tên linh kiện sang đúng đời máy đó
 * (BAT-AP2-L, BAT-AP2-R, SPK-AP2-L/R, MIC-AP2-L/R, MESH-AP2-L/R) và đúng phạm vi (L, R, hoặc L + R).
 */
export function enrichCommonIssueWithParts(
  issue: CommonIssueItem | CommonIssueCatalogItem,
  category?: string,
  watchSize?: string,
  deviceModelName?: string
): CommonIssueCatalogItem {
  const {
    resolvedCategory,
    effectiveWatchSize,
    effectiveModelName,
  } = normalizeCategoryAndModelInputs(issue.category, category, watchSize, deviceModelName);

  const catalogList =
    COMMON_ISSUE_CATALOG_BY_CATEGORY[resolvedCategory] || ALL_COMMON_ISSUE_CATALOG;

  const issueNameLower = (issue.issue_name || '').trim().toLowerCase();

  // 1. Tìm trong catalog theo id, issue_code hoặc tên lỗi
  const rawIssueCode = ((issue as CommonIssueCatalogItem).issue_code || '').trim().toUpperCase();
  const matchedCatalog =
    catalogList.find(
      (item) =>
        (rawIssueCode && item.issue_code.toUpperCase() === rawIssueCode) ||
        (issue.id !== undefined && item.id === issue.id && item.category === resolvedCategory) ||
        item.issue_name.toLowerCase() === issueNameLower ||
        issueNameLower.includes(item.issue_name.toLowerCase()) ||
        item.issue_name.toLowerCase().includes(issueNameLower)
    ) ||
    ALL_COMMON_ISSUE_CATALOG.find(
      (item) =>
        (rawIssueCode && item.issue_code.toUpperCase() === rawIssueCode) ||
        item.issue_name.toLowerCase() === issueNameLower ||
        (issueNameLower.length > 5 &&
          (issueNameLower.includes(item.issue_name.toLowerCase()) ||
            item.issue_name.toLowerCase().includes(issueNameLower)))
    );

  const backendLinkedParts = (issue as CommonIssueCatalogItem).linked_parts;
  const hasBackendLinkedParts =
    Array.isArray(backendLinkedParts) && backendLinkedParts.length > 0;

  let rawParts: LinkedPartItem[] = hasBackendLinkedParts
    ? backendLinkedParts.map((p) => ({
        part_sku: p.part_sku,
        part_name: p.part_name,
        quantity: Math.max(1, Number(p.quantity) || 1),
        unit: p.unit || 'Cái',
        position: p.position,
        watch_size: p.watch_size,
      }))
    : matchedCatalog?.linked_parts && matchedCatalog.linked_parts.length > 0
    ? matchedCatalog.linked_parts.map((p) => ({ ...p }))
    : inferFallbackPartsByText(issue.issue_name, resolvedCategory, effectiveModelName);

  let resolvedIssueCode =
    rawIssueCode ||
    matchedCatalog?.issue_code ||
    `ISS-${resolvedCategory.slice(0, 2).toUpperCase()}-${String(issue.id || 99).padStart(3, '0')}`;

  let resolvedEstimatedCost = issue.estimated_cost ?? matchedCatalog?.estimated_cost;

  // Đồng bộ SKU + tên linh kiện theo đúng đời máy AirPods và phạm vi (L / R / L + R) khi biết effectiveModelName
  if (resolvedCategory === 'AirPods' && effectiveModelName) {
    const candidateForDetect: CommonIssueCatalogItem = {
      ...(matchedCatalog || {}),
      ...issue,
      issue_code: resolvedIssueCode,
      category: 'AirPods',
      issue_name: issue.issue_name,
      keywords: [],
      linked_parts: rawParts,
    };

    const detectedScope = detectAirPodsEarScopeFromIssue(candidateForDetect);
    const detectedType = detectAirPodsPartTypeFromIssue(candidateForDetect);
    const hasExplicitScopeInNameOrCode =
      resolvedIssueCode.endsWith('-L') ||
      resolvedIssueCode.endsWith('-R') ||
      resolvedIssueCode.endsWith('-LR') ||
      issueNameLower.includes('tai trái') ||
      issueNameLower.includes('tai phải') ||
      issueNameLower.includes('cả 2 tai') ||
      issueNameLower.includes('2 tai') ||
      issueNameLower.includes('l + r') ||
      issueNameLower.includes('(l)') ||
      issueNameLower.includes('(r)');

    const isUnscopedLegacyNonBattery =
      LEGACY_UNSCOPED_AIRPODS_CODES.has(resolvedIssueCode) && !hasExplicitScopeInNameOrCode;

    if (!isUnscopedLegacyNonBattery && detectedType) {
      const prefix = resolveAirPodsModelPrefix(effectiveModelName);
      const meta = AIRPODS_MODEL_META[prefix];

      if (detectedType === 'CASE_BAT' || detectedType === 'CASE_FLEX') {
        rawParts = [resolveAirPodsCasePartForModel(effectiveModelName, detectedType)];
        if (resolvedIssueCode.includes('-CASE-')) {
          resolvedIssueCode =
            detectedType === 'CASE_BAT' ? `ISS-${prefix}-CASE-BAT` : `ISS-${prefix}-CASE-FLEX`;
        }
        resolvedEstimatedCost =
          detectedType === 'CASE_BAT' ? meta.prices.CASE_BAT : meta.prices.CASE_FLEX;
      } else {
        const effectiveScope: AirPodsEarScope =
          detectedScope === 'L' || detectedScope === 'R' || detectedScope === 'LR'
            ? detectedScope
            : 'LR';
        rawParts = resolveAirPodsLRPartsForModel(
          effectiveModelName,
          detectedType,
          effectiveScope
        );
        if (
          resolvedIssueCode.endsWith('-L') ||
          resolvedIssueCode.endsWith('-R') ||
          resolvedIssueCode.endsWith('-LR')
        ) {
          resolvedIssueCode = `ISS-${prefix}-${detectedType}-${effectiveScope}`;
        }
        const costMap: Record<AirPodsPartType, number> = {
          BAT: effectiveScope === 'LR' ? meta.prices.BAT_LR : meta.prices.BAT_SINGLE,
          SPK: effectiveScope === 'LR' ? meta.prices.SPK_LR : meta.prices.SPK_SINGLE,
          MIC: effectiveScope === 'LR' ? meta.prices.MIC_LR : meta.prices.MIC_SINGLE,
          MESH: effectiveScope === 'LR' ? meta.prices.MESH_LR : meta.prices.MESH_SINGLE,
        };
        resolvedEstimatedCost = costMap[detectedType];
      }
    }
  }

  const enrichedParts = rawParts.map((p) =>
    applyWatchSizeToLinkedPart(p, effectiveWatchSize, resolvedCategory)
  );

  const keywords =
    Array.isArray((issue as CommonIssueCatalogItem).keywords) &&
    (issue as CommonIssueCatalogItem).keywords.length > 0
      ? (issue as CommonIssueCatalogItem).keywords
      : matchedCatalog?.keywords || [
          issue.issue_name.toLowerCase(),
          resolvedCategory.toLowerCase(),
        ];

  return {
    ...matchedCatalog,
    ...issue,
    id: issue.id ?? matchedCatalog?.id,
    issue_code: resolvedIssueCode,
    category: resolvedCategory,
    issue_name: issue.issue_name,
    keywords,
    solution: issue.solution || matchedCatalog?.solution,
    estimated_cost: resolvedEstimatedCost,
    estimated_time: issue.estimated_time || matchedCatalog?.estimated_time,
    watch_sizes:
      resolvedCategory === 'Apple Watch'
        ? [...POPULAR_APPLE_WATCH_SIZES]
        : matchedCatalog?.watch_sizes,
    linked_parts: enrichedParts,
  };
}

export function inferFallbackPartsByText(
  issueName: string,
  category?: string,
  deviceModelName?: string
): LinkedPartItem[] {
  const lower = (issueName || '').toLowerCase();
  const { resolvedCategory, effectiveModelName } = normalizeCategoryAndModelInputs(
    undefined,
    category,
    undefined,
    deviceModelName
  );
  const modelTarget = effectiveModelName || issueName;

  if (resolvedCategory === 'Apple Watch' || lower.includes('watch')) {
    if (lower.includes('kính') || lower.includes('cảm ứng') || lower.includes('màn')) {
      return [
        {
          part_sku: 'AW-GLASS-01',
          part_name: 'Mặt kính cảm ứng Apple Watch',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ];
    }
    return [
      {
        part_sku: 'AW-BAT-01',
        part_name: 'Pin Apple Watch chuẩn dung lượng',
        quantity: 1,
        unit: 'Viên',
        position: 'Body',
      },
    ];
  }

  if (resolvedCategory === 'Apple Pencil' || lower.includes('pencil') || lower.includes('bút')) {
    return [
      {
        part_sku: 'APEN-TIP-01',
        part_name: 'Linh kiện đầu ngòi & cell pin Apple Pencil',
        quantity: 1,
        unit: 'Bộ',
        position: 'Body',
      },
    ];
  }

  const hasExplicitEarScope =
    lower.includes('tai trái') ||
    lower.includes('tai phải') ||
    lower.includes('cả 2 tai') ||
    lower.includes('2 tai') ||
    lower.includes('l + r') ||
    lower.includes('l+r') ||
    lower.includes('(l)') ||
    lower.includes('(r)');

  if (effectiveModelName || hasExplicitEarScope) {
    if (lower.includes('hộp') || lower.includes('case') || lower.includes('dock')) {
      if (lower.includes('pin')) {
        return [resolveAirPodsCasePartForModel(modelTarget, 'CASE_BAT')];
      }
      return [resolveAirPodsCasePartForModel(modelTarget, 'CASE_FLEX')];
    }

    const scope = normalizeAirPodsEarScope(issueName);
    if (lower.includes('lưới') || lower.includes('vệ sinh') || lower.includes('bẩn') || lower.includes('tắc màng')) {
      return resolveAirPodsLRPartsForModel(modelTarget, 'MESH', scope);
    }
    if (lower.includes('mic') || lower.includes('đàm thoại') || lower.includes('gọi điện')) {
      return resolveAirPodsLRPartsForModel(modelTarget, 'MIC', scope);
    }
    if (
      lower.includes('loa') ||
      lower.includes('anc') ||
      lower.includes('chống ồn') ||
      lower.includes('xuyên âm') ||
      lower.includes('rè') ||
      lower.includes('nhỏ tiếng') ||
      lower.includes('mất tiếng')
    ) {
      return resolveAirPodsLRPartsForModel(modelTarget, 'SPK', scope);
    }
    return resolveAirPodsLRPartsForModel(modelTarget, 'BAT', scope);
  }

  // Fallback tương thích ngược khi không truyền modelName và không ghi rõ bên L/R
  if (lower.includes('anc') || lower.includes('chống ồn') || lower.includes('rít') || lower.includes('xuyên âm') || lower.includes('mic')) {
    return [
      {
        part_sku: 'MESH-APP-02',
        part_name: 'Lưới chống bụi AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'L/R',
      },
      {
        part_sku: 'FLEX-CASE-01',
        part_name: 'Cáp flex hộp sạc AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
    ];
  }
  if (lower.includes('loa') || lower.includes('nhỏ tiếng') || lower.includes('rè') || lower.includes('mất tiếng') || lower.includes('bẩn') || lower.includes('vệ sinh')) {
    return [
      {
        part_sku: 'MESH-APP-02',
        part_name: 'Lưới chống bụi AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'L/R',
      },
    ];
  }
  if (lower.includes('hộp') || lower.includes('case') || lower.includes('dock') || lower.includes('đèn cam') || lower.includes('không nhận sạc')) {
    return [
      {
        part_sku: 'FLEX-CASE-01',
        part_name: 'Cáp flex hộp sạc AirPods Pro',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
      {
        part_sku: 'CASE-APP2-04',
        part_name: 'Hộp sạc AirPods Pro 2 USB-C',
        quantity: 1,
        unit: 'Cái',
        position: 'Case',
      },
    ];
  }

  return resolveAirPodsLRPartsForModel(modelTarget, 'BAT', 'LR');
}

/**
 * Định dạng danh sách linh kiện thành chuỗi tóm tắt chuẩn gửi lên API parts_needed / parts_used
 * Ví dụ: "Pin tai nghe AirPods 2 - Tai Trái (L) (BAT-AP2-L) x1, Pin tai nghe AirPods 2 - Tai Phải (R) (BAT-AP2-R) x1"
 */
export function formatLinkedPartsSummary(parts: LinkedPartItem[], watchSize?: string): string {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  return parts
    .map((p) => {
      const sized = watchSize ? applyWatchSizeToLinkedPart(p, watchSize) : p;
      const qty = Math.max(1, Number(sized.quantity) || 1);
      return `${sized.part_name} (${sized.part_sku}) x${qty}`;
    })
    .join(', ');
}

/**
 * Hợp nhất các linked_parts từ nhiều lỗi đang chọn:
 * - Giữ nguyên 2 dòng độc lập SKU-L x1 và SKU-R x1 khi chọn lỗi Cả 2 tai (L + R).
 * - Nếu cùng một part_sku xuất hiện ở nhiều lỗi khác nhau thì cộng dồn quantity (ngoại trừ các mã legacy dùng chung MESH-APP-02 / FLEX-CASE-01).
 */
export function mergeLinkedPartsFromIssues(
  issues: (CommonIssueItem | CommonIssueCatalogItem)[],
  category?: string,
  watchSize?: string,
  deviceModelName?: string
): LinkedPartItem[] {
  const map = new Map<string, LinkedPartItem>();
  for (const rawIssue of issues) {
    const enriched = enrichCommonIssueWithParts(rawIssue, category, watchSize, deviceModelName);
    for (const part of enriched.linked_parts) {
      const key = `${part.part_sku}__${part.watch_size || ''}`;
      const qty = Math.max(1, Number(part.quantity) || 1);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...part, quantity: qty });
      } else {
        existing.quantity = Math.max(1, Number(existing.quantity) || 1) + qty;
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Tạo khóa định danh duy nhất cho mỗi lỗi theo Danh mục + Mã dòng máy + Tên lỗi
 * Đảm bảo khi đổi sang mã sản phẩm khác không bao giờ mang theo trạng thái chọn lỗi cũ do trùng index/id.
 */
export function buildDeviceIssueSelectionKey(
  category?: string | null,
  deviceModel?: string | number | null,
  issueName?: string | null
): string {
  const normCat = (category || 'AirPods').trim().toLowerCase();
  const normModel = String(deviceModel || 'all').trim().toLowerCase();
  const normIssue = (issueName || '').trim().toLowerCase();
  return `${normCat}::${normModel}::${normIssue}`;
}

/**
 * Bật/tắt nhanh một lỗi trong ô mô tả lỗi (hỗ trợ tên lỗi có chứa dấu phẩy và tag [Size: ...])
 */
export function toggleIssueNameInDescription(
  prevText: string | undefined | null,
  issueName: string,
  category?: string,
  watchSize?: string
): { nextText: string; isNowSelected: boolean } {
  const current = (prevText || '').trim();
  const target = (issueName || '').trim();
  if (!target) {
    return { nextText: current, isNowSelected: false };
  }

  const isAlreadySelected = current.toLowerCase().includes(target.toLowerCase());
  if (!isAlreadySelected) {
    if (!current) {
      const firstText =
        category === 'Apple Watch' && watchSize
          ? applyWatchSizeTagToText(target, watchSize)
          : target;
      return { nextText: firstText, isNowSelected: true };
    }
    const base = current.replace(/[,\s;]+$/, '');
    const joined = `${base}, ${target}`;
    const finalJoined =
      category === 'Apple Watch' && watchSize
        ? applyWatchSizeTagToText(joined, watchSize)
        : joined;
    return { nextText: finalJoined, isNowSelected: true };
  }

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const removed = current
    .replace(new RegExp(escaped, 'gi'), '')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/^(\[Size:\s*[^\]]+\]\s*)[,\s;]+/i, '$1')
    .replace(/^[,\s;]+|[,\s;]+$/g, '')
    .trim();

  if (!removed || /^\[Size:\s*[^\]]+\]$/i.test(removed)) {
    return { nextText: '', isNowSelected: false };
  }

  return { nextText: removed, isNowSelected: false };
}

function extractExplicitAirPodsPrefixFromIssueName(
  issueName?: string | null
): AirPodsModelPrefix | null {
  const lower = (issueName || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('airpods max')) return 'APM';
  if (lower.includes('airpods pro 2') && lower.includes('lightning')) return 'APP2L';
  if (lower.includes('airpods pro 2')) return 'APP2C';
  if (lower.includes('airpods pro')) return 'APP1';
  if (lower.includes('airpods 3') || lower.includes('airpods 4')) return 'AP3';
  if (lower.includes('airpods 2')) return 'AP2';
  return null;
}

/**
 * Lọc danh sách lỗi thường gặp theo từ khóa (tên lỗi, mã lỗi, keywords, tên linh kiện, SKU)
 */
export function filterCommonIssues(
  issues: (CommonIssueItem | CommonIssueCatalogItem)[],
  query: string,
  category?: string,
  watchSize?: string,
  deviceModelName?: string
): CommonIssueCatalogItem[] {
  const {
    resolvedCategory,
    effectiveWatchSize,
    effectiveModelName,
  } = normalizeCategoryAndModelInputs(undefined, category, watchSize, deviceModelName);

  const modelLower = (effectiveModelName || '').trim().toLowerCase();
  const targetPrefix =
    resolvedCategory === 'AirPods' && effectiveModelName
      ? resolveAirPodsModelPrefix(effectiveModelName)
      : null;

  const seenCodes = new Set<string>();
  const enrichedList = issues
    .filter((rawItem) => {
      if (!modelLower || resolvedCategory !== 'AirPods') return true;
      const code = ((rawItem as CommonIssueCatalogItem).issue_code || '').toUpperCase();
      if (code === 'ISS-AP-007' || code === 'ISS-AP-008') return false;
      const explicitPrefix = extractExplicitAirPodsPrefixFromIssueName(rawItem.issue_name);
      if (explicitPrefix && targetPrefix && explicitPrefix !== targetPrefix) {
        return false;
      }
      return true;
    })
    .map((item) =>
      enrichCommonIssueWithParts(
        item,
        resolvedCategory,
        effectiveWatchSize,
        effectiveModelName
      )
    )
    .filter((item) => {
      const dedupKey = `${item.issue_code}__${item.issue_name.toLowerCase()}`;
      if (seenCodes.has(dedupKey)) return false;
      seenCodes.add(dedupKey);
      return true;
    });

  const cleanQ = (query || '').trim().toLowerCase();
  if (!cleanQ) return enrichedList;

  return enrichedList.filter((item) => {
    if (item.issue_name.toLowerCase().includes(cleanQ)) return true;
    if (item.issue_code.toLowerCase().includes(cleanQ)) return true;
    if (item.solution && item.solution.toLowerCase().includes(cleanQ)) return true;
    if (item.keywords.some((k) => k.toLowerCase().includes(cleanQ))) return true;
    if (
      item.linked_parts.some(
        (p) =>
          p.part_name.toLowerCase().includes(cleanQ) ||
          p.part_sku.toLowerCase().includes(cleanQ)
      )
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Trích xuất size Apple Watch từ chuỗi mô tả lỗi / phụ kiện / linh kiện
 */
export function extractWatchSizeFromText(text?: string | null): string | undefined {
  if (!text) return undefined;
  const tagMatch = text.match(/\[Size[:\s]*([^\]]+)\]/i);
  if (tagMatch && tagMatch[1]) {
    return tagMatch[1].trim();
  }
  for (const size of POPULAR_APPLE_WATCH_SIZES) {
    if (text.toLowerCase().includes(size.toLowerCase())) {
      return size;
    }
  }
  const mmMatch = text.match(/\b(38|40|41|42|44|45|46|49)\s*mm\b/i);
  if (mmMatch) {
    return `${mmMatch[1]}mm`;
  }
  return undefined;
}

/**
 * Chèn hoặc cập nhật tag [Size: XXmm] vào chuỗi mô tả / phụ kiện
 */
export function applyWatchSizeTagToText(text: string, watchSize: string): string {
  const cleanSize = (watchSize || '').trim();
  if (!cleanSize) return text;
  const tag = `[Size: ${cleanSize}]`;
  if (/\[Size[:\s]*[^\]]+\]/i.test(text)) {
    return text.replace(/\[Size[:\s]*[^\]]+\]/gi, tag);
  }
  const trimmed = (text || '').trim();
  return trimmed ? `${tag} ${trimmed}` : tag;
}

/**
 * Suy diễn các Object lỗi và danh sách linh kiện từ mô tả lỗi của đơn hàng
 */
export function inferLinkedPartsFromOrderText(
  issueText?: string | null,
  categoryOrDevice?: string | null,
  explicitWatchSize?: string | null,
  deviceModelName?: string | null
): {
  matchedIssues: CommonIssueCatalogItem[];
  linkedParts: LinkedPartItem[];
  detectedWatchSize?: string;
} {
  const text = (issueText || '').trim();
  const lowerText = text.toLowerCase();
  const catLower = (categoryOrDevice || '').toLowerCase();

  const resolvedCategory =
    catLower.includes('watch')
      ? 'Apple Watch'
      : catLower.includes('pencil') || catLower.includes('bút')
      ? 'Apple Pencil'
      : 'AirPods';

  const detectedWatchSize =
    (explicitWatchSize || '').trim() ||
    extractWatchSizeFromText(text) ||
    extractWatchSizeFromText(categoryOrDevice) ||
    undefined;

  if (!text) {
    return { matchedIssues: [], linkedParts: [], detectedWatchSize };
  }

  const candidateCatalog =
    COMMON_ISSUE_CATALOG_BY_CATEGORY[resolvedCategory] || ALL_COMMON_ISSUE_CATALOG;

  const matchedIssues: CommonIssueCatalogItem[] = [];
  const effectiveModel = deviceModelName || categoryOrDevice || undefined;
  let remainingLowerText = lowerText.replace(/\[size[:\s]*[^\]]+\]/gi, '').trim();

  // 1. Ưu tiên khớp chính xác tên lỗi (chip đã chọn) trước để tránh khớp tràn sang lỗi khác do trùng từ khóa
  for (const item of candidateCatalog) {
    const itemLower = item.issue_name.toLowerCase();
    if (remainingLowerText.includes(itemLower)) {
      matchedIssues.push(
        enrichCommonIssueWithParts(item, resolvedCategory, detectedWatchSize, effectiveModel)
      );
      const escaped = itemLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      remainingLowerText = remainingLowerText
        .replace(new RegExp(escaped, 'gi'), ' ')
        .replace(/[,\s;]+/g, ' ')
        .trim();
    }
  }

  // 2. Nếu phần văn bản còn lại vẫn có mô tả tự do (> 2 ký tự), mới đối chiếu theo keywords
  if (remainingLowerText.length > 2) {
    for (const item of candidateCatalog) {
      if (matchedIssues.some((m) => m.issue_code === item.issue_code)) continue;
      if (
        (item.issue_code === 'ISS-AP-007' || item.issue_code === 'ISS-AP-008') &&
        matchedIssues.some((m) => m.issue_code === 'ISS-AP-001' || m.issue_code.includes('-BAT-'))
      ) {
        continue;
      }
      const keywordHit = item.keywords.some(
        (kw) => kw.length >= 3 && remainingLowerText.includes(kw.toLowerCase())
      );
      if (keywordHit) {
        matchedIssues.push(
          enrichCommonIssueWithParts(item, resolvedCategory, detectedWatchSize, effectiveModel)
        );
      }
    }
  }

  // Nếu không khớp catalog cụ thể nào nhưng có nội dung lỗi, suy diễn linh kiện mặc định theo ngữ cảnh
  if (matchedIssues.length === 0 && text.length > 2) {
    const fallbackIssue = enrichCommonIssueWithParts(
      { issue_name: text, category: resolvedCategory },
      resolvedCategory,
      detectedWatchSize,
      effectiveModel
    );
    matchedIssues.push(fallbackIssue);
  }

  const linkedParts = mergeLinkedPartsFromIssues(
    matchedIssues,
    resolvedCategory,
    detectedWatchSize,
    effectiveModel
  );

  return {
    matchedIssues,
    linkedParts,
    detectedWatchSize,
  };
}

/**
 * Phân tách chuỗi parts_needed / partsUsed ("Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x1, ...") thành mảng LinkedPartItem
 */
export function parsePartsSummaryToItems(
  summaryText?: string | null
): LinkedPartItem[] {
  const raw = (summaryText || '').trim();
  if (!raw) return [];

  const segments = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: LinkedPartItem[] = [];

  segments.forEach((seg, idx) => {
    // Pattern: "Tên linh kiện (SKU-123) x2" or "Tên linh kiện x2"
    const fullMatch = seg.match(/^(.*?)\s*\(([A-Za-z0-9_-]+)\)\s*(?:[x×*]\s*(\d+))?$/i);
    if (fullMatch) {
      const partName = fullMatch[1].trim();
      const partSku = fullMatch[2].trim().toUpperCase();
      const qty = fullMatch[3] ? Math.max(1, Number(fullMatch[3])) : 1;
      const watchSize = extractWatchSizeFromText(partName);
      items.push({
        part_sku: partSku,
        part_name: partName,
        quantity: qty,
        unit: 'Cái',
        watch_size: watchSize,
      });
      return;
    }

    const qtyMatch = seg.match(/^(.*?)\s*[x×*]\s*(\d+)$/i);
    if (qtyMatch) {
      const partName = qtyMatch[1].trim();
      const qty = Math.max(1, Number(qtyMatch[2]));
      const catalogHit = ALL_COMMON_ISSUE_CATALOG.flatMap((i) => i.linked_parts).find(
        (p) =>
          partName.toLowerCase().includes(p.part_name.toLowerCase()) ||
          p.part_name.toLowerCase().includes(partName.toLowerCase())
      );
      items.push({
        part_sku: catalogHit?.part_sku || `BAT-CUSTOM-${String(idx + 1).padStart(2, '0')}`,
        part_name: partName,
        quantity: qty,
        unit: catalogHit?.unit || 'Cái',
        watch_size: extractWatchSizeFromText(partName),
      });
      return;
    }

    const catalogHit = ALL_COMMON_ISSUE_CATALOG.flatMap((i) => i.linked_parts).find(
      (p) =>
        seg.toLowerCase().includes(p.part_name.toLowerCase()) ||
        p.part_name.toLowerCase().includes(seg.toLowerCase()) ||
        seg.toUpperCase().includes(p.part_sku)
    );

    items.push({
      part_sku: catalogHit?.part_sku || `BAT-GEN-${String(idx + 1).padStart(2, '0')}`,
      part_name: seg,
      quantity: 1,
      unit: catalogHit?.unit || 'Cái',
      watch_size: extractWatchSizeFromText(seg),
    });
  });

  return items;
}
