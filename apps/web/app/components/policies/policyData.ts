export type PolicySlug = 'terms' | 'privacy' | 'billing-policy' | 'sla';

export const POLICY_SLUGS: readonly PolicySlug[] = [
  'terms',
  'privacy',
  'billing-policy',
  'sla',
] as const;

export interface BetechLegalEntity {
  companyName: string;
  internationalName: string;
  brandName: string;
  productName: string;
  productUrl: string;
  taxId: string;
  headquartersAddress: string;
  branchAddress: string;
  hotline: string;
  hotlineTel: string;
  zaloUrl: string;
  email: string;
  websiteUrl: string;
  supportHours: string;
}

export const BETECH_LEGAL_ENTITY: BetechLegalEntity = {
  companyName: 'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH',
  internationalName: 'BETECH DIGITAL SOLUTION SERVICES COMPANY LIMITED',
  brandName: 'Betech Digital',
  productName: 'FIXO Repair OS',
  productUrl: 'https://fixo.com.vn',
  taxId: '0318601210',
  headquartersAddress:
    '92A-94 Bạch Đằng, Phường 2 (Tân Sơn Hòa), Quận Tân Bình, TP. Hồ Chí Minh',
  branchAddress:
    '73 Rạch Bùng Binh, Phường Nhiêu Lộc, Quận 3, TP. Hồ Chí Minh',
  hotline: '0775 600 351',
  hotlineTel: '0775600351',
  zaloUrl: 'https://zalo.me/0775600351',
  email: 'admin@betech-digital.com',
  websiteUrl: 'https://betech-digital.com/',
  supportHours: '08:00 – 21:00 (Thứ 2 – Chủ nhật)',
};

export type SaasPlanId = 'trial' | 'standard' | 'pro';

export interface SaasPlanQuota {
  id: SaasPlanId;
  name: string;
  shortName: string;
  priceMonthly: number;
  priceYearly: number;
  priceMonthlyDisplay: string;
  priceYearlyDisplay: string;
  billingSummary: string;
  maxBranches: number | null;
  maxUsers: number | null;
  maxOrdersPerMonth: number | null;
  quotaSummary: string;
  requiresCreditCard: boolean;
  trialDurationLabel: string;
  description: string;
}

export const SAAS_PLAN_QUOTAS: Record<SaasPlanId, SaasPlanQuota> = {
  trial: {
    id: 'trial',
    name: 'Gói Dùng thử',
    shortName: 'Dùng thử',
    priceMonthly: 0,
    priceYearly: 0,
    priceMonthlyDisplay: '0đ',
    priceYearlyDisplay: '0đ / 1 năm',
    billingSummary: '0đ trong 1 năm (không yêu cầu thẻ tín dụng)',
    maxBranches: 1,
    maxUsers: 2,
    maxOrdersPerMonth: 50,
    quotaSummary: '1 chi nhánh, 2 nhân sự, 50 đơn/tháng',
    requiresCreditCard: false,
    trialDurationLabel: '1 năm',
    description:
      'Trải nghiệm miễn phí 1 năm toàn bộ phân hệ cốt lõi, kích hoạt tự động ngay sau khi đăng ký, không yêu cầu thẻ tín dụng.',
  },
  standard: {
    id: 'standard',
    name: 'Gói Tiêu chuẩn',
    shortName: 'Tiêu chuẩn',
    priceMonthly: 299000,
    priceYearly: 3289000,
    priceMonthlyDisplay: '299.000đ/tháng',
    priceYearlyDisplay: '3.289.000đ/năm',
    billingSummary: '299.000đ/tháng hoặc 3.289.000đ/năm',
    maxBranches: 2,
    maxUsers: 5,
    maxOrdersPerMonth: 300,
    quotaSummary: '2 chi nhánh, 5 nhân sự, 300 đơn/tháng',
    requiresCreditCard: false,
    trialDurationLabel: '1 năm',
    description:
      'Chuẩn hóa vận hành cho cửa hàng sửa chữa độc lập và quy mô vừa với hạn mức tối đa 2 chi nhánh, 5 nhân sự, 300 đơn/tháng.',
  },
  pro: {
    id: 'pro',
    name: 'Gói Chuyên nghiệp',
    shortName: 'Chuyên nghiệp',
    priceMonthly: 599000,
    priceYearly: 6589000,
    priceMonthlyDisplay: '599.000đ/tháng',
    priceYearlyDisplay: '6.589.000đ/năm',
    billingSummary: '599.000đ/tháng hoặc 6.589.000đ/năm',
    maxBranches: null,
    maxUsers: null,
    maxOrdersPerMonth: null,
    quotaSummary: 'Không giới hạn chi nhánh, nhân sự và đơn sửa chữa',
    requiresCreditCard: false,
    trialDurationLabel: '1 năm',
    description:
      'Giải pháp mở rộng không giới hạn chi nhánh, nhân sự và đơn sửa chữa dành cho chuỗi cửa hàng và trung tâm bảo hành quy mô lớn.',
  },
};

export const SAAS_PLAN_QUOTA_LIST: readonly SaasPlanQuota[] = [
  SAAS_PLAN_QUOTAS.trial,
  SAAS_PLAN_QUOTAS.standard,
  SAAS_PLAN_QUOTAS.pro,
] as const;

export interface PolicySection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  highlightNote?: string;
}

export interface PolicyDocument {
  slug: PolicySlug;
  path: string;
  shortTitle: string;
  title: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  effectiveDate: string;
  lastUpdated: string;
  summaryPoints: string[];
  sections: PolicySection[];
}

export interface PolicyNavItem {
  slug: PolicySlug;
  path: string;
  shortTitle: string;
  title: string;
  description: string;
}

export const POLICY_DOCUMENTS: Record<PolicySlug, PolicyDocument> = {
  terms: {
    slug: 'terms',
    path: '/terms',
    shortTitle: 'Điều khoản sử dụng',
    title: 'Điều khoản Sử dụng Dịch vụ',
    subtitle:
      'Quy định khung pháp lý B2B SaaS, quyền và nghĩa vụ của gian hàng thuê bao cùng phân định trách nhiệm giữa nền tảng phần mềm FIXO Repair OS và cửa hàng sửa chữa.',
    seoTitle: 'Điều khoản Sử dụng Dịch vụ — FIXO Repair OS | Betech Digital',
    seoDescription:
      'Điều khoản sử dụng nền tảng phần mềm quản lý sửa chữa B2B SaaS FIXO Repair OS do CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (Betech Digital) phát triển và vận hành.',
    effectiveDate: '29/10/2026',
    lastUpdated: '29/10/2026',
    summaryPoints: [
      'FIXO Repair OS là nền tảng phần mềm quản trị vận hành B2B SaaS đám mây do CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (Betech Digital, MST 0318601210) phát triển và vận hành.',
      'Mỗi cửa hàng thuê bao quản lý gian hàng độc lập theo mã định danh riêng và chịu trách nhiệm bảo mật tài khoản quản trị cùng phân quyền nhân sự nội bộ.',
      'Ranh giới pháp lý minh bạch: Betech Digital cung cấp công cụ phần mềm quản trị, còn từng Cửa hàng chịu trách nhiệm pháp lý trực tiếp về nguồn gốc linh kiện, chất lượng kỹ thuật sửa chữa, bảo hành thiết bị thực tế và nghĩa vụ thuế với khách lẻ.',
    ],
    sections: [
      {
        id: 'ban-chat-dich-vu-b2b-saas',
        number: 'Điều 1',
        title: 'Bản chất Dịch vụ Phần mềm Đám mây B2B SaaS',
        paragraphs: [
          'FIXO Repair OS (truy cập tại https://fixo.com.vn) là hệ điều hành quản trị quy trình sửa chữa, kho linh kiện, bảo hành điện tử và sổ quỹ đa chi nhánh hoạt động theo mô hình phần mềm dạng dịch vụ trên nền tảng điện toán đám mây (B2B Multi-Tenant SaaS). Hệ thống thuộc quyền sở hữu, phát triển và vận hành bởi CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (tên quốc tế: BETECH DIGITAL SOLUTION SERVICES COMPANY LIMITED, thương hiệu: Betech Digital, Mã số thuế: 0318601210).',
          'Bằng việc đăng ký khởi tạo gian hàng hoặc đăng nhập sử dụng hệ thống, Tổ chức hoặc Cá nhân kinh doanh dịch vụ sửa chữa (sau đây gọi là "Cửa hàng" hoặc "Gian hàng thuê bao") xác nhận đã đọc, hiểu rõ và đồng ý tuân thủ toàn bộ các điều khoản quy định trong văn bản này.',
        ],
        highlightNote:
          'Quan hệ hợp đồng trên FIXO Repair OS là quan hệ cung ứng dịch vụ phần mềm quản trị doanh nghiệp (B2B SaaS) giữa Betech Digital và Chủ cửa hàng thuê bao.',
      },
      {
        id: 'tai-khoan-gian-hang-va-bao-mat',
        number: 'Điều 2',
        title: 'Tài khoản Gian hàng, Phân quyền Nhân sự và Bảo mật Đăng nhập',
        paragraphs: [
          'Khi đăng ký hợp lệ trên cổng /register, mỗi Cửa hàng được cấp một không gian dữ liệu gian hàng riêng biệt gắn với mã gian hàng (store_code) và định danh hệ thống (tenant_id) độc lập, cùng một tài khoản Quản trị viên cao nhất (Admin / Chủ cửa hàng).',
          'Chủ cửa hàng có toàn quyền khởi tạo, phân công chi nhánh và cấp quyền truy cập cho đội ngũ nhân sự theo đúng chức danh nghiệp vụ trên hệ thống trong phạm vi hạn mức của gói cước đang sử dụng.',
        ],
        bullets: [
          'Chủ cửa hàng chịu trách nhiệm khai báo thông tin liên hệ chính xác (Họ tên người đại diện, Số điện thoại 10 số hợp lệ tại Việt Nam và Email quản trị chính thức) để phục vụ xác thực bảo mật, nhận thông báo vận hành và đối soát bản quyền.',
          'Chủ cửa hàng có nghĩa vụ quản lý chặt chẽ danh sách tài khoản nhân viên (CSKH, Kỹ thuật viên, QC, Thủ kho), chủ động thu hồi hoặc vô hiệu hóa ngay tài khoản của nhân sự đã nghỉ việc hoặc chuyển bộ phận.',
          'Mọi thao tác nghiệp vụ phát sinh từ tài khoản hợp lệ thuộc gian hàng (tiếp nhận máy, báo giá, xuất linh kiện, đóng ca sổ quỹ) được ghi nhận vào Nhật ký kiểm toán (Audit Log) và được xem là ý chí vận hành hợp pháp của Cửa hàng đó.',
        ],
      },
      {
        id: 'quy-tac-su-dung-hop-phap',
        number: 'Điều 3',
        title: 'Quy tắc Sử dụng Hợp pháp và Các Hành vi Bị Nghiêm cấm',
        paragraphs: [
          'Cửa hàng cam kết chỉ sử dụng FIXO Repair OS phục vụ hoạt động quản trị tiếp nhận, sửa chữa, bảo hành thiết bị công nghệ và quản lý thương mại hợp pháp theo quy định của pháp luật Việt Nam.',
        ],
        bullets: [
          'Nghiêm cấm sử dụng nền tảng để lưu trữ, tiêu thụ hoặc hợp thức hóa chứng từ cho thiết bị, linh kiện vi phạm pháp luật, hàng hóa không rõ nguồn gốc hoặc tài sản do phạm pháp mà có.',
          'Nghiêm cấm mọi hành vi can thiệp trái phép vào hạ tầng máy chủ, dịch ngược mã nguồn, dò quét lỗ hổng bảo mật, gửi yêu cầu tự động tần suất cao gây quá tải hệ thống hoặc tìm cách truy cập trái phép vào dữ liệu của gian hàng khác.',
          'Nghiêm cấm giả mạo thông tin thương hiệu của tổ chức khác hoặc phát tán nội dung lừa đảo thông qua phiếu in, đường dẫn tra cứu đơn hàng công khai của hệ thống.',
        ],
      },
      {
        id: 'phan-dinh-ranh-gioi-trach-nhiem-phap-ly',
        number: 'Điều 4',
        title: 'Phân định Ranh giới Trách nhiệm Pháp lý giữa Nền tảng SaaS và Cửa hàng',
        paragraphs: [
          'Để bảo đảm tính minh bạch tuyệt đối cho cả Chủ cửa hàng lẫn khách hàng cuối (khách lẻ mang thiết bị đi sửa), Betech Digital phân định rõ ràng ranh giới trách nhiệm giữa Đơn vị cung cấp phần mềm và Cửa hàng trực tiếp kinh doanh dịch vụ sửa chữa:',
          'Betech Digital (thông qua sản phẩm FIXO Repair OS) chỉ đóng vai trò là đơn vị cung cấp hạ tầng công nghệ và phần mềm quản trị quy trình vận hành. Betech Digital không trực tiếp tiếp nhận thiết bị, không tham gia định giá sửa chữa, không cung ứng linh kiện thay thế và không phải là một bên trong giao dịch dịch vụ sửa chữa giữa Cửa hàng với khách hàng lẻ.',
        ],
        bullets: [
          'Nguồn gốc và chất lượng linh kiện: Từng Cửa hàng thuê bao chịu trách nhiệm pháp lý độc lập và trực tiếp về nguồn gốc xuất xứ, tính chính hãng hoặc tiêu chuẩn tương thích của toàn bộ linh kiện sử dụng để thay thế cho khách hàng.',
          'Chất lượng kỹ thuật sửa chữa và bảo quản tài sản: Cửa hàng chịu trách nhiệm hoàn toàn về tay nghề kỹ thuật, an toàn dữ liệu trên thiết bị của khách và nghĩa vụ bảo quản tài sản thiết bị trong suốt thời gian lưu giữ tại cửa hàng.',
          'Nghĩa vụ bảo hành thiết bị thực tế: Mọi cam kết bảo hành sau sửa chữa, đổi trả linh kiện, giải quyết khiếu nại hoặc bồi thường thiệt hại thiết bị thuộc trách nhiệm trực tiếp của Cửa hàng tiếp nhận máy ghi trên phiếu sửa chữa.',
          'Nghĩa vụ kê khai và nộp thuế của Cửa hàng: Cửa hàng tự chịu trách nhiệm độc lập trong việc xuất hóa đơn bán hàng/dịch vụ, kê khai doanh thu và thực hiện đầy đủ nghĩa vụ thuế với cơ quan thuế nhà nước đối với hoạt động kinh doanh đối với khách lẻ của cửa hàng mình.',
        ],
        highlightNote:
          'Khách hàng lẻ tra cứu tiến độ đơn hàng trên cổng /track thực hiện giao dịch dịch vụ và yêu cầu bảo hành trực tiếp tại Cửa hàng tiếp nhận thiết bị được hiển thị trên phiếu tiếp nhận.',
      },
      {
        id: 'quyen-so-huu-tri-tue',
        number: 'Điều 5',
        title: 'Quyền Sở hữu Trí tuệ đối với Nền tảng và Dữ liệu Thương hiệu',
        paragraphs: [
          'Toàn bộ quyền tác giả, mã nguồn phần mềm, thiết kế kiến trúc cơ sở dữ liệu, hệ thống giao diện Calm Jade & Warm Ivory, tài liệu hướng dẫn vận hành và nhãn hiệu FIXO Repair OS / Betech Digital thuộc quyền sở hữu trí tuệ hợp pháp của CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH.',
          'Trong thời gian gói cước còn hiệu lực, Cửa hàng được cấp quyền sử dụng phần mềm không độc quyền, không chuyển nhượng theo đúng hạn mức gói cước. Ngược lại, tên thương mại, biểu trưng (logo) riêng của Cửa hàng và toàn bộ dữ liệu kinh doanh do Cửa hàng tạo lập vẫn thuộc quyền sở hữu trọn vẹn của Cửa hàng theo Chính sách Bảo mật (/privacy).',
        ],
      },
      {
        id: 'tam-ngung-cham-dut-va-luat-dieu-chinh',
        number: 'Điều 6',
        title: 'Tạm ngưng, Chấm dứt Dịch vụ và Luật Điều chỉnh',
        paragraphs: [
          'Quyền truy cập tạo đơn mới của gian hàng có thể được chuyển sang chế độ giới hạn hoặc tạm ngưng khi gói cước hết hạn mà chưa gia hạn (tuân thủ đầy đủ lộ trình bảo toàn dữ liệu 30 ngày chỉ xem và 90 ngày lưu trữ tại Chính sách Thanh toán /billing-policy), hoặc khi phát hiện hành vi vi phạm nghiêm trọng Điều 3 gây nguy hại đến an ninh hạ tầng chung.',
          'Chủ cửa hàng có quyền ngừng sử dụng dịch vụ bất kỳ lúc nào, trích xuất dữ liệu kinh doanh và gửi yêu cầu đóng gian hàng theo quy trình xác thực chính chủ.',
          'Điều khoản Sử dụng này được điều chỉnh và giải thích theo pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam. Mọi tranh chấp phát sinh ưu tiên giải quyết bằng thương lượng thiện chí; trường hợp không đạt được thỏa thuận sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh.',
        ],
      },
    ],
  },

  privacy: {
    slug: 'privacy',
    path: '/privacy',
    shortTitle: 'Chính sách bảo mật',
    title: 'Chính sách Bảo mật & Quyền Sở hữu Dữ liệu',
    subtitle:
      'Cam kết 100% quyền sở hữu dữ liệu độc quyền của cửa hàng, kiến trúc cô lập đa thuê bao, minh bạch cơ chế che dấu PII trên cổng tra cứu và tuân thủ Nghị định 13/2023/NĐ-CP.',
    seoTitle:
      'Chính sách Bảo mật & Quyền Sở hữu Dữ liệu — FIXO Repair OS | Betech Digital',
    seoDescription:
      'Cam kết bảo mật dữ liệu cửa hàng sửa chữa trên FIXO Repair OS: 100% dữ liệu thuộc sở hữu cửa hàng, cô lập Multi-Tenant, che dấu PII trên cổng tra cứu và tuân thủ Nghị định 13/2023/NĐ-CP.',
    effectiveDate: '29/10/2026',
    lastUpdated: '29/10/2026',
    summaryPoints: [
      '100% dữ liệu khách hàng, số điện thoại, đơn sửa chữa, tồn kho linh kiện, sổ quỹ và doanh thu thuộc quyền sở hữu độc quyền của từng Cửa hàng.',
      'Cô lập dữ liệu nghiêm ngặt theo kiến trúc đa thuê bao (tenant_id) kết hợp phân quyền nội bộ RBAC (ẩn tuyệt đối doanh thu và giá tiền đối với vai trò Kỹ thuật viên).',
      'Tuyệt đối không khai thác thương mại chéo, không bán hoặc chia sẻ dữ liệu cửa hàng cho bên thứ ba; tự động che dấu thông tin cá nhân qua PiiHelper trên cổng /track và tuân thủ Nghị định 13/2023/NĐ-CP.',
    ],
    sections: [
      {
        id: 'quyen-so-huu-du-lieu-doc-quyen-cua-cua-hang',
        number: 'Điều 1',
        title: 'Cam kết 100% Quyền Sở hữu Dữ liệu Độc quyền của Cửa hàng',
        paragraphs: [
          'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (Betech Digital) xác lập nguyên tắc cốt lõi: 100% dữ liệu nghiệp vụ do Cửa hàng khởi tạo, nhập liệu và tích lũy trong quá trình vận hành trên FIXO Repair OS thuộc quyền sở hữu độc quyền và hợp pháp của chính Cửa hàng đó.',
          'Tài sản dữ liệu thuộc quyền sở hữu độc quyền của Cửa hàng bao gồm toàn bộ danh sách khách hàng, số điện thoại liên hệ, địa chỉ giao nhận, hồ sơ đơn sửa chữa, hình ảnh hiện trạng thiết bị, danh mục và số lượng tồn kho linh kiện, lịch sử bảo hành, biên lai thu chi sổ quỹ và báo cáo doanh thu tài chính.',
        ],
        highlightNote:
          'Betech Digital chỉ đóng vai trò là đơn vị vận hành hạ tầng lưu trữ và xử lý kỹ thuật theo ủy quyền phần mềm của Cửa hàng, không chiếm giữ quyền sở hữu thương mại đối với tệp khách hàng hay dữ liệu doanh thu của tiệm.',
      },
      {
        id: 'co-lap-da-thue-bao-va-phan-quyen-rbac',
        number: 'Điều 2',
        title: 'Kiến trúc Cô lập Dữ liệu Đa thuê bao (Multi-Tenant) và Phân quyền RBAC',
        paragraphs: [
          'Hệ thống FIXO Repair OS được thiết kế từ tầng cơ sở dữ liệu đến tầng giao diện theo kiến trúc cô lập đa thuê bao nghiêm ngặt. Mọi bản ghi nghiệp vụ đều gắn định danh khóa gian hàng (tenant_id) và chi nhánh (branch_id), bắt buộc đi qua lớp kiểm soát phạm vi truy vấn tự động ở phía máy chủ.',
        ],
        bullets: [
          'Cô lập tuyệt đối giữa các Cửa hàng: Không một gian hàng nào có thể tìm kiếm, xem hoặc tác động vào đơn sửa chữa, khách hàng hay kho linh kiện của gian hàng khác trên cùng nền tảng.',
          'Phân quyền nội bộ theo vai trò (Role-Based Access Control — RBAC): Chủ cửa hàng kiểm soát chặt chẽ phạm vi dữ liệu giữa các vị trí Admin, Lễ tân/CSKH, Kỹ thuật viên (tech), Kiểm định chất lượng (QC) và Thủ kho (inventory).',
          'Bảo mật tài chính nội bộ cửa hàng: Hệ thống mặc định ẩn toàn bộ trường giá vốn linh kiện, đơn giá thu khách và tổng doanh thu đối với tài khoản vai trò Kỹ thuật viên nhằm bảo vệ bí mật kinh doanh ngay trong nội bộ tiệm.',
        ],
      },
      {
        id: 'cam-ket-khong-khai-thac-thuong-mai-cheo',
        number: 'Điều 3',
        title: 'Cam kết Không Khai thác Thương mại Chéo và Không Bán Dữ liệu',
        paragraphs: [
          'Betech Digital cam kết tuyệt đối không sử dụng dữ liệu của Cửa hàng cho bất kỳ mục đích khai thác thương mại chéo nào ngoài phạm vi duy trì hoạt động ổn định của chính gian hàng đó.',
        ],
        bullets: [
          'Tuyệt đối không bán, không cho thuê, không trao đổi và không chia sẻ danh sách số điện thoại khách hàng hoặc số liệu kinh doanh của Cửa hàng cho bất kỳ bên thứ ba, đối tác quảng cáo hay đơn vị cạnh tranh nào.',
          'Đội ngũ kỹ thuật vận hành hạ tầng của Betech Digital không tự ý truy cập vào dữ liệu chi tiết của gian hàng, trừ trường hợp thực hiện hỗ trợ xử lý sự cố kỹ thuật theo yêu cầu xác thực trực tiếp từ Chủ cửa hàng.',
          'Việc cung cấp thông tin cho cơ quan quản lý nhà nước chỉ được thực hiện khi có yêu cầu bằng văn bản pháp lý hợp lệ theo đúng trình tự pháp luật Việt Nam.',
        ],
      },
      {
        id: 'pham-vi-thu-thap-va-muc-dich-xu-ly',
        number: 'Điều 4',
        title: 'Phạm vi Dữ liệu Thu thập và Mục đích Xử lý',
        paragraphs: [
          'Hệ thống chỉ ghi nhận các nhóm dữ liệu tối thiểu, cần thiết trực tiếp cho hoạt động quản trị gian hàng và thực hiện hợp đồng dịch vụ phần mềm:',
        ],
        bullets: [
          'Dữ liệu tài khoản thuê bao (B2B): Tên cửa hàng, mã gian hàng, họ tên chủ tiệm, số điện thoại, email quản trị, thông tin xuất hóa đơn doanh nghiệp (nếu có) và lịch sử thanh toán gói cước nhằm định danh tài khoản, gửi thông báo vận hành và đối soát bản quyền.',
          'Dữ liệu nghiệp vụ sửa chữa do Cửa hàng nhập liệu: Thông tin khách gửi máy, mã thiết bị/IMEI/Serial, mô tả lỗi, ghi chú kiểm tra, linh kiện xuất kho và thời hạn bảo hành nhằm phục vụ in phiếu tiếp nhận, điều phối sửa chữa và chăm sóc hậu mãi của Cửa hàng.',
          'Dữ liệu kỹ thuật an toàn hệ thống: Địa chỉ IP truy cập, thông tin trình duyệt và dấu thời gian thao tác nhằm phòng chống truy cập trái phép, chống đăng ký tự động (anti-spam) và duy trì Nhật ký kiểm toán (Audit Log).',
        ],
      },
      {
        id: 'co-che-che-dau-pii-tren-cong-tra-cuu',
        number: 'Điều 5',
        title: 'Minh bạch Cơ chế Che dấu Thông tin Định danh Cá nhân (PII Masking) trên Cổng /track',
        paragraphs: [
          'Nhằm giúp khách hàng lẻ của Cửa hàng thuận tiện kiểm tra tiến độ sửa chữa và hạn bảo hành trực tuyến trên cổng công khai (/track) mà không làm lộ lọt dữ liệu cá nhân trên môi trường Internet, FIXO Repair OS áp dụng cơ chế che dấu dữ liệu định danh tự động ngay tại tầng API máy chủ thông qua bộ lọc bảo mật PiiHelper.',
        ],
        bullets: [
          'Tự động che mờ thông tin nhạy cảm: Họ tên khách hàng, số điện thoại liên hệ và địa chỉ giao nhận đều được ẩn bớt các ký tự định danh trước khi phản hồi về trình duyệt công khai (chỉ giữ lại các ký tự đầu/cuối tối thiểu để chính chủ nhận biết đơn hàng của mình).',
          'Không phơi bày dữ liệu tài chính nhạy cảm nội bộ: Giao diện tra cứu công khai chỉ hiển thị trạng thái tiến độ kỹ thuật, hạng mục dịch vụ khách duyệt và thông tin bảo hành, bảo vệ tuyệt đối dữ liệu quản trị nội bộ của Cửa hàng.',
          'Kiểm soát tốc độ truy vấn: Cổng tra cứu áp dụng giới hạn tần suất truy vấn (rate limiting) nhằm ngăn chặn triệt để hành vi dò quét mã đơn hàng tự động.',
        ],
      },
      {
        id: 'bao-mat-ha-tang-va-nhat-ky-kiem-toan',
        number: 'Điều 6',
        title: 'Biện pháp Bảo mật Hạ tầng, Mã hóa Truyền tải và Lưu vết Kiểm toán',
        paragraphs: [
          'Betech Digital triển khai đồng bộ các biện pháp bảo mật kỹ thuật ở cả tầng mạng, tầng ứng dụng và tầng lưu trữ cơ sở dữ liệu:',
        ],
        bullets: [
          'Mã hóa truyền tải toàn trình: 100% kết nối giữa máy trạm trình duyệt của Cửa hàng và máy chủ API sử dụng giao thức mã hóa HTTPS / SSL/TLS tiêu chuẩn.',
          'Bảo vệ thông tin xác thực: Mật khẩu người dùng được mã hóa băm một chiều (cryptographic hashing) không thể giải ngược; phiên làm việc được kiểm soát qua mã xác thực phiên có thời hạn và cơ chế thu hồi tức thì khi đăng xuất.',
          'Nhật ký kiểm toán (Audit Log): Mọi thay đổi quan trọng đối với trạng thái đơn hàng, phê duyệt báo giá, xuất nhập kho và giao dịch thu chi sổ quỹ đều được ghi vết thời gian thực để Chủ cửa hàng đối chiếu minh bạch.',
        ],
      },
      {
        id: 'quyen-chu-the-du-lieu-nghi-dinh-13',
        number: 'Điều 7',
        title: 'Quyền của Chủ thể Dữ liệu theo Nghị định 13/2023/NĐ-CP và Đầu mối Liên hệ',
        paragraphs: [
          'Chính sách bảo mật này được xây dựng tuân thủ đầy đủ các nguyên tắc bảo vệ dữ liệu cá nhân theo Nghị định số 13/2023/NĐ-CP của Chính phủ nước Cộng hòa Xã hội Chủ nghĩa Việt Nam.',
          'Chủ cửa hàng và chủ thể dữ liệu có đầy đủ các quyền hợp pháp đối với dữ liệu của mình, bao gồm: quyền được biết về hoạt động xử lý dữ liệu; quyền đồng ý hoặc rút lại sự đồng ý; quyền truy cập, xem và chỉnh sửa dữ liệu; quyền trích xuất dữ liệu; quyền yêu cầu hạn chế xử lý hoặc yêu cầu xóa dữ liệu theo quy định.',
        ],
        bullets: [
          'Đơn vị kiểm soát và xử lý hạ tầng phần mềm: CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (Mã số thuế: 0318601210).',
          'Email tiếp nhận yêu cầu về quyền riêng tư & bảo vệ dữ liệu: admin@betech-digital.com.',
          'Hotline / Zalo hỗ trợ trực tiếp: 0775 600 351 (Khung giờ 08:00 – 21:00, Thứ 2 – Chủ nhật).',
          'Địa chỉ liên hệ trực tiếp: Trụ sở chính tại 92A-94 Bạch Đằng, Phường 2 (Tân Sơn Hòa), Quận Tân Bình, TP. Hồ Chí Minh; Chi nhánh tại 73 Rạch Bùng Binh, Phường Nhiêu Lộc, Quận 3, TP. Hồ Chí Minh.',
        ],
      },
    ],
  },

  'billing-policy': {
    slug: 'billing-policy',
    path: '/billing-policy',
    shortTitle: 'Chính sách thanh toán',
    title: 'Chính sách Thanh toán, Gia hạn & Lưu trữ Dữ liệu',
    subtitle:
      'Biểu phí và hạn mức chuẩn hóa của 3 gói cước SaaS, đối soát chuyển khoản tự động qua SePay VietQR, quy định hoàn tiền, hóa đơn điện tử và lộ trình lưu trữ dữ liệu sau khi hết hạn.',
    seoTitle:
      'Chính sách Thanh toán, Gia hạn & Lưu trữ Dữ liệu — FIXO Repair OS | Betech Digital',
    seoDescription:
      'Biểu phí minh bạch 3 gói cước FIXO Repair OS (Dùng thử 0đ/1 năm, Tiêu chuẩn 299.000đ/tháng, Chuyên nghiệp 599.000đ/tháng), thanh toán tự động SePay VietQR và lộ trình bảo toàn dữ liệu 30/90 ngày.',
    effectiveDate: '29/10/2026',
    lastUpdated: '29/10/2026',
    summaryPoints: [
      '3 gói cước minh bạch: Gói Dùng thử 0đ trong 1 năm (1 chi nhánh, 2 nhân sự, 50 đơn/tháng); Gói Tiêu chuẩn 299.000đ/tháng hoặc 3.289.000đ/năm (2 chi nhánh, 5 nhân sự, 300 đơn/tháng); Gói Chuyên nghiệp 599.000đ/tháng hoặc 6.589.000đ/năm (không giới hạn).',
      'Thanh toán chuyển khoản đối soát tự động 24/7 qua SePay VietQR; hỗ trợ xuất hóa đơn điện tử khi cung cấp Mã số thuế hợp lệ; chính sách không hoàn tiền cho kỳ cước đã kích hoạt (trừ lỗi chuyển khoản trùng lặp hoặc sự cố hạ tầng nghiêm trọng không thể khắc phục).',
      'Bảo toàn dữ liệu sau khi hết hạn chưa gia hạn: duy trì chế độ Chỉ xem / Cho xuất dữ liệu trong 30 ngày, lưu trữ an toàn tối đa 90 ngày trước khi xóa vĩnh viễn và xử lý yêu cầu xóa dữ liệu chủ động trong 5–7 ngày làm việc.',
    ],
    sections: [
      {
        id: 'bieu-phi-va-han-muc-ba-goi-cuoc',
        number: 'Điều 1',
        title: 'Biểu phí và Hạn mức Thống nhất của 3 Gói cước SaaS',
        paragraphs: [
          'FIXO Repair OS công bố minh bạch và đồng nhất biểu phí cùng hạn mức tài nguyên của ba (03) gói cước trên toàn bộ trang chủ, cổng đăng ký và hệ thống quản lý bản quyền. Hệ thống không thu phí khởi tạo ban đầu và không ràng buộc hợp đồng dài hạn bắt buộc:',
        ],
        bullets: [
          '1. Gói Dùng thử (trial): Mức phí 0đ trong thời hạn 1 năm — hạn mức 1 chi nhánh, 2 nhân sự, 50 đơn/tháng. Không yêu cầu thẻ tín dụng khi đăng ký và không tự động trừ tiền khi kết thúc thời gian trải nghiệm.',
          '2. Gói Tiêu chuẩn (standard): Mức phí 299.000đ/tháng hoặc 3.289.000đ/năm — hạn mức chuẩn hóa thống nhất tối đa 2 chi nhánh, 5 nhân sự, 300 đơn/tháng. Bao gồm đầy đủ quy trình tiếp nhận, kỹ thuật, kiểm định QC, quản lý kho linh kiện, bảo hành điện tử, sổ quỹ và VietQR.',
          '3. Gói Chuyên nghiệp (pro): Mức phí 599.000đ/tháng hoặc 6.589.000đ/năm — không giới hạn chi nhánh, nhân sự và đơn sửa chữa. Tích hợp điều chuyển kho linh kiện liên chi nhánh, phân tích hiệu suất đa chi nhánh thời gian thực và ưu tiên hỗ trợ kỹ thuật cao nhất.',
        ],
        highlightNote:
          'Mọi gói cước đều bao gồm miễn phí các bản cập nhật tính năng phần mềm định kỳ và cơ chế sao lưu cơ sở dữ liệu tự động hàng ngày.',
      },
      {
        id: 'thanh-toan-tu-dong-sepay-vietqr',
        number: 'Điều 2',
        title: 'Phương thức Thanh toán Chuyển khoản Đối soát Tự động qua SePay VietQR',
        paragraphs: [
          'Để bảo đảm tốc độ kích hoạt tức thì và loại bỏ sai sót nhập liệu thủ công, FIXO Repair OS sử dụng phương thức thanh toán chuyển khoản ngân hàng qua mã QR động tích hợp cổng đối soát tự động SePay VietQR.',
          'Khi Chủ cửa hàng chọn nâng cấp hoặc gia hạn gói cước tại phân hệ Quản lý Gói cước & Bản quyền (/subscription), hệ thống tự động khởi tạo hóa đơn điện tử nội bộ kèm mã VietQR định danh chứa chính xác số tiền và mã tham chiếu giao dịch duy nhất.',
        ],
        bullets: [
          'Kích hoạt tự động theo thời gian thực 24/7: Ngay khi ngân hàng ghi nhận giao dịch chuyển khoản khớp số tiền và nội dung tham chiếu, hệ thống xử lý webhook bảo mật (có cơ chế chống trùng lặp giao dịch idempotency) và nâng hạn mức gói cước ngay lập tức trong vài giây.',
          'Trường hợp chuyển khoản sai nội dung tham chiếu hoặc chênh lệch số tiền: Chủ cửa hàng liên hệ Hotline / Zalo 0775 600 351 hoặc Email admin@betech-digital.com kèm mã giao dịch ngân hàng để bộ phận kế toán đối soát và kích hoạt bổ sung.',
        ],
      },
      {
        id: 'nguyen-tac-gia-han-va-chinh-sach-hoan-tien',
        number: 'Điều 3',
        title: 'Nguyên tắc Nâng cấp, Gia hạn và Chính sách Không hoàn tiền',
        paragraphs: [
          'Chủ cửa hàng có thể chủ động nâng cấp từ Gói Dùng thử lên Gói Tiêu chuẩn hoặc Gói Chuyên nghiệp, hoặc gia hạn thêm chu kỳ tháng (+30 ngày) / chu kỳ năm (+365 ngày) bất kỳ lúc nào ngay trên bảng điều khiển quản trị.',
          'Do nền tảng đã cung cấp Gói Dùng thử miễn phí 0đ trong 1 năm để Cửa hàng kiểm nghiệm thực tế toàn bộ tính năng trước khi quyết định trả phí, FIXO Repair OS áp dụng chính sách không hoàn tiền đối với các kỳ cước thuê bao đã thanh toán và kích hoạt thành công khi Cửa hàng tự ngừng sử dụng hoặc hạ gói trước thời hạn.',
        ],
        bullets: [
          'Ngoại lệ hoàn tiền hoặc đối trừ số 1 — Lỗi thanh toán chuyển khoản trùng lặp: Trường hợp Cửa hàng thao tác chuyển khoản nhầm hai (02) lần trở lên cho cùng một yêu cầu thanh toán gói cước, Betech Digital sẽ hoàn trả 100% khoản tiền chuyển dư về tài khoản ngân hàng gốc hoặc quy đổi cộng dồn sang kỳ hạn tiếp theo theo xác nhận của Chủ cửa hàng.',
          'Ngoại lệ hoàn tiền số 2 — Sự cố hạ tầng nghiêm trọng từ phía FIXO không thể khắc phục: Trường hợp nền tảng gặp sự cố kỹ thuật nghiêm trọng phát sinh trực tiếp từ lỗi hạ tầng của FIXO khiến gian hàng ngừng hoạt động hoàn toàn và đội ngũ kỹ thuật Betech Digital không thể khắc phục khôi phục dịch vụ.',
        ],
      },
      {
        id: 'chinh-sach-xuat-hoa-don-dien-tu',
        number: 'Điều 4',
        title: 'Chính sách Xuất Hóa đơn Điện tử Hợp lệ cho Doanh nghiệp & Hộ Kinh doanh',
        paragraphs: [
          'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH (Mã số thuế: 0318601210) thực hiện xuất hóa đơn điện tử hợp pháp theo quy định pháp luật thuế Việt Nam đối với các khoản thanh toán gói cước phần mềm trả phí (Gói Tiêu chuẩn và Gói Chuyên nghiệp).',
          'Để nhận hóa đơn điện tử, Chủ cửa hàng vui lòng cung cấp đầy đủ Tên đơn vị pháp nhân / Hộ kinh doanh, Mã số thuế hợp lệ, Địa chỉ đăng ký kinh doanh và Email nhận hóa đơn điện tử về địa chỉ admin@betech-digital.com hoặc qua kênh hỗ trợ chính thức ngay trong kỳ phát sinh giao dịch thanh toán.',
        ],
      },
      {
        id: 'vong-doi-luu-tru-va-xoa-du-lieu-sau-het-han',
        number: 'Điều 5',
        title: 'Vòng đời Lưu trữ, Xuất Dữ liệu và Xóa Dữ liệu Sau Khi Gói cước Hết hạn',
        paragraphs: [
          'Betech Digital tuyệt đối không xóa đột ngột dữ liệu của Cửa hàng ngay tại thời điểm gói cước vừa hết hạn. Hệ thống áp dụng quy trình bảo vệ vòng đời dữ liệu ba (03) mốc thời gian rõ ràng để Chủ cửa hàng luôn chủ động sao lưu hoặc gia hạn:',
        ],
        bullets: [
          'Giai đoạn 30 ngày đầu sau khi hết hạn — Chế độ Chỉ xem / Cho phép xuất dữ liệu: Trong vòng 30 ngày kể từ ngày gói cước hết hạn mà chưa gia hạn, gian hàng được chuyển sang chế độ Chỉ xem (Read-Only) và Cho xuất dữ liệu. Cửa hàng tạm ngừng tạo đơn tiếp nhận mới nhưng vẫn đăng nhập bình thường để tra cứu lịch sử đơn sửa chữa, kiểm tra hạn bảo hành cho khách, xuất báo cáo dữ liệu và thực hiện gia hạn để khôi phục toàn quyền tức thì.',
          'Giai đoạn lưu trữ an toàn tối đa 90 ngày trước khi xóa vĩnh viễn: Sau mốc 30 ngày Chỉ xem, nếu gian hàng vẫn chưa gia hạn, tài khoản sẽ tạm khóa truy cập nhưng toàn bộ cơ sở dữ liệu vẫn được lưu trữ bảo mật tối đa đến hết 90 ngày kể từ ngày hết hạn. Sau mốc 90 ngày không gia hạn, hệ thống mới tiến hành thanh lý và xóa vĩnh viễn dữ liệu gian hàng khỏi máy chủ lưu trữ.',
          'Yêu cầu xóa dữ liệu chủ động từ Chủ cửa hàng (5–7 ngày làm việc): Trong mọi trường hợp Chủ cửa hàng muốn chủ động ngừng kinh doanh và yêu cầu xóa hoàn toàn dữ liệu gian hàng sớm hơn thời hạn tự động, Chủ cửa hàng gửi yêu cầu xác thực chính chủ về admin@betech-digital.com; Betech Digital cam kết hoàn tất quy trình xóa dữ liệu và phản hồi biên bản xác nhận trong vòng 5–7 ngày làm việc.',
        ],
        highlightNote:
          'Ngay khi Cửa hàng hoàn tất gia hạn qua SePay VietQR trong phạm vi 90 ngày lưu trữ, toàn bộ dữ liệu lịch sử đơn hàng, khách hàng, tồn kho và sổ quỹ được khôi phục nguyên trạng 100%.',
      },
    ],
  },

  sla: {
    slug: 'sla',
    path: '/sla',
    shortTitle: 'Cam kết SLA & Hỗ trợ',
    title: 'Cam kết Chất lượng Dịch vụ (SLA) & Hỗ trợ Kỹ thuật',
    subtitle:
      'Chỉ số cam kết độ sẵn sàng hệ thống Uptime 99.5%, cơ chế sao lưu cơ sở dữ liệu tự động hàng ngày, quy định thông báo bảo trì trước tối thiểu 24 giờ và khung giờ trực hỗ trợ 7 ngày/tuần.',
    seoTitle:
      'Cam kết Chất lượng Dịch vụ (SLA) & Hỗ trợ Kỹ thuật — FIXO Repair OS | Betech Digital',
    seoDescription:
      'Cam kết SLA vận hành nền tảng FIXO Repair OS của Betech Digital: Uptime 99.5%, sao lưu cơ sở dữ liệu tự động hàng ngày, báo trước bảo trì tối thiểu 24 giờ và hỗ trợ kỹ thuật 08:00 – 21:00 từ Thứ 2 đến Chủ nhật.',
    effectiveDate: '29/10/2026',
    lastUpdated: '29/10/2026',
    summaryPoints: [
      'Cam kết độ sẵn sàng hạ tầng hệ thống (Uptime) đạt tối thiểu 99.5% theo chu kỳ vận hành hàng tháng.',
      'Sao lưu cơ sở dữ liệu tự động hàng ngày (Daily Automated Backup) sang phân vùng lưu trữ dự phòng độc lập và thông báo trước tối thiểu 24 giờ cho mọi lịch bảo trì định kỳ.',
      'Trực hỗ trợ kỹ thuật trực tuyến xuyên suốt 08:00 – 21:00 tất cả các ngày từ Thứ 2 đến Chủ nhật qua Hotline / Zalo 0775 600 351 và Email admin@betech-digital.com.',
    ],
    sections: [
      {
        id: 'cam-ket-do-san-sang-uptime',
        number: 'Điều 1',
        title: 'Cam kết Độ sẵn sàng Hệ thống (Uptime 99.5%)',
        paragraphs: [
          'CÔNG TY TNHH DỊCH VỤ GIẢI PHÁP SỐ BETECH cam kết duy trì tỷ lệ thời gian hoạt động sẵn sàng của nền tảng phần mềm đám mây FIXO Repair OS (Monthly System Uptime) đạt tối thiểu 99.5% tính trên từng chu kỳ tháng dương lịch.',
          'Hệ thống máy chủ ứng dụng, dịch vụ API và cơ sở dữ liệu được giám sát tự động liên tục nhằm phát hiện tức thì các bất thường về độ trễ phản hồi, tải CPU/RAM hoặc kết nối mạng.',
        ],
        bullets: [
          'Chỉ số Uptime 99.5% áp dụng cho toàn bộ các luồng nghiệp vụ cốt lõi: đăng nhập gian hàng, tiếp nhận đơn sửa chữa, cập nhật trạng thái kỹ thuật / QC, quản lý kho linh kiện, đóng ca sổ quỹ và cổng tra cứu đơn hàng công khai.',
          'Thời gian gián đoạn (nếu có) không tính vào vi phạm SLA trong hai trường hợp: (a) các đợt bảo trì, nâng cấp định kỳ đã được thông báo trước tối thiểu 24 giờ theo Điều 3; và (b) sự kiện bất khả kháng diện rộng ngoài tầm kiểm soát trực tiếp như đứt cáp trục viễn thông quốc gia, thiên tai hoặc sự cố mất kết nối từ phía nhà mạng nội bộ tại địa điểm của Cửa hàng.',
        ],
      },
      {
        id: 'sao-luu-tu-dong-hang-ngay-va-phuc-hoi',
        number: 'Điều 2',
        title: 'Cơ chế Sao lưu Cơ sở Dữ liệu Tự động Hàng ngày (Daily Automated Backup)',
        paragraphs: [
          'An toàn dữ liệu vận hành của Cửa hàng là ưu tiên kỹ thuật số một của Betech Digital. Hạ tầng FIXO Repair OS vận hành cơ chế sao lưu cơ sở dữ liệu tự động hàng ngày (Daily Automated Backup) mà không làm gián đoạn thao tác làm việc tại quầy của nhân viên.',
        ],
        bullets: [
          'Tần suất sao lưu định kỳ: Toàn bộ cơ sở dữ liệu đa thuê bao được tự động chụp bản sao lưu hàng ngày và đồng bộ sang không gian lưu trữ dự phòng tách biệt vật lý/logic với máy chủ vận hành chính.',
          'Kiểm định khả năng phục hồi thảm họa (Disaster Recovery): Các bản sao lưu được mã hóa bảo mật và kiểm tra tính toàn vẹn định kỳ để sẵn sàng khôi phục nhanh dữ liệu gian hàng trong tình huống phát sinh sự cố phần cứng bất ngờ.',
        ],
      },
      {
        id: 'quy-dinh-bao-tri-dinh-ky-bao-truoc-24-gio',
        number: 'Điều 3',
        title: 'Quy định Bảo trì Định kỳ và Thông báo Trước Tối thiểu 24 Giờ',
        paragraphs: [
          'Để liên tục nâng cấp hiệu năng, bổ sung tính năng mới và cập nhật các bản vá bảo mật hạ tầng, Betech Digital thực hiện các đợt triển khai không gián đoạn (zero-downtime deployment) cho hầu hết các bản cập nhật thường xuyên.',
          'Đối với các đợt bảo trì hạ tầng hoặc nâng cấp cấu trúc cơ sở dữ liệu định kỳ có kế hoạch dẫn đến tạm ngưng truy cập ngắn hạn, Betech Digital cam kết thực hiện nghiêm ngặt quy chuẩn thông báo trước:',
        ],
        bullets: [
          'Thời hạn thông báo trước: Thông báo lịch bảo trì định kỳ tối thiểu 24 giờ trước thời điểm tiến hành qua thông báo trên bảng điều khiển quản trị hoặc Email quản trị đã đăng ký của Chủ cửa hàng.',
          'Khung giờ thực hiện tối ưu: Lịch bảo trì có kế hoạch luôn được ưu tiên bố trí vào khung giờ đêm khuya (từ sau 22:00 tối đến trước 06:00 sáng hôm sau theo giờ Việt Nam) khi các cửa hàng sửa chữa đã kết thúc ca làm việc trong ngày.',
        ],
      },
      {
        id: 'khung-gio-va-kenh-ho-tro-ky-thuat',
        number: 'Điều 4',
        title: 'Khung giờ Hỗ trợ Kỹ thuật Trực tuyến (08:00 – 21:00, Thứ 2 – Chủ nhật)',
        paragraphs: [
          'Thấu hiểu đặc thù ngành dịch vụ sửa chữa thiết bị công nghệ hoạt động xuyên suốt cả tuần bao gồm Thứ 7 và Chủ nhật, đội ngũ kỹ thuật và chuyên viên hỗ trợ vận hành của Betech Digital duy trì lịch trực đồng hành toàn tuần cùng Cửa hàng:',
        ],
        bullets: [
          'Khung giờ trực hỗ trợ chính thức: 08:00 – 21:00 tất cả các ngày từ Thứ 2 đến Chủ nhật.',
          'Hotline / Zalo hỗ trợ kỹ thuật nhanh: 0775 600 351 (https://zalo.me/0775600351) — hỗ trợ giải đáp thao tác, kiểm tra đối soát gói cước và hỗ trợ từ xa khi cần thiết.',
          'Email tiếp nhận yêu cầu kỹ thuật, xuất hóa đơn & pháp lý: admin@betech-digital.com.',
          'Hỗ trợ trực tiếp tại văn phòng Betech Digital (theo lịch hẹn làm việc): Trụ sở chính 92A-94 Bạch Đằng, Phường 2 (Tân Sơn Hòa), Quận Tân Bình, TP. Hồ Chí Minh và Chi nhánh 73 Rạch Bùng Binh, Phường Nhiêu Lộc, Quận 3, TP. Hồ Chí Minh.',
        ],
      },
      {
        id: 'phan-loai-muc-do-uu-tien-phan-hoi-su-co',
        number: 'Điều 5',
        title: 'Phân loại Mức độ Ưu tiên và Thời gian Phản hồi Xử lý Sự cố',
        paragraphs: [
          'Mọi yêu cầu hỗ trợ gửi tới kênh chính thức của Betech Digital trong khung giờ 08:00 – 21:00 được phân loại theo mức độ ảnh hưởng thực tế đến hoạt động tại quầy của Cửa hàng để ưu tiên nguồn lực kỹ thuật:',
        ],
        bullets: [
          'Mức 1 — Khẩn cấp (Critical): Gian hàng không thể đăng nhập, gián đoạn toàn bộ luồng tạo đơn tiếp nhận hoặc lỗi đối soát thanh toán diện rộng. Thời gian tiếp nhận và phản hồi xử lý ban đầu: trong vòng 15 – 30 phút; đội ngũ kỹ thuật tập trung khắc phục liên tục cho đến khi khôi phục hoạt động.',
          'Mức 2 — Cao (High): Một tính năng nghiệp vụ quan trọng (in phiếu tiếp nhận A4/nhiệt, cập nhật kiểm định QC, xuất kho linh kiện hoặc chốt sổ quỹ ca) gặp lỗi cục bộ tại một gian hàng. Thời gian phản hồi: trong vòng 1 – 2 giờ hỗ trợ kèm hướng dẫn xử lý tạm thời hoặc triển khai bản vá trong ngày.',
          'Mức 3 — Tiêu chuẩn (Normal): Yêu cầu hướng dẫn sử dụng cho nhân sự mới, tư vấn thiết lập phân quyền chi nhánh, cấu hình mẫu in thương hiệu hoặc đề xuất tính năng mới. Thời gian phản hồi: trong vòng 4 – 8 giờ hỗ trợ (tối đa không quá 24 giờ).',
        ],
        highlightNote:
          'Bên cạnh kênh hỗ trợ trực tiếp, Chủ cửa hàng và nhân viên có thể tra cứu tức thì quy trình 5 vai trò ngay trong Trung tâm Hướng dẫn Vận hành tích hợp sẵn trên thanh điều hướng hệ thống.',
      },
    ],
  },
};

export const POLICY_NAV_ITEMS: readonly PolicyNavItem[] = [
  {
    slug: 'terms',
    path: POLICY_DOCUMENTS.terms.path,
    shortTitle: POLICY_DOCUMENTS.terms.shortTitle,
    title: POLICY_DOCUMENTS.terms.title,
    description: 'Khung pháp lý B2B SaaS & phân định trách nhiệm cửa hàng',
  },
  {
    slug: 'privacy',
    path: POLICY_DOCUMENTS.privacy.path,
    shortTitle: POLICY_DOCUMENTS.privacy.shortTitle,
    title: POLICY_DOCUMENTS.privacy.title,
    description: '100% quyền sở hữu dữ liệu, che dấu PII & Nghị định 13/2023/NĐ-CP',
  },
  {
    slug: 'billing-policy',
    path: POLICY_DOCUMENTS['billing-policy'].path,
    shortTitle: POLICY_DOCUMENTS['billing-policy'].shortTitle,
    title: POLICY_DOCUMENTS['billing-policy'].title,
    description: 'Biểu phí 3 gói cước, SePay VietQR & lưu trữ dữ liệu 30/90 ngày',
  },
  {
    slug: 'sla',
    path: POLICY_DOCUMENTS.sla.path,
    shortTitle: POLICY_DOCUMENTS.sla.shortTitle,
    title: POLICY_DOCUMENTS.sla.title,
    description: 'Uptime 99.5%, sao lưu hàng ngày & hỗ trợ 08:00 – 21:00',
  },
] as const;

export function getPolicyDocument(slug: PolicySlug): PolicyDocument {
  return POLICY_DOCUMENTS[slug];
}

export function buildOrganizationJsonLd() {
  return {
    '@type': 'Organization',
    name: BETECH_LEGAL_ENTITY.brandName,
    legalName: BETECH_LEGAL_ENTITY.companyName,
    alternateName: BETECH_LEGAL_ENTITY.internationalName,
    taxID: BETECH_LEGAL_ENTITY.taxId,
    url: BETECH_LEGAL_ENTITY.websiteUrl,
    email: BETECH_LEGAL_ENTITY.email,
    telephone: BETECH_LEGAL_ENTITY.hotline,
    address: [
      {
        '@type': 'PostalAddress',
        streetAddress: '92A-94 Bạch Đằng, Phường 2 (Tân Sơn Hòa), Quận Tân Bình',
        addressLocality: 'TP. Hồ Chí Minh',
        addressCountry: 'VN',
      },
      {
        '@type': 'PostalAddress',
        streetAddress: '73 Rạch Bùng Binh, Phường Nhiêu Lộc, Quận 3',
        addressLocality: 'TP. Hồ Chí Minh',
        addressCountry: 'VN',
      },
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: BETECH_LEGAL_ENTITY.hotline,
      email: BETECH_LEGAL_ENTITY.email,
      contactType: 'customer support',
      availableLanguage: ['Vietnamese'],
      hoursAvailable: BETECH_LEGAL_ENTITY.supportHours,
    },
  };
}

export function buildPolicyJsonLd(slug: PolicySlug) {
  const doc = POLICY_DOCUMENTS[slug];
  const organization = buildOrganizationJsonLd();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: doc.seoTitle,
    headline: doc.title,
    description: doc.seoDescription,
    url: `${BETECH_LEGAL_ENTITY.productUrl}${doc.path}`,
    inLanguage: 'vi-VN',
    datePublished: '2026-10-29',
    dateModified: '2026-10-29',
    isPartOf: {
      '@type': 'WebSite',
      name: BETECH_LEGAL_ENTITY.productName,
      url: BETECH_LEGAL_ENTITY.productUrl,
    },
    author: organization,
    publisher: organization,
  };
}
