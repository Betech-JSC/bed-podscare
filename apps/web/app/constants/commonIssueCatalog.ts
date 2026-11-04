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

export interface LinkedPartItem {
  part_sku: string;
  part_name: string;
  quantity: number;
  unit: string;
  position?: string; // 'L' | 'R' | 'L/R' | 'Case' | 'Body' | ...
  watch_size?: string;
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

export const COMMON_ISSUE_CATALOG_BY_CATEGORY: Record<string, CommonIssueCatalogItem[]> = {
  AirPods: [
    {
      id: 1,
      issue_code: 'ISS-AP-001',
      category: 'AirPods',
      issue_name: 'Pin chai, tụt pin nhanh dưới 1 tiếng',
      keywords: ['pin', 'chai pin', 'tụt pin', 'sụt pin', 'sập nguồn', 'nhanh hết pin', 'thay pin airpods'],
      solution: 'Thay cell pin dung lượng chuẩn cho tai nghe + vệ sinh lưới loa và dán lại ron keo chống nước.',
      estimated_cost: 250000,
      estimated_time: '45 - 60 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-PIN-CAP',
          part_name: 'Pin tai nghe AirPods dung lượng chuẩn',
          quantity: 1,
          unit: 'Viên',
          position: 'L/R',
        },
        {
          part_sku: 'LK-AP-SEAL-KEO',
          part_name: 'Keo ron chống nước & cố định vỏ tai nghe',
          quantity: 1,
          unit: 'Bộ',
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
      solution: 'Thay cụm mic cảm biến ANC hoặc màng loa Driver chống ồn, cân chỉnh lại áp suất buồng âm.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-MIC-ANC',
          part_name: 'Cụm Mic cảm biến chống ồn ANC AirPods Pro',
          quantity: 1,
          unit: 'Cụm',
          position: 'L/R',
        },
        {
          part_sku: 'LK-AP-LOA-ANC',
          part_name: 'Màng loa Driver AirPods Pro',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
      ],
    },
    {
      id: 3,
      issue_code: 'ISS-AP-003',
      category: 'AirPods',
      issue_name: 'Loa một bên nhỏ tiếng hoặc rè bass',
      keywords: ['loa', 'nhỏ tiếng', 'mất tiếng', 'rè bass', 'driver', 'âm thanh nhỏ'],
      solution: 'Vệ sinh siêu âm màng loa và thay cụm màng loa Driver nếu rách gân loa.',
      estimated_cost: 200000,
      estimated_time: '45 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-DRIVER',
          part_name: 'Cụm màng loa Driver AirPods',
          quantity: 1,
          unit: 'Cái',
          position: 'L/R',
        },
        {
          part_sku: 'LK-AP-MESH',
          part_name: 'Lưới lọc âm chống bụi tai nghe',
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
      keywords: ['hộp sạc', 'case', 'chân sạc', 'không nhận sạc', 'dock sạc', 'mất nguồn hộp', 'chấu đồng'],
      solution: 'Xử lý chấu đồng tiếp xúc đáy dock sạc hoặc thay cụm chân sạc / pin hộp sạc.',
      estimated_cost: 300000,
      estimated_time: '60 - 90 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-CASE-FLEX',
          part_name: 'Cụm cáp chân sạc & chấu đồng Hộp sạc (Case)',
          quantity: 1,
          unit: 'Cụm',
          position: 'Case',
        },
        {
          part_sku: 'LK-AP-CASE-PIN',
          part_name: 'Pin Hộp sạc (Charging Case) AirPods',
          quantity: 1,
          unit: 'Viên',
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
      solution: 'Vệ sinh chuyên sâu bằng sóng siêu âm và thay lưới lọc âm mới.',
      estimated_cost: 100000,
      estimated_time: '30 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-CLEAN-KIT',
          part_name: 'Bộ lưới lọc âm & dung dịch vệ sinh chuyên dụng',
          quantity: 1,
          unit: 'Bộ',
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
      solution: 'Thay IC/Cụm mic đàm thoại đuôi tai nghe.',
      estimated_cost: 250000,
      estimated_time: '60 phút',
      linked_parts: [
        {
          part_sku: 'LK-AP-MIC-CALL',
          part_name: 'Cụm Mic đàm thoại đuôi tai AirPods',
          quantity: 1,
          unit: 'Cụm',
          position: 'L/R',
        },
      ],
    },
  ],
  'Apple Watch': [
    {
      id: 11,
      issue_code: 'ISS-AW-001',
      category: 'Apple Watch',
      issue_name: 'Pin phù, sụt nhanh hoặc đẩy bung màn hình',
      keywords: ['pin', 'phù pin', 'bung màn', 'tụt pin', 'sập nguồn', 'pin apple watch'],
      solution: 'Thay pin chuẩn dung lượng Apple Watch và đi lại ron keo áp suất chống nước.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'LK-AW-PIN',
          part_name: 'Pin Apple Watch dung lượng chuẩn',
          quantity: 1,
          unit: 'Viên',
          position: 'Body',
        },
        {
          part_sku: 'LK-AW-SEAL',
          part_name: 'Ron keo áp suất chống nước Apple Watch',
          quantity: 1,
          unit: 'Bộ',
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
      solution: 'Ép lại mặt kính cảm ứng liền mạch trong phòng sạch và đóng ron chống nước.',
      estimated_cost: 450000,
      estimated_time: '90 - 120 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'LK-AW-GLASS-TOUCH',
          part_name: 'Mặt kính cảm ứng Apple Watch',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
        {
          part_sku: 'LK-AW-SEAL',
          part_name: 'Ron keo áp suất chống nước Apple Watch',
          quantity: 1,
          unit: 'Bộ',
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
      solution: 'Thay mâm từ sạc không dây (NFC/Wireless Coil) hoặc xử lý IC nguồn sạc.',
      estimated_cost: 300000,
      estimated_time: '90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'LK-AW-COIL-SAC',
          part_name: 'Cụm mâm từ sạc không dây Apple Watch',
          quantity: 1,
          unit: 'Cụm',
          position: 'Body',
        },
        {
          part_sku: 'LK-AW-IC-PWR',
          part_name: 'IC Quản lý nguồn sạc Apple Watch',
          quantity: 1,
          unit: 'Con',
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
      solution: 'Vệ sinh cổ trục và thay cáp phím Digital Crown / nút nguồn.',
      estimated_cost: 350000,
      estimated_time: '60 - 90 phút',
      watch_sizes: [...POPULAR_APPLE_WATCH_SIZES],
      linked_parts: [
        {
          part_sku: 'LK-AW-CROWN-FLEX',
          part_name: 'Cáp nút Digital Crown & Phím nguồn Apple Watch',
          quantity: 1,
          unit: 'Sợi',
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
      solution: 'Kích áp hoặc thay cell pin Lithium chuyên dụng cho Apple Pencil.',
      estimated_cost: 250000,
      estimated_time: '60 phút',
      linked_parts: [
        {
          part_sku: 'LK-PN-PIN',
          part_name: 'Cell Pin Lithium Apple Pencil',
          quantity: 1,
          unit: 'Viên',
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
      solution: 'Thay ngòi bút chính hãng và căn chỉnh đầu cảm biến áp lực.',
      estimated_cost: 150000,
      estimated_time: '30 phút',
      linked_parts: [
        {
          part_sku: 'LK-PN-TIP',
          part_name: 'Ngòi cảm ứng Apple Pencil chính hãng',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ],
    },
  ],
};

export const ALL_COMMON_ISSUE_CATALOG: CommonIssueCatalogItem[] = Object.values(
  COMMON_ISSUE_CATALOG_BY_CATEGORY
).flat();

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
    part.part_sku.includes('-AW-') ||
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

/**
 * Bổ sung tự động linked_parts và keywords cho cả dữ liệu từ API nếu API chưa có sẵn linked_parts
 */
export function enrichCommonIssueWithParts(
  issue: CommonIssueItem | CommonIssueCatalogItem,
  category?: string,
  watchSize?: string
): CommonIssueCatalogItem {
  const resolvedCategory = (category || issue.category || 'AirPods').trim();
  const catalogList =
    COMMON_ISSUE_CATALOG_BY_CATEGORY[resolvedCategory] || ALL_COMMON_ISSUE_CATALOG;

  const issueNameLower = (issue.issue_name || '').trim().toLowerCase();

  // 1. Tìm trong catalog theo id hoặc tên lỗi hoặc từ khóa
  const matchedCatalog =
    catalogList.find(
      (item) =>
        (issue.id !== undefined && item.id === issue.id && item.category === resolvedCategory) ||
        item.issue_name.toLowerCase() === issueNameLower ||
        issueNameLower.includes(item.issue_name.toLowerCase()) ||
        item.issue_name.toLowerCase().includes(issueNameLower)
    ) ||
    ALL_COMMON_ISSUE_CATALOG.find(
      (item) =>
        item.issue_name.toLowerCase() === issueNameLower ||
        (issueNameLower.length > 5 &&
          (issueNameLower.includes(item.issue_name.toLowerCase()) ||
            item.issue_name.toLowerCase().includes(issueNameLower)))
    );

  const rawParts: LinkedPartItem[] =
    Array.isArray((issue as CommonIssueCatalogItem).linked_parts) &&
    (issue as CommonIssueCatalogItem).linked_parts.length > 0
      ? (issue as CommonIssueCatalogItem).linked_parts
      : matchedCatalog?.linked_parts && matchedCatalog.linked_parts.length > 0
      ? matchedCatalog.linked_parts
      : inferFallbackPartsByText(issue.issue_name, resolvedCategory);

  const enrichedParts = rawParts.map((p) =>
    applyWatchSizeToLinkedPart(p, watchSize, resolvedCategory)
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
    issue_code:
      (issue as CommonIssueCatalogItem).issue_code ||
      matchedCatalog?.issue_code ||
      `ISS-${resolvedCategory.slice(0, 2).toUpperCase()}-${String(issue.id || 99).padStart(3, '0')}`,
    category: resolvedCategory,
    issue_name: issue.issue_name,
    keywords,
    solution: issue.solution || matchedCatalog?.solution,
    estimated_cost: issue.estimated_cost ?? matchedCatalog?.estimated_cost,
    estimated_time: issue.estimated_time || matchedCatalog?.estimated_time,
    watch_sizes:
      resolvedCategory === 'Apple Watch'
        ? [...POPULAR_APPLE_WATCH_SIZES]
        : matchedCatalog?.watch_sizes,
    linked_parts: enrichedParts,
  };
}

function inferFallbackPartsByText(issueName: string, category: string): LinkedPartItem[] {
  const lower = (issueName || '').toLowerCase();
  if (category === 'Apple Watch' || lower.includes('watch')) {
    if (lower.includes('kính') || lower.includes('cảm ứng') || lower.includes('màn')) {
      return [
        {
          part_sku: 'LK-AW-GLASS-TOUCH',
          part_name: 'Mặt kính cảm ứng Apple Watch',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ];
    }
    if (lower.includes('sạc') || lower.includes('nguồn')) {
      return [
        {
          part_sku: 'LK-AW-COIL-SAC',
          part_name: 'Cụm mâm từ sạc không dây Apple Watch',
          quantity: 1,
          unit: 'Cụm',
          position: 'Body',
        },
      ];
    }
    return [
      {
        part_sku: 'LK-AW-PIN',
        part_name: 'Pin Apple Watch dung lượng chuẩn',
        quantity: 1,
        unit: 'Viên',
        position: 'Body',
      },
    ];
  }

  if (category === 'Apple Pencil' || lower.includes('pencil') || lower.includes('bút')) {
    if (lower.includes('ngòi') || lower.includes('nét')) {
      return [
        {
          part_sku: 'LK-PN-TIP',
          part_name: 'Ngòi cảm ứng Apple Pencil chính hãng',
          quantity: 1,
          unit: 'Cái',
          position: 'Body',
        },
      ];
    }
    return [
      {
        part_sku: 'LK-PN-PIN',
        part_name: 'Cell Pin Lithium Apple Pencil',
        quantity: 1,
        unit: 'Viên',
        position: 'Body',
      },
    ];
  }

  // Default AirPods inference
  if (lower.includes('anc') || lower.includes('chống ồn') || lower.includes('rít')) {
    return [
      {
        part_sku: 'LK-AP-MIC-ANC',
        part_name: 'Cụm Mic cảm biến chống ồn ANC AirPods Pro',
        quantity: 1,
        unit: 'Cụm',
        position: 'L/R',
      },
    ];
  }
  if (lower.includes('loa') || lower.includes('nhỏ tiếng') || lower.includes('rè')) {
    return [
      {
        part_sku: 'LK-AP-DRIVER',
        part_name: 'Cụm màng loa Driver AirPods',
        quantity: 1,
        unit: 'Cái',
        position: 'L/R',
      },
    ];
  }
  if (lower.includes('hộp') || lower.includes('case') || lower.includes('dock')) {
    return [
      {
        part_sku: 'LK-AP-CASE-FLEX',
        part_name: 'Cụm cáp chân sạc & chấu đồng Hộp sạc (Case)',
        quantity: 1,
        unit: 'Cụm',
        position: 'Case',
      },
    ];
  }
  if (lower.includes('bẩn') || lower.includes('vệ sinh')) {
    return [
      {
        part_sku: 'LK-AP-CLEAN-KIT',
        part_name: 'Bộ lưới lọc âm & dung dịch vệ sinh chuyên dụng',
        quantity: 1,
        unit: 'Bộ',
        position: 'L/R',
      },
    ];
  }
  return [
    {
      part_sku: 'LK-AP-PIN-CAP',
      part_name: 'Pin tai nghe AirPods dung lượng chuẩn',
      quantity: 1,
      unit: 'Viên',
      position: 'L/R',
    },
  ];
}

/**
 * Định dạng danh sách linh kiện thành chuỗi tóm tắt chuẩn gửi lên API parts_needed / parts_used
 * Ví dụ: "Pin AirPods (LK-AP-PIN-CAP) x1, Keo ron (LK-AP-SEAL-KEO) x1"
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
 * Hợp nhất các linked_parts từ nhiều lỗi đang chọn (khử trùng lặp theo SKU + watch_size)
 */
export function mergeLinkedPartsFromIssues(
  issues: (CommonIssueItem | CommonIssueCatalogItem)[],
  category?: string,
  watchSize?: string
): LinkedPartItem[] {
  const map = new Map<string, LinkedPartItem>();
  for (const rawIssue of issues) {
    const enriched = enrichCommonIssueWithParts(rawIssue, category, watchSize);
    for (const part of enriched.linked_parts) {
      const key = `${part.part_sku}__${part.watch_size || ''}`;
      if (!map.has(key)) {
        map.set(key, { ...part });
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Lọc danh sách lỗi thường gặp theo từ khóa (tên lỗi, mã lỗi, keywords, tên linh kiện, SKU)
 */
export function filterCommonIssues(
  issues: (CommonIssueItem | CommonIssueCatalogItem)[],
  query: string,
  category?: string,
  watchSize?: string
): CommonIssueCatalogItem[] {
  const enrichedList = issues.map((item) =>
    enrichCommonIssueWithParts(item, category, watchSize)
  );
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
  explicitWatchSize?: string | null
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

  for (const item of candidateCatalog) {
    const itemLower = item.issue_name.toLowerCase();
    const keywordHit = item.keywords.some(
      (kw) => kw.length >= 3 && lowerText.includes(kw.toLowerCase())
    );
    if (lowerText.includes(itemLower) || keywordHit) {
      matchedIssues.push(
        enrichCommonIssueWithParts(item, resolvedCategory, detectedWatchSize)
      );
    }
  }

  // Nếu không khớp catalog cụ thể nào nhưng có nội dung lỗi, suy diễn 1 linh kiện mặc định theo ngữ cảnh
  if (matchedIssues.length === 0 && text.length > 2) {
    const fallbackIssue = enrichCommonIssueWithParts(
      { issue_name: text, category: resolvedCategory },
      resolvedCategory,
      detectedWatchSize
    );
    matchedIssues.push(fallbackIssue);
  }

  const linkedParts = mergeLinkedPartsFromIssues(
    matchedIssues,
    resolvedCategory,
    detectedWatchSize
  );

  return {
    matchedIssues,
    linkedParts,
    detectedWatchSize,
  };
}

/**
 * Phân tách chuỗi parts_needed / partsUsed ("Pin AirPods (LK-AP-PIN-CAP) x2, ...") thành mảng LinkedPartItem
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
        part_sku: catalogHit?.part_sku || `LK-CUSTOM-${String(idx + 1).padStart(2, '0')}`,
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
      part_sku: catalogHit?.part_sku || `LK-GEN-${String(idx + 1).padStart(2, '0')}`,
      part_name: seg,
      quantity: 1,
      unit: catalogHit?.unit || 'Cái',
      watch_size: extractWatchSizeFromText(seg),
    });
  });

  return items;
}
