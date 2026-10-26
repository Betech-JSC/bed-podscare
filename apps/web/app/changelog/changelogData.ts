export const CURRENT_APP_VERSION = 'v1.5.0';

export type ChangelogCategory = 'feature' | 'improvement' | 'security';
export type ChangeCategory = ChangelogCategory;

export const CHANGELOG_CATEGORY_LABELS: Record<
  'all' | ChangelogCategory,
  string
> = {
  all: 'Tất cả hạng mục',
  feature: 'Tính năng mới',
  improvement: 'Cải tiến vận hành',
  security: 'Bảo mật & Hiệu năng',
};

export interface ChangelogHighlightItem {
  id: string;
  category: ChangelogCategory;
  title: string;
  description: string;
  moduleTag: string;
}

export type ChangelogChangeItem = ChangelogHighlightItem;

export interface ChangelogRelease {
  version: string;
  releaseDate: string;
  title: string;
  summary: string;
  isLatest?: boolean;
  badgeLabel: string;
  highlights: string[];
  changes: ChangelogHighlightItem[];
}

export type RoadmapStatus = 'in_progress' | 'planned' | 'exploring';

export const ROADMAP_STATUS_ORDER: readonly RoadmapStatus[] = [
  'in_progress',
  'planned',
  'exploring',
] as const;

export const ROADMAP_STATUS_META: Record<
  RoadmapStatus,
  {
    label: string;
    subtitle: string;
    badgeType: 'progress' | 'wait' | 'new';
  }
> = {
  in_progress: {
    label: 'Đang phát triển',
    subtitle: 'Các tính năng đang được đội ngũ kỹ thuật xây dựng và kiểm thử nội bộ',
    badgeType: 'progress',
  },
  planned: {
    label: 'Dự kiến sắp tới',
    subtitle: 'Các hạng mục đã chốt thiết kế kiến trúc cho các bản phát hành kế tiếp',
    badgeType: 'wait',
  },
  exploring: {
    label: 'Đang nghiên cứu',
    subtitle: 'Các giải pháp tự động hóa và mở rộng hệ sinh thái đang khảo sát',
    badgeType: 'new',
  },
};

export interface RoadmapItem {
  id: string;
  status: RoadmapStatus;
  title: string;
  targetAudience: string;
  etaLabel: string;
  moduleTag: string;
  description: string;
  benefits: string[];
}

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: 'v1.5.0',
    releaseDate: '26/10/2026',
    title:
      'Trung tâm Hướng dẫn Vận hành 5 Vai trò, Luồng Onboarding Tương tác & Cổng Nhật ký Cập nhật',
    summary:
      'Chuẩn hóa toàn diện trải nghiệm đào tạo nhân sự mới tại cửa hàng với Trung tâm Hỗ trợ Vận hành trực tiếp trong ứng dụng, Luồng Hướng dẫn Bắt đầu (Hybrid Onboarding) cá nhân hóa cho 5 vai trò, Bảng kiểm Thiết lập Cửa hàng 5 bước cho Chủ cửa hàng và trang Nhật ký Cập nhật & Lộ trình Phát triển.',
    isLatest: true,
    badgeLabel: 'Bản phát hành mới nhất',
    highlights: [
      'Luồng Onboarding kết hợp Welcome Screen & Step Tour 4 bước riêng cho từng vai trò (Admin, CSKH, Kỹ thuật, QC, Thủ kho).',
      'Bảng kiểm Thiết lập Cửa hàng 5 bước (Store Setup Checklist) trên Dashboard dành cho Chủ cửa hàng.',
      'Trung tâm Hướng dẫn Vận hành (Help Center Modal) tích hợp sơ đồ luồng 6 bước và tìm kiếm tức thì.',
      'Chuẩn hóa quy trình đăng ký gian hàng mới kèm gửi Email chào mừng tự động và xác thực tên miền.',
    ],
    changes: [
      {
        id: 'v150-onboarding-tour',
        category: 'feature',
        title: 'Luồng Hướng dẫn Bắt đầu Tương tác Theo 5 Vai trò Cửa hàng',
        description:
          'Tự động hiển thị màn hình chào mừng và hướng dẫn 4 bước trọng tâm ở lần đăng nhập đầu tiên cho Admin, CSKH, Kỹ thuật viên, QC và Thủ kho; phân lập trạng thái lưu trữ theo từng gian hàng và từng nhân viên trên máy trạm POS.',
        moduleTag: 'Onboarding & Đào tạo',
      },
      {
        id: 'v150-admin-setup-checklist',
        category: 'feature',
        title: 'Bảng kiểm Thiết lập Cửa hàng 5 Bước trên Bảng điều khiển Admin',
        description:
          'Hỗ trợ Chủ cửa hàng mới theo dõi tiến độ cấu hình Thương hiệu & VietQR, Chi nhánh, Tài khoản nhân sự, Danh mục thiết bị và Mở ca làm việc đầu tiên.',
        moduleTag: 'Tổng quan (/dashboard)',
      },
      {
        id: 'v150-help-center',
        category: 'feature',
        title: 'Trung tâm Hỗ trợ Vận hành Trực tiếp Theo Vai trò (In-App Help Center)',
        description:
          'Tích hợp cẩm nang vận hành ngay tại nút Mở trung tâm trên Sidebar, bao gồm sơ đồ luồng xử lý đơn hàng 6 giai đoạn liên bộ phận, quy trình chuẩn hàng ngày và nút khởi chạy lại hướng dẫn bắt đầu.',
        moduleTag: 'Hỗ trợ vận hành',
      },
      {
        id: 'v150-tenant-welcome-email',
        category: 'improvement',
        title: 'Email Chào mừng Gian hàng Mới & Kiểm tra Tên miền Email Thực',
        description:
          'Tự động gửi email chào mừng kèm thông tin gian hàng sau khi đăng ký thành công và kiểm tra bản ghi MX/A của tên miền email đăng ký để ngăn chặn dữ liệu ảo.',
        moduleTag: 'Đăng ký SaaS (/register)',
      },
    ],
  },
  {
    version: 'v1.4.0',
    releaseDate: '23/10/2026',
    title:
      'Gia cố Bảo mật Đa Thuê bao, Cách ly Kho Chi nhánh & Quy trình Bảo hành / Kiểm toán JSON Diff',
    summary:
      'Nâng cấp toàn diện hàng rào bảo mật tài chính và dữ liệu đa chi nhánh: cách ly tồn kho theo từng cơ sở, hoàn thiện quy trình tiếp nhận bảo hành (Rework), hoàn tiền minh bạch và lưu vết kiểm toán chi tiết.',
    badgeLabel: 'Bảo mật & Quy mô Chuỗi',
    highlights: [
      'Cách ly tồn kho linh kiện độc lập theo từng chi nhánh (Branch Warehouse Isolation).',
      'Quy trình Bảo hành toàn diện: Tiếp nhận bảo hành (Rework), Hoàn tiền (Refund) và Thu hồi bảo hành kèm Audit Log JSON Diff.',
      'Phân trang đồng bộ toàn hệ thống (Đơn sửa chữa, Khách hàng, Bảo hành, Kho) và tối ưu chỉ mục MySQL.',
    ],
    changes: [
      {
        id: 'v140-branch-warehouse-isolation',
        category: 'security',
        title: 'Cách ly Tồn kho Linh kiện Độc lập Theo Chi nhánh',
        description:
          'Đảm bảo mọi giao dịch nhập kho, xuất kho sửa chữa và cảnh báo tồn tối thiểu được quản lý tách biệt theo từng chi nhánh thông qua bảng BranchPart.',
        moduleTag: 'Kho & Mua hàng (/inventory)',
      },
      {
        id: 'v140-warranty-refund-audit',
        category: 'feature',
        title: 'Tiếp nhận Bảo hành (Rework), Hoàn tiền & Nhật ký Kiểm toán JSON Diff',
        description:
          'Hỗ trợ tạo đơn bảo hành liên kết đơn gốc, hoàn tiền kèm tự động tạo phiếu chi sổ quỹ và ghi nhận chi tiết giá trị trước/sau thay đổi trong Nhật ký hoạt động.',
        moduleTag: 'Bảo hành (/warranty) & Nhật ký (/audit)',
      },
      {
        id: 'v140-financial-rbac-guardrails',
        category: 'security',
        title: 'Hàng rào Bảo mật Tài chính & Ẩn Giá vốn / Doanh thu Tuyệt đối với Kỹ thuật viên',
        description:
          'Thực thi chính sách ẩn 100% thông tin tài chính đối với vai trò Kỹ thuật viên ở cả tầng API Backend lẫn giao diện Frontend.',
        moduleTag: 'Phân quyền RBAC',
      },
      {
        id: 'v140-system-pagination-mysql',
        category: 'improvement',
        title: 'Phân trang Chuẩn hóa Toàn Hệ thống & Tối ưu Truy vấn Cơ sở Dữ liệu',
        description:
          'Bổ sung thanh phân trang đồng nhất và bộ chỉ mục kết hợp (Composite Indexes) giúp tăng tốc độ tải danh sách đơn hàng và lịch sử bảo hành lớn.',
        moduleTag: 'Hiệu năng Hệ thống',
      },
    ],
  },
  {
    version: 'v1.3.0',
    releaseDate: '19/10/2026',
    title:
      'Trợ lý Thông minh Telegram AI, Thông báo Đơn hàng Thời gian thực & Quản lý Công nợ Nhà cung cấp',
    summary:
      'Tích hợp trí tuệ nhân tạo vào quản trị từ xa qua Telegram Bot dành cho Chủ cửa hàng, đồng thời ra mắt phân hệ Quản lý Nhà cung cấp, Phiếu nhập kho đa mặt hàng và Sổ cái công nợ phải trả.',
    badgeLabel: 'Tự động hóa & Mua hàng',
    highlights: [
      'Trợ lý Telegram AI hỗ trợ truy vấn nhanh doanh thu, tồn kho, ca trực và tra cứu đơn hàng bằng ngôn ngữ tự nhiên.',
      'Thông báo Telegram tự động theo thời gian thực khi có đơn tiếp nhận mới hoặc hoàn tất thanh toán.',
      'Phân hệ Nhà cung cấp, Phiếu nhập kho (Goods Receipt) và Quản lý công nợ phải trả.',
    ],
    changes: [
      {
        id: 'v130-telegram-ai-assistant',
        category: 'feature',
        title: 'Trợ lý Quản trị Thông minh qua Telegram (AI Smart Assistant v2)',
        description:
          'Cho phép Quản trị viên chat trực tiếp với Bot Telegram để hỏi báo cáo doanh thu ngày/tháng, kiểm tra đơn đang tồn xưởng và tra cứu công nợ với bộ nhớ ngữ cảnh thông minh.',
        moduleTag: 'Tích hợp Telegram AI',
      },
      {
        id: 'v130-suppliers-goods-receipts',
        category: 'feature',
        title: 'Quản lý Nhà cung cấp, Phiếu Nhập Kho & Công nợ Phải trả',
        description:
          'Hỗ trợ lập phiếu nhập kho nhiều mặt hàng linh kiện cùng lúc, tự động tính toán giá vốn và theo dõi lịch sử trả nợ nhà cung cấp.',
        moduleTag: 'Kho & Mua hàng (/inventory)',
      },
      {
        id: 'v130-kpi-sorting-dashboard',
        category: 'improvement',
        title: 'Bảng Xếp hạng Hiệu suất Nhân sự KPI & 4 Thẻ Đối soát Doanh thu / Công nợ',
        description:
          'Nâng cấp Bảng điều khiển Admin với 4 thẻ đối soát trực quan (Tổng doanh thu, Đã thu, Chưa thu công nợ, Ca trực) và bảng xếp hạng năng suất nhân viên.',
        moduleTag: 'Hiệu suất KPI (/kpi)',
      },
    ],
  },
  {
    version: 'v1.2.0',
    releaseDate: '10/10/2026',
    title:
      'Sổ quỹ & Đối soát Ca trực, Đơn Giao nhận COD, Yêu cầu Linh kiện Đặc biệt & Bàn giao Ca Kỹ thuật',
    summary:
      'Khép kín vòng lặp kiểm soát tiền mặt tại quầy lễ tân với phân hệ Sổ quỹ & Ca trực, đồng thời tháo gỡ các điểm nghẽn tại xưởng kỹ thuật bằng tính năng Yêu cầu linh kiện đặc biệt và Bàn giao đơn giữa ca.',
    badgeLabel: 'Vận hành Thực chiến',
    highlights: [
      'Quản lý Mở ca / Kết ca và Sổ quỹ thu chi tiền mặt tự động đồng bộ từ thanh toán đơn sửa chữa.',
      'Luồng Yêu cầu linh kiện đặc biệt (Special Parts Request) và Bàn giao đơn giữa các Kỹ thuật viên.',
      'Hỗ trợ loại đơn Giao nhận COD kèm quản lý địa chỉ giao hàng và đối soát thu hộ.',
    ],
    changes: [
      {
        id: 'v120-workshift-cashbook',
        category: 'feature',
        title: 'Phân hệ Sổ quỹ & Đối soát Ca trực (WorkShift & Cashbook)',
        description:
          'Khai báo tiền mặt đầu ca, tự động ghi nhận phiếu thu khi khách thanh toán đơn sửa chữa, lập phiếu chi nội bộ và in biên bản đối soát chênh lệch cuối ca.',
        moduleTag: 'Sổ quỹ & Ca trực (/shifts)',
      },
      {
        id: 'v120-special-parts-handover',
        category: 'feature',
        title: 'Yêu cầu Linh kiện Đặc biệt & Bàn giao Đơn Kỹ thuật viên Giữa Ca',
        description:
          'Cho phép Kỹ thuật viên tạm dừng đơn sang trạng thái Chờ linh kiện khi cần đặt mua vật tư hiếm, hoặc bàn giao đơn đang sửa cho đồng nghiệp kèm lý do chuẩn hóa.',
        moduleTag: 'Không gian Kỹ thuật (/tech)',
      },
      {
        id: 'v120-cod-shipping-orders',
        category: 'improvement',
        title: 'Luồng Đơn Sửa chữa Giao nhận COD & Dịch vụ Bổ sung Phát sinh',
        description:
          'Hỗ trợ Lễ tân/CSKH gắn nhãn đơn COD, lưu địa chỉ giao nhận và thêm hạng mục dịch vụ bổ sung khi khách hàng đồng ý sửa thêm bệnh phát sinh.',
        moduleTag: 'Đơn sửa chữa (/repairs)',
      },
    ],
  },
  {
    version: 'v1.1.0',
    releaseDate: '05/10/2026',
    title:
      'Thanh toán Tự động VietQR SePay, In Nhiệt K80 Cắt Liên Đôi & Tùy biến Thương hiệu Đa Thuê bao',
    summary:
      'Tăng tốc độ thanh toán tại quầy với mã QR động VietQR tự động xác nhận giao dịch qua Webhook SePay, kết hợp công nghệ in nhiệt K80 tách đôi liên khách/liên khay kỹ thuật và nhận diện thương hiệu riêng cho từng cửa hàng.',
    badgeLabel: 'Thanh toán & Mẫu in POS',
    highlights: [
      'Sinh mã VietQR động theo từng đơn hàng và tự động xác nhận thanh toán qua cổng SePay.',
      'In phiếu A4 2 liên và phiếu nhiệt K80 tự động cắt rời liên giao khách & tem dán khay kỹ thuật.',
      'Cấu hình Logo, Hotline và thông tin ngân hàng riêng biệt cho từng gian hàng trên nền tảng Multi-tenant SaaS.',
    ],
    changes: [
      {
        id: 'v110-sepay-vietqr',
        category: 'feature',
        title: 'Tích hợp Cổng Thanh toán Tự động VietQR SePay',
        description:
          'Tự động sinh mã QR chuyển khoản chính xác số tiền và nội dung đơn hàng, đối soát giao dịch thời gian thực kèm cơ chế chống trùng lặp (Idempotency).',
        moduleTag: 'Thanh toán (/payments)',
      },
      {
        id: 'v110-k80-a4-silent-print',
        category: 'feature',
        title: 'Mẫu In A4 2 Liên & Phiếu Nhiệt K80 Tự động Cắt Liên Đôi',
        description:
          'Hỗ trợ in nhanh tại quầy với mã QR SVG sắc nét, tách biệt phần biên nhận khách hàng và phần phiếu định danh khay máy cho kỹ thuật viên.',
        moduleTag: 'Thương hiệu & Mẫu in (/branding)',
      },
      {
        id: 'v110-multitenant-saas-billing',
        category: 'security',
        title: 'Kiến trúc Đa Thuê bao (Multi-tenant) & Quản trị Bản quyền SaaS Tự động',
        description:
          'Cung cấp cổng quản trị gói cước (Dùng thử, Tiêu chuẩn, Chuyên nghiệp) và gia hạn bản quyền tự động bằng VietQR.',
        moduleTag: 'Gói cước & Bản quyền (/subscription)',
      },
    ],
  },
  {
    version: 'v1.0.0',
    releaseDate: '30/09/2026',
    title:
      'Khởi chạy Nền tảng FIXO Repair OS 1.0 — Hệ điều hành Xưởng Sửa chữa Thiết bị Công nghệ',
    summary:
      'Phiên bản nền tảng đầu tiên của FIXO Repair OS với kiến trúc Monorepo hiện đại, Máy trạng thái Đơn sửa chữa (Repair Order FSM), Trạm Tiếp nhận POS 2 cột siêu tốc và Cổng Tra cứu Khách hàng công khai.',
    badgeLabel: 'Phiên bản Nền tảng 1.0',
    highlights: [
      'Máy trạng thái Đơn sửa chữa (Repair Order FSM) kiểm soát chặt chẽ từ lúc nhận máy đến khi hoàn tất trả khách.',
      'Quầy tiếp nhận nhanh hỗ trợ chọn thành phần phần cứng (Tai trái L, Tai phải R, Hộp sạc Case) và bảng kiểm 9 tiêu chí.',
      'Cổng tra cứu tiến độ sửa chữa và bảo hành công khai cho khách hàng qua mã QR (/track).',
    ],
    changes: [
      {
        id: 'v100-pos-workstation-fsm',
        category: 'feature',
        title: 'Trạm Làm việc POS 3-Pane & Máy Trạng thái Đơn hàng (FSM Optimistic Locking)',
        description:
          'Chuẩn hóa quy trình vận hành liên bộ phận từ Tiếp nhận, Chẩn đoán, Sửa chữa, Kiểm định QC đến Trả máy với cơ chế khóa lạc quan chống xung đột thao tác đồng thời.',
        moduleTag: 'Đơn sửa chữa (/repairs)',
      },
      {
        id: 'v100-public-tracking-portal',
        category: 'feature',
        title: 'Cổng Tra cứu Tiến độ Sửa chữa & Bảo hành Minh bạch (/track)',
        description:
          'Khách hàng quét mã QR trên phiếu tiếp nhận để xem trực tiếp tình trạng kiểm tra ban đầu, bộ phận gửi sửa và tiến độ xử lý theo thời gian thực.',
        moduleTag: 'Cổng Tra cứu (/track)',
      },
      {
        id: 'v100-calm-jade-design-system',
        category: 'improvement',
        title: 'Hệ thống Thiết kế Calm Jade & Warm Ivory Chuẩn Công thái học',
        description:
          'Xây dựng thư viện giao diện @podscare/ui tối ưu cho nhân viên làm việc liên tục nhiều giờ tại quầy tiếp nhận và bàn kỹ thuật.',
        moduleTag: 'Design System (@podscare/ui)',
      },
    ],
  },
];

export const PRODUCT_ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: 'roadmap-zalo-zns-automation',
    status: 'in_progress',
    title: 'Cổng Thông báo Tự động Zalo ZNS cho Khách hàng',
    targetAudience: 'Lễ tân / CSKH & Chủ cửa hàng',
    etaLabel: 'Quý 4 / 2026',
    moduleTag: 'Chăm sóc Khách hàng Đa kênh',
    description:
      'Tự động gửi tin nhắn Zalo ZNS chính danh thương hiệu cửa hàng đến số điện thoại khách hàng ở 3 mốc: Xác nhận tiếp nhận máy kèm link theo dõi, Thông báo máy đã sửa xong chờ nhận, và Gửi phiếu bảo hành điện tử sau khi thanh toán.',
    benefits: [
      'Giảm 70% thời gian Lễ tân phải gọi điện hoặc nhắn tin thủ công cho từng khách.',
      'Tăng độ tin cậy thương hiệu cửa hàng nhờ tin nhắn ZNS định danh kèm mã tra cứu QR.',
    ],
  },
  {
    id: 'roadmap-tech-tablet-pwa',
    status: 'in_progress',
    title: 'Chế độ Bàn Kỹ thuật Tối ưu Máy tính bảng (Tablet Kiosk Mode)',
    targetAudience: 'Kỹ thuật viên & Kiểm định QC',
    etaLabel: 'Quý 4 / 2026',
    moduleTag: 'Không gian Kỹ thuật (/tech & /qc)',
    description:
      'Tối ưu hóa giao diện cảm ứng thao tác một chạm trên iPad và máy tính bảng gắn tại bàn kỹ thuật, hỗ trợ chụp ảnh vi mạch/ngoại quan trực tiếp từ camera thiết bị và đính kèm ngay vào biên bản sửa chữa.',
    benefits: [
      'Thao tác nhận đơn, tích chọn linh kiện và chụp ảnh nghiệm thu ngay tại bàn khò hàn không cần dùng chuột.',
      'Lưu trữ bằng chứng hình ảnh sắc nét trước và sau khi can thiệp phần cứng.',
    ],
  },
  {
    id: 'roadmap-online-booking-portal',
    status: 'planned',
    title: 'Cổng Đặt lịch Hẹn Sửa chữa & Gửi máy Từ xa Trực tuyến',
    targetAudience: 'Khách hàng Cuối & Bộ phận CSKH',
    etaLabel: 'Quý 1 / 2027',
    moduleTag: 'Cổng Khách hàng (/track)',
    description:
      'Mở rộng trang tra cứu công khai cho phép khách hàng chủ động chọn dòng thiết bị, mô tả triệu chứng lỗi, đặt khung giờ ghé chi nhánh gần nhất hoặc tạo phiếu gửi máy chuyển phát nhanh về xưởng.',
    benefits: [
      'Rút ngắn thời gian chờ đợi tại quầy lễ tân vào các khung giờ cao điểm.',
      'Chuyển đổi mượt mà từ phiếu đặt hẹn trực tuyến thành đơn tiếp nhận chính thức chỉ với 1 cú nhấp chuột.',
    ],
  },
  {
    id: 'roadmap-customer-loyalty-tier',
    status: 'planned',
    title: 'Chương trình Hạng Thành viên & Nhắc lịch Bảo dưỡng Định kỳ',
    targetAudience: 'Chủ cửa hàng & Lễ tân / CSKH',
    etaLabel: 'Quý 1 / 2027',
    moduleTag: 'Khách hàng (/customers)',
    description:
      'Tự động phân hạng khách hàng thân thiết (Tiêu chuẩn, Thân thiết, VIP) dựa trên tổng chi tiêu tích lũy, áp dụng mức ưu đãi tự động khi thanh toán và nhắc lịch vệ sinh/kiểm tra pin định kỳ sau 6 tháng.',
    benefits: [
      'Tăng tỷ lệ khách hàng cũ quay lại sử dụng dịch vụ vệ sinh và thay pin cho các thiết bị khác.',
      'Tự động hóa chính sách chiết khấu tại quầy mà không cần Admin duyệt thủ công từng đơn.',
    ],
  },
  {
    id: 'roadmap-carrier-cod-reconciliation',
    status: 'exploring',
    title: 'Kết nối API Hãng Vận chuyển & Đối soát Tiền Thu hộ COD Tự động',
    targetAudience: 'Chủ cửa hàng, CSKH & Thủ kho',
    etaLabel: 'Quý 2 / 2027',
    moduleTag: 'Giao nhận (/shipments) & Sổ quỹ (/shifts)',
    description:
      'Tích hợp trực tiếp với các đơn vị giao vận (Giao Hàng Nhanh, Giao Hàng Tiết Kiệm, Viettel Post) để đẩy vận đơn tự động từ đơn sửa chữa COD, theo dõi hành trình bưu kiện và đối soát tiền thu hộ về Sổ quỹ.',
    benefits: [
      'Loại bỏ thao tác nhập lại địa chỉ khách hàng sang cổng web của hãng vận chuyển.',
      'Theo dõi chính xác danh sách đơn COD đã giao thành công nhưng hãng vận chuyển chưa chuyển trả tiền.',
    ],
  },
  {
    id: 'roadmap-ai-inventory-forecasting',
    status: 'exploring',
    title: 'Dự báo Nhu cầu Nhập Linh kiện Bằng AI Theo Xu hướng Lỗi',
    targetAudience: 'Thủ kho & Chủ cửa hàng',
    etaLabel: 'Quý 2 / 2027',
    moduleTag: 'Kho & Mua hàng (/inventory)',
    description:
      'Phân tích tốc độ tiêu hao từng mã linh kiện (pin AirPods, cáp cảm biến Apple Watch...) theo từng chi nhánh trong 30–90 ngày qua để đề xuất số lượng đặt hàng tối ưu trước khi chạm ngưỡng hết kho.',
    benefits: [
      'Giảm thiểu số lượng đơn hàng bị treo ở trạng thái Chờ linh kiện (waiting_parts).',
      'Tối ưu hóa dòng tiền nhập kho, tránh tồn đọng vốn ở các mã linh kiện ít phát sinh.',
    ],
  },
];

/**
 * Lọc danh sách các bản phát hành Changelog theo nhóm phân loại và từ khóa tìm kiếm.
 */
export function filterChangelogReleases(
  releases: ChangelogRelease[] = CHANGELOG_RELEASES,
  category: 'all' | ChangelogCategory = 'all',
  rawQuery = ''
): ChangelogRelease[] {
  const query = rawQuery.trim().toLowerCase();

  return releases
    .map((release) => {
      const filteredChanges = release.changes.filter((item) => {
        const matchesCategory =
          category === 'all' || item.category === category;
        if (!matchesCategory) {
          return false;
        }
        if (!query) {
          return true;
        }
        const inChange =
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.moduleTag.toLowerCase().includes(query);
        const inRelease =
          release.version.toLowerCase().includes(query) ||
          release.title.toLowerCase().includes(query) ||
          release.summary.toLowerCase().includes(query);
        return inChange || inRelease;
      });

      const matchesReleaseMeta =
        query !== '' &&
        category === 'all' &&
        (release.version.toLowerCase().includes(query) ||
          release.title.toLowerCase().includes(query) ||
          release.summary.toLowerCase().includes(query) ||
          release.highlights.some((h) => h.toLowerCase().includes(query)));

      if (filteredChanges.length === 0 && !matchesReleaseMeta) {
        return null;
      }

      return {
        ...release,
        changes:
          filteredChanges.length > 0 ? filteredChanges : release.changes,
      };
    })
    .filter((item): item is ChangelogRelease => item !== null);
}

/**
 * Lấy danh sách các hạng mục Roadmap theo trạng thái ('in_progress' | 'planned' | 'exploring').
 */
export function getRoadmapByStatus(
  items: RoadmapItem[] = PRODUCT_ROADMAP_ITEMS,
  status: RoadmapStatus
): RoadmapItem[] {
  return items.filter((item) => item.status === status);
}
