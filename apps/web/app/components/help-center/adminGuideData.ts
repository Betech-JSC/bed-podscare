import type { RoleGuideConfig } from './types';

export const adminGuideData: RoleGuideConfig = {
  roleKey: 'admin',
  tabLabel: 'Quản trị viên',
  roleTitle: 'Quản trị viên Cửa hàng & Điều hành Đa Chi nhánh (Store Admin & Multi-Branch Governance)',
  badgeLabel: 'ROLE: ADMIN · 15 MODULES TOÀN QUYỀN ĐIỀU HÀNH CỬA HÀNG',
  missionSummary:
    'Chịu trách nhiệm điều hành toàn diện hoạt động kinh doanh, vận hành kỹ thuật, kiểm soát tài chính dòng tiền, quản trị nhân sự và bảo mật dữ liệu trên toàn chuỗi chi nhánh thuộc cửa hàng (tenant_id): sử dụng Bộ chuyển đổi Chi nhánh trên Sidebar để giám sát tức thì giữa chế độ Tất cả chi nhánh (ALL) và từng cơ sở; đối soát minh bạch công thức Lợi nhuận ròng (Doanh thu thực thu - Giá vốn linh kiện COGS - Chi phí vận hành - Hoàn tiền = Lợi nhuận ròng); kiểm toán Sổ quỹ & Ca trực (/shifts), giao dịch VietQR SePay (/payments), Hiệu suất KPI (/kpi) và Nhật ký hoạt động (/audit) kèm bảng đối chiếu Before / After Diff.',
  dataScope:
    'Toàn quyền điều hành đa chi nhánh trong phạm vi cửa hàng (Tenant-Wide Multi-Branch Scope): Truy cập đầy đủ 15 module trên Sidebar khớp 100% với rolePermissions.admin chia theo 3 phân khu WORKSPACE (dashboard, repairs, customers, timeline), VẬN HÀNH (tech, qc, warranty) và HỆ THỐNG (branches, branding, users, payments, shifts, subscription, kpi, audit). Tách biệt hoàn toàn với cổng Quản trị Nền tảng (/platform/*) của super_admin.',
  financialVisibility:
    'Minh bạch 100% Tài chính & Giá vốn (full-financial-and-cogs-visibility): Toàn quyền truy cập Doanh thu thực thu (Actual Revenue), Giá vốn linh kiện xuất kho (COGS / cost_price), Chi phí vận hành ca trực (Operating Expenses), Tổng tiền hoàn trả khách (Refunds), Lợi nhuận ròng (Net Profit), Công nợ chưa thu và Sổ quỹ tiền mặt/ngân hàng toàn chuỗi.',
  coreResponsibilities: [
    'Điều hành đa chi nhánh thông qua Bộ chọn Chi nhánh trên Sidebar (Chuyển đổi linh hoạt giữa chế độ Tất cả chi nhánh và từng chi nhánh cụ thể) và theo dõi sức khỏe vận hành tại Tổng quan (/dashboard).',
    'Đối soát tài chính minh bạch theo công thức chuẩn: Doanh thu thực thu - Giá vốn linh kiện (COGS) - Chi phí vận hành - Hoàn tiền = Lợi nhuận ròng; kiểm soát dòng tiền VietQR SePay tại /payments và Sổ quỹ & Ca trực tại /shifts.',
    'Can thiệp xử lý ngoại lệ trên toàn bộ vòng đời đơn sửa chữa (/repairs): chỉnh sửa thông tin/giá dịch vụ/chiết khấu qua AdminEditOrderModal, phê duyệt mua linh kiện đặc biệt (fulfillSpecialPart), điều phối bàn kỹ thuật (/tech) và QC (/qc).',
    'Đánh giá năng suất nhân sự khách quan qua bảng xếp hạng Hiệu suất KPI (/kpi) và kiểm toán bảo mật qua Nhật ký hoạt động (/audit) với bảng đối chiếu dữ liệu trước và sau (Before / After Diff).',
    'Thiết lập và chuẩn hóa cấu hình hệ thống toàn chuỗi: Quản lý Chi nhánh (/branches), Tài khoản & Phân quyền 5 vai trò cửa hàng (/users), Thương hiệu & Mẫu in K80/A4 kèm VietQR SePay & Telegram Bot AI (/branding), và Gói cước & Bản quyền (/subscription).',
  ],
  modules: [
    {
      id: 'dashboard',
      label: 'Tổng quan',
      href: '/dashboard',
      group: 'WORKSPACE',
      summary:
        'Trung tâm điều hành chiến lược toàn chuỗi (AdminDashboardView): tổng hợp thời gian thực biểu đồ Doanh thu thực thu, Giá vốn linh kiện (COGS), Lợi nhuận ròng, Công nợ chưa thu, lưu lượng đơn sửa chữa theo trạng thái FSM và các cảnh báo vận hành đa chi nhánh.',
      subSections: [
        {
          title: '1. Thẻ Chỉ số Tài chính & Công thức Lợi nhuận Ròng Toàn chuỗi',
          badge: 'Revenue · COGS · Net Profit',
          badgeType: 'ready',
          description:
            'Hiển thị minh bạch Doanh thu thực thu, Giá vốn linh kiện (COGS), Chi phí vận hành, Hoàn tiền và Lợi nhuận ròng theo bộ lọc thời gian (Hôm nay, 7 ngày, Tháng này) và phạm vi chi nhánh đang chọn trên Sidebar.',
        },
        {
          title: '2. Cảnh báo Điểm nghẽn Vận hành & Ca trực Chi nhánh',
          badge: 'Cảnh báo SLA & Tồn kho',
          badgeType: 'wait',
          description:
            'Cảnh báo tức thì số lượng đơn quá hạn SLA, đơn đang chờ linh kiện (waiting_parts), đơn chờ QC (waiting_qc), mã SKU chạm ngưỡng tồn kho tối thiểu và trạng thái mở/đóng ca trực tại từng cơ sở.',
        },
      ],
      keyActions: [
        'Sử dụng Bộ chọn Chi nhánh trên Sidebar để chuyển đổi góc nhìn giữa Tất cả chi nhánh (ALL) và từng cơ sở riêng lẻ.',
        'Theo dõi biểu đồ xu hướng Doanh thu thực thu đối chiếu với Giá vốn linh kiện (COGS) và Lợi nhuận ròng.',
        'Rà soát nhanh các thẻ cảnh báo đơn tồn đọng, công nợ chưa thu và linh kiện chạm ngưỡng cảnh báo để chỉ đạo kịp thời.',
      ],
    },
    {
      id: 'repairs',
      label: 'Đơn sửa chữa',
      href: '/repairs',
      group: 'WORKSPACE',
      summary:
        'Giám sát toàn bộ đơn sửa chữa trên mọi chi nhánh, cấp quyền can thiệp chỉnh sửa toàn diện đơn hàng (AdminEditOrderModal), điều chỉnh giá bán/chiết khấu, duyệt mua linh kiện đặc biệt (fulfillSpecialPart), thực hiện hoàn tiền (RefundModal) và xử lý các ngoại lệ trạng thái FSM.',
      subSections: [
        {
          title: '1. Quyền Can thiệp Chỉnh sửa Toàn diện Đơn hàng (AdminEditOrderModal)',
          badge: 'Can thiệp Quản trị',
          badgeType: 'progress',
          description:
            'Cho phép Admin chỉnh sửa thông tin thiết bị, hạng mục dịch vụ sửa chữa, đơn giá, chiết khấu ngoại lệ, kỹ thuật viên phụ trách hoặc ghi chú nội bộ ngay cả khi đơn đã qua bước báo giá; mọi thay đổi đều tự động ghi vết vào Nhật ký hoạt động (/audit).',
        },
        {
          title: '2. Phê duyệt Linh kiện Đặc biệt (fulfillSpecialPart) & Hoàn tiền (RefundModal)',
          badge: 'Xử lý Ngoại lệ & Refund',
          badgeType: 'wait',
          description:
            'Hỗ trợ duyệt nhanh yêu cầu mua linh kiện đặc biệt để giải phóng đơn Chờ linh kiện (waiting_parts -> in_repair) và phê duyệt hoàn tiền một phần hoặc toàn phần cho khách hàng kèm tự động hoàn kho linh kiện.',
        },
      ],
      keyActions: [
        'Tra cứu, lọc và giám sát toàn bộ đơn sửa chữa theo chi nhánh, trạng thái FSM, trạng thái thanh toán hoặc kỹ thuật viên.',
        'Mở AdminEditOrderModal để điều chỉnh dịch vụ, giá bán, chiết khấu hoặc thông tin đơn hàng trong các trường hợp đặc biệt.',
        'Thực hiện hoàn tiền khách hàng (RefundModal) hoặc can thiệp xử lý các đơn hàng bị kẹt trạng thái giữa các bộ phận.',
      ],
    },
    {
      id: 'customers',
      label: 'Khách hàng',
      href: '/customers',
      group: 'WORKSPACE',
      summary:
        'Quản trị cơ sở dữ liệu khách hàng hợp nhất toàn chuỗi (tenant_id), phân tích giá trị vòng đời khách hàng (LTV — Lifetime Value), tần suất quay lại sử dụng dịch vụ và lịch sử giao dịch xuyên suốt các chi nhánh.',
      subSections: [
        {
          title: 'Hồ sơ Khách hàng Toàn chuỗi & Phân tích Giá trị Vòng đời (LTV)',
          badge: 'Dữ liệu Hợp nhất Tenant',
          badgeType: 'ready',
          description:
            'Tập hợp toàn bộ lịch sử thiết bị Apple đã sửa, tổng chi tiêu tích lũy, số lần bảo hành và ghi chú chăm sóc khách hàng từ mọi chi nhánh trong cùng chuỗi cửa hàng.',
        },
      ],
      keyActions: [
        'Tra cứu khách hàng theo Số điện thoại hoặc Tên chuẩn hóa Unicode trên phạm vi toàn chuỗi cửa hàng.',
        'Phân tích nhóm khách hàng thân thiết có tổng chi tiêu (LTV) cao để xây dựng chính sách ưu đãi và chăm sóc hậu mãi.',
        'Kiểm tra lịch sử đơn sửa chữa, lịch sử thanh toán và lịch sử bảo hành gắn liền với từng hồ sơ khách hàng.',
      ],
    },
    {
      id: 'timeline',
      label: 'Timeline',
      href: '/timeline',
      group: 'WORKSPACE',
      summary:
        'Giám sát dòng chảy sự kiện vận hành theo thời gian thực xuyên suốt các chi nhánh để phát hiện sớm điểm nghẽn (bottleneck) giữa khâu Tiếp nhận CSKH, Bàn Kỹ thuật, Kiểm định QC và Thu ngân trả máy.',
      keyActions: [
        'Theo dõi trực quan luồng chuyển dịch trạng thái đơn hàng theo từng mốc giờ trong ngày trên toàn hệ thống.',
        'Phát hiện nhanh khâu đang bị ứ đọng (ví dụ: nhiều đơn chờ kỹ thuật nhận máy hoặc chờ QC nghiệm thu quá lâu).',
        'Đối chiếu thời gian xử lý thực tế tại từng công đoạn so với cam kết SLA của cửa hàng.',
      ],
    },
    {
      id: 'tech',
      label: 'Không gian Kỹ thuật',
      href: '/tech',
      group: 'VẬN HÀNH',
      summary:
        'Giám sát trực tiếp tải công việc tại các bàn kỹ thuật của từng chi nhánh, điều phối hoặc gán lại Kỹ thuật viên phụ trách (reassign) khi quá tải, và theo dõi tiến độ xử lý các ca bệnh khó hoặc đơn yêu cầu làm lại (rework_needed).',
      keyActions: [
        'Quan sát Hàng đợi chờ sửa (Chờ kỹ thuật) và Bàn làm việc đang sửa để cân bằng tải giữa các Kỹ thuật viên.',
        'Thực hiện điều phối / gán lại Kỹ thuật viên (reassign) khi có nhân sự nghỉ đột xuất hoặc cần chuyên gia xử lý ca phức tạp.',
        'Kiểm tra chi tiết ghi chú chẩn đoán kỹ thuật, danh mục linh kiện bóc tách (parts_used) và các yêu cầu linh kiện đặc biệt.',
      ],
    },
    {
      id: 'qc',
      label: 'Kiểm định QC',
      href: '/qc',
      group: 'VẬN HÀNH',
      summary:
        'Giám sát chất lượng đầu ra trước khi trả máy cho khách, theo dõi tỉ lệ đạt chuẩn ngay lần đầu (First-Time Pass Rate), phân tích nguyên nhân các ca bị trả về sửa lại (rework_needed) và hỗ trợ nghiệm thu QC khi cần thiết.',
      keyActions: [
        'Theo dõi danh sách đơn đang ở trạng thái Chờ QC (waiting_qc) và tốc độ nghiệm thu của bộ phận Kiểm định chất lượng.',
        'Kiểm tra tỷ lệ QC Đạt (ready_for_return) so với QC Không đạt (rework_needed) để đánh giá tay nghề kỹ thuật viên.',
        'Trực tiếp thực hiện kiểm định và duyệt kết quả QC trong trường hợp chi nhánh cần hỗ trợ giải phóng hàng đợi giờ cao điểm.',
      ],
    },
    {
      id: 'warranty',
      label: 'Bảo hành',
      href: '/warranty',
      group: 'VẬN HÀNH',
      summary:
        'Quản lý sổ bảo hành điện tử toàn chuỗi, kiểm soát tỉ lệ máy quay lại bảo hành (Warranty Claim Rate), thời hạn bảo hành theo từng hạng mục linh kiện/dịch vụ và phân tích nguyên nhân lỗi tái phát.',
      keyActions: [
        'Tra cứu trạng thái bảo hành điện tử theo Mã đơn hàng, Số điện thoại khách hàng hoặc Số Serial thiết bị trên toàn chuỗi.',
        'Theo dõi danh sách các đơn bảo hành (is_warranty_order / rework) để kiểm soát chi phí vật tư phát sinh sau bán hàng.',
        'Phân tích thống kê nguyên nhân lỗi bảo hành theo dòng máy hoặc lô linh kiện để làm việc với Nhà cung cấp và Kỹ thuật viên.',
      ],
    },
    {
      id: 'branches',
      label: 'Quản lý Chi nhánh',
      href: '/branches',
      group: 'HỆ THỐNG',
      summary:
        'Thiết lập và quản lý danh sách các chi nhánh / cơ sở trực thuộc chuỗi cửa hàng (trong hạn mức gói cước SaaS), cấu hình mã chi nhánh, địa chỉ, số điện thoại hotline và trạng thái hoạt động của từng điểm.',
      keyActions: [
        'Khởi tạo chi nhánh mới khi mở rộng quy mô chuỗi cửa hàng và thiết lập mã định danh chi nhánh (ví dụ: Q1, Q3, THUDUC).',
        'Cập nhật thông tin địa chỉ, hotline tiếp nhận và người quản lý phụ trách của từng cơ sở để hiển thị chuẩn trên mẫu phiếu in.',
        'Quản lý trạng thái hoạt động (Đang hoạt động / Tạm ngưng) của từng chi nhánh trong hệ thống.',
      ],
    },
    {
      id: 'branding',
      label: 'Thương hiệu & Mẫu in',
      href: '/branding',
      group: 'HỆ THỐNG',
      summary:
        'Cấu hình bộ nhận diện thương hiệu cửa hàng (Logo, tên thương hiệu, điều khoản bảo hành), tùy biến mẫu in phiếu nhiệt K80 / A4 2 liên, thiết lập tài khoản ngân hàng nhận thanh toán tự động VietQR SePay và kết nối Telegram Bot nhận thông báo & Trợ lý AI báo cáo nhanh.',
      subSections: [
        {
          title: '1. Nhận diện Thương hiệu & Tùy biến Mẫu in Phiếu Nhiệt K80 / A4 2 Liên',
          badge: 'Logo & Print Templates',
          badgeType: 'ready',
          description:
            'Cấu hình tên cửa hàng, logo, slogan, chính sách cam kết bảo hành và bố cục hiển thị trên Phiếu tiếp nhận / Phiếu trả máy khổ K80 hoặc khổ A4 2 liên.',
        },
        {
          title: '2. Tích hợp Ngân hàng Động VietQR SePay & Webhook Khớp lệnh Tự động',
          badge: 'VietQR SePay Auto-Match',
          badgeType: 'progress',
          description:
            'Thiết lập tài khoản ngân hàng thụ hưởng và cấu hình kết nối SePay để sinh mã QR động theo đúng số tiền từng đơn sửa chữa, tự động xác nhận thanh toán tức thì khi khách chuyển khoản.',
        },
        {
          title: '3. Kết nối Telegram Bot Thông báo Thời gian thực & Trợ lý AI Báo cáo Nhanh',
          badge: 'Telegram Bot & AI Assistant',
          badgeType: 'new',
          description:
            'Liên kết Bot Token / Chat ID Telegram của chủ cửa hàng để nhận cảnh báo tức thì khi có đơn mới, chốt ca, hoàn tiền hoặc biến động bất thường, đồng thời hỗ trợ chat hỏi đáp Trợ lý AI tổng hợp nhanh doanh thu và tình hình vận hành trong ngày.',
        },
      ],
      keyActions: [
        'Tải lên Logo thương hiệu, cập nhật tên cửa hàng, hotline tổng đài và nội dung điều khoản bảo hành in trên phiếu.',
        'Xem trước (Preview) và tùy chỉnh mẫu phiếu in nhiệt K80 / phiếu A4 2 liên đồng bộ cho toàn bộ quầy Lễ tân CSKH.',
        'Cấu hình thông tin tài khoản ngân hàng nhận tiền VietQR SePay để kích hoạt luồng quét QR gạch nợ tự động.',
        'Cấu hình kết nối Telegram Bot nhận thông báo vận hành thời gian thực và kích hoạt Trợ lý AI báo cáo nhanh qua Telegram.',
      ],
    },
    {
      id: 'users',
      label: 'Tài khoản & Phân quyền',
      href: '/users',
      group: 'HỆ THỐNG',
      summary:
        'Quản lý danh sách nhân sự toàn chuỗi, cấp phát tài khoản theo đúng 5 vai trò cấp cửa hàng (admin, cskh, tech/technician, qc, inventory), gán chi nhánh làm việc cố định (branch_id) và khóa/mở khóa quyền truy cập tức thì.',
      subSections: [
        {
          title: 'Ma trận Phân quyền 5 Vai trò Cửa hàng & Gán Chi nhánh (branch_id)',
          badge: 'RBAC 5 Roles · Branch Scope',
          badgeType: 'ready',
          description:
            'Đảm bảo mỗi nhân sự chỉ truy cập đúng các module thuộc phận sự chuyên môn (ví dụ: Kỹ thuật viên chỉ vào /tech và ẩn 100% giá tiền; Thủ kho chỉ quản lý kho tại branch_id được giao).',
        },
      ],
      keyActions: [
        'Tạo mới tài khoản nhân viên, chỉ định vai trò chuẩn (cskh, tech, qc, inventory, admin) và gán chi nhánh làm việc (branch_id).',
        'Luân chuyển nhân sự giữa các chi nhánh hoặc điều chỉnh vai trò khi thay đổi vị trí công tác.',
        'Khóa (Deactivate) tài khoản tức thì khi nhân viên nghỉ việc để thu hồi toàn bộ phiên đăng nhập và bảo vệ dữ liệu cửa hàng.',
      ],
    },
    {
      id: 'payments',
      label: 'Lịch sử Thanh toán',
      href: '/payments',
      group: 'HỆ THỐNG',
      summary:
        'Đối soát tập trung toàn bộ dòng tiền thu vào trên mọi chi nhánh (Tiền mặt tại quầy, Chuyển khoản động VietQR SePay tự động khớp lệnh qua Webhook, COD đối tác vận chuyển) và thực hiện nghiệp vụ Hoàn tiền khách hàng (RefundModal).',
      subSections: [
        {
          title: 'Đối soát Dòng tiền Đa kênh (Cash · VietQR SePay · COD) & Hoàn tiền (RefundModal)',
          badge: 'Đối soát & Hoàn tiền',
          badgeType: 'ready',
          description:
            'Theo dõi chi tiết từng giao dịch thanh toán gắn với mã đơn sửa chữa, mã tham chiếu ngân hàng SePay, nhân viên thu ngân và thực hiện hoàn tiền có kiểm soát.',
        },
      ],
      keyActions: [
        'Lọc và đối soát lịch sử giao dịch theo phương thức thanh toán (Tiền mặt, Chuyển khoản SePay, COD), chi nhánh và khoảng thời gian.',
        'Kiểm tra trạng thái khớp lệnh tự động của các giao dịch quét mã động VietQR SePay và đối chiếu sao kê ngân hàng.',
        'Thực hiện hoặc phê duyệt giao dịch Hoàn tiền (RefundModal) kèm ghi nhận lý do, tự động khấu trừ doanh thu thực thu và hoàn kho linh kiện.',
      ],
    },
    {
      id: 'shifts',
      label: 'Sổ quỹ & Ca trực',
      href: '/shifts',
      group: 'HỆ THỐNG',
      summary:
        'Kiểm toán sổ quỹ tiền mặt của mọi chi nhánh, đối chiếu Tiền đầu ca, Tổng thu tiền mặt, Tổng phiếu chi vận hành, Tiền mặt thực đếm khi chốt ca, phát hiện chênh lệch thừa/thiếu (cash_discrepancy) và quyền đóng hộ ca trực khi nhân viên quên kết ca.',
      subSections: [
        {
          title: 'Kiểm toán Chênh lệch Quỹ Tiền mặt (cash_discrepancy) & Đóng hộ Ca trực',
          badge: 'Kiểm soát Sổ quỹ',
          badgeType: 'wait',
          description:
            'Tự động làm nổi bật các biên bản kết ca có số tiền thực đếm lệch so với số dư lý thuyết trên phần mềm, đồng thời cho phép Admin can thiệp đóng hộ ca trực bị treo qua ngày.',
        },
      ],
      keyActions: [
        'Giám sát trạng thái ca trực đang mở và lịch sử biên bản chốt ca của toàn bộ các chi nhánh trong chuỗi.',
        'Kiểm tra chi tiết các khoản Phiếu thu / Phiếu chi vận hành nội bộ phát sinh trong từng ca làm việc.',
        'Xác minh nguyên nhân các ca có chênh lệch tiền mặt (cash_discrepancy) và sử dụng quyền đóng hộ ca trực khi lễ tân quên chốt ca cuối ngày.',
      ],
    },
    {
      id: 'subscription',
      label: 'Gói cước & Bản quyền',
      href: '/subscription',
      group: 'HỆ THỐNG',
      summary:
        'Theo dõi thông tin gói cước SaaS cửa hàng đang sử dụng (Trial, Standard, Pro, Enterprise), kiểm soát hạn mức số lượng chi nhánh/tài khoản nhân sự/tính năng nâng cao và thực hiện gia hạn hoặc nâng cấp tự động qua cổng VietQR SePay.',
      keyActions: [
        'Kiểm tra thời hạn sử dụng bản quyền còn lại và tỷ lệ sử dụng hạn mức (số chi nhánh hiện tại / tối đa, số nhân sự hiện tại / tối đa).',
        'Chọn gói cước nâng cấp hoặc chu kỳ gia hạn và quét mã thanh toán VietQR SePay để hệ thống tự động kích hoạt bản quyền tức thì.',
        'Tra cứu lịch sử hóa đơn thanh toán bản quyền SaaS của cửa hàng.',
      ],
    },
    {
      id: 'kpi',
      label: 'Hiệu suất KPI',
      href: '/kpi',
      group: 'HỆ THỐNG',
      summary:
        'Bảng xếp hạng năng suất nhân sự minh bạch theo dữ liệu thực tế cho Kỹ thuật viên (số máy hoàn thành, thời gian sửa trung bình, tỉ lệ quay lại bảo hành/rework), Lễ tân CSKH (số đơn tiếp nhận, tỷ lệ chốt báo giá, doanh thu thu về) và Kiểm định viên QC.',
      keyActions: [
        'Xem bảng xếp hạng và chỉ số KPI chi tiết của từng Kỹ thuật viên, Lễ tân CSKH và QC theo kỳ đánh giá (Tuần / Tháng / Quý).',
        'Phân tích tương quan giữa Số lượng đơn hoàn thành và Tỷ lệ phải làm lại (Rework / Warranty Rate) để đánh giá chất lượng thực chất.',
        'Sử dụng số liệu KPI khách quan từ hệ thống làm cơ sở tính lương thưởng, hoa hồng và điều chỉnh định biên nhân sự.',
      ],
    },
    {
      id: 'audit',
      label: 'Nhật ký hoạt động',
      href: '/audit',
      group: 'HỆ THỐNG',
      summary:
        'Hộp đen kiểm toán bảo mật (Immutable Audit Log) ghi vết bất biến mọi thao tác nhạy cảm trên toàn hệ thống (chỉnh sửa giá đơn hàng, xóa dịch vụ, hoàn tiền, điều chỉnh tồn kho, đóng hộ ca, thay đổi phân quyền) kèm bảng đối chiếu dữ liệu trước và sau (Before / After Diff).',
      subSections: [
        {
          title: 'Bảng Đối chiếu Dữ liệu Trước & Sau (Before / After Diff Inspector)',
          badge: 'Immutable Audit Trail',
          badgeType: 'danger',
          description:
            'Hiển thị song song giá trị Cũ (Before) và giá trị Mới (After) của từng trường dữ liệu bị thay đổi, gắn liền với định danh tài khoản thực hiện, vai trò, chi nhánh, địa chỉ IP và dấu thời gian chính xác tới từng giây.',
        },
      ],
      keyActions: [
        'Tra cứu lịch sử hoạt động theo loại sự kiện nhạy cảm (Sửa đơn hàng, Hoàn tiền, Điều chỉnh kho, Thay đổi nhân sự), theo chi nhánh hoặc theo nhân viên.',
        'Mở chi tiết bản ghi Audit Log để đối chiếu trực tiếp bảng Before / After Diff nhằm phát hiện gian lận hoặc sai sót nghiệp vụ.',
        'Đảm bảo tính minh bạch và trách nhiệm giải trình tuyệt đối vì không một tài khoản nào (kể cả Admin) có thể xóa hoặc sửa lịch sử Audit Log.',
      ],
    },
  ],
  dailyWorkflow: [
    {
      step: 1,
      title: 'Bước 01: Chuyển đổi phạm vi giám sát đa chi nhánh & Rà soát chỉ số Sức khỏe Vận hành',
      moduleLabel: 'Bộ chọn Chi nhánh Sidebar & Tổng quan (/dashboard)',
      moduleHref: '/dashboard',
      statusTransition: {
        from: 'Bắt đầu ngày làm việc',
        to: 'Giám sát Toàn chuỗi (ALL) / Từng cơ sở',
        statusType: 'ready',
      },
      description:
        'Mở đầu ngày làm việc, Quản trị viên sử dụng Bộ chuyển đổi Chi nhánh ở phía trên thanh điều hướng Sidebar để chọn góc nhìn "Tất cả chi nhánh" (ALL) hoặc đi sâu vào từng cơ sở cụ thể, sau đó rà soát toàn diện các chỉ số sức khỏe vận hành trên Tổng quan (/dashboard).',
      checkpoints: [
        'Kiểm tra trạng thái mở ca đầu ngày của các quầy Lễ tân CSKH tại từng chi nhánh và lưu lượng đơn đang tiếp nhận mới.',
        'Rà soát nhanh các thẻ cảnh báo đỏ/vàng: số đơn quá hạn SLA, số đơn đang Chờ linh kiện (waiting_parts), số đơn Chờ QC (waiting_qc) và cảnh báo linh kiện chạm ngưỡng tồn tối thiểu.',
      ],
      handoverTo: 'Xác định cơ sở hoặc bộ phận cần ưu tiên điều phối nguồn lực trong ngày.',
    },
    {
      step: 2,
      title: 'Bước 02: Đối soát Tài chính minh bạch theo công thức Lợi nhuận ròng & Kiểm tra dòng tiền VietQR SePay',
      moduleLabel: 'Tổng quan (/dashboard) & Lịch sử Thanh toán (/payments)',
      moduleHref: '/payments',
      statusTransition: {
        from: 'Phát sinh giao dịch thu/chi/hoàn',
        to: 'Đối soát Lợi nhuận ròng & SePay',
        statusType: 'ready',
      },
      description:
        'Thực hiện đối soát bức tranh tài chính toàn chuỗi theo đúng công thức chuẩn: Doanh thu thực thu - Giá vốn linh kiện (COGS) - Chi phí vận hành - Hoàn tiền = Lợi nhuận ròng, đồng thời kiểm tra chi tiết dòng tiền tại /payments.',
      checkpoints: [
        'Đối chiếu Doanh thu thực thu (tiền mặt + chuyển khoản đã xác nhận) với Giá vốn linh kiện xuất kho tự động (COGS) để kiểm soát biên lợi nhuận gộp.',
        'Truy cập /payments kiểm tra danh sách giao dịch chuyển khoản động VietQR SePay đã khớp lệnh tự động qua Webhook, các khoản thu COD đối tác và các giao dịch Hoàn tiền (RefundModal) phát sinh.',
      ],
      handoverTo: 'Chuyển sang kiểm toán sổ quỹ tiền mặt thực tế tại từng ca trực chi nhánh.',
    },
    {
      step: 3,
      title: 'Bước 03: Kiểm toán Sổ quỹ & Ca trực giữa các cơ sở — Xử lý chênh lệch tiền mặt (cash_discrepancy)',
      moduleLabel: 'Sổ quỹ & Ca trực (/shifts)',
      moduleHref: '/shifts',
      statusTransition: {
        from: 'Các chi nhánh giao ca / chốt ca',
        to: 'Kiểm toán Sổ quỹ & Xử lý cash_discrepancy',
        statusType: 'wait',
      },
      description:
        'Truy cập module Sổ quỹ & Ca trực (/shifts) để kiểm toán biên bản mở/đóng ca của tất cả các cơ sở, rà soát các phiếu chi vận hành nội bộ và xử lý ngay các ca trực có cảnh báo chênh lệch tiền mặt thực đếm (cash_discrepancy).',
      checkpoints: [
        'Kiểm tra công thức quỹ tiền mặt từng ca: Tiền mặt đầu ca + Thu tiền mặt đơn hàng + Phiếu thu ngoài - Phiếu chi vận hành - Hoàn tiền mặt = Tiền mặt lý thuyết cuối ca.',
        'Đối với các ca có chênh lệch thừa/thiếu (cash_discrepancy != 0), đọc giải trình của CSKH và đối chiếu chứng từ phiếu chi/hoàn tiền.',
        'Sử dụng tính năng Đóng hộ ca trực (Force Close Shift) nếu phát hiện nhân viên lễ tân quên kết ca vào cuối ngày.',
      ],
      handoverTo: 'Đảm bảo kỷ luật tiền mặt tại quầy minh bạch 100% trước khi sang kỳ kế toán tiếp theo.',
    },
    {
      step: 4,
      title: 'Bước 04: Điều phối điểm nghẽn vận hành liên bộ phận & Can thiệp xử lý đơn ngoại lệ (AdminEditOrderModal)',
      moduleLabel: 'Đơn sửa chữa (/repairs), Kỹ thuật (/tech) & Kiểm định QC (/qc)',
      moduleHref: '/repairs',
      statusTransition: {
        from: 'Điểm nghẽn SLA / Yêu cầu ngoại lệ',
        to: 'Giải phóng hàng đợi & Xử lý ngoại lệ',
        statusType: 'progress',
      },
      description:
        'Theo dõi tiến độ luân chuyển máy qua /timeline, /repairs, /tech và /qc để điều phối nhân sự khi quá tải, phê duyệt cung ứng linh kiện đặc biệt hoặc trực tiếp can thiệp chỉnh sửa đơn hàng ngoại lệ.',
      checkpoints: [
        'Tại /tech và /qc: Gán lại Kỹ thuật viên (reassign) cho các đơn chờ quá lâu hoặc hỗ trợ kiểm duyệt các ca Rework phức tạp.',
        'Tại /repairs: Phê duyệt mua linh kiện đặc biệt (fulfillSpecialPart) phối hợp cùng Thủ kho để giải phóng đơn Chờ linh kiện (waiting_parts -> in_repair).',
        'Khi khách hàng đổi ý hoặc cần áp dụng chiết khấu/điều chỉnh giá đặc biệt sau báo giá, sử dụng AdminEditOrderModal để cập nhật đơn hàng an toàn.',
      ],
      handoverTo: 'Duy trì nhịp độ vận hành thông suốt từ khâu Tiếp nhận tới khâu Trả máy.',
    },
    {
      step: 5,
      title: 'Bước 05: Đánh giá Hiệu suất nhân sự (KPI) & Kiểm toán Nhật ký hoạt động (Before / After Diff) cuối ngày',
      moduleLabel: 'Hiệu suất KPI (/kpi) & Nhật ký hoạt động (/audit)',
      moduleHref: '/audit',
      statusTransition: {
        from: 'Cuối ngày làm việc',
        to: 'Hoàn tất Đánh giá KPI & Kiểm toán Bảo mật',
        statusType: 'new',
      },
      description:
        'Cuối ngày hoặc cuối tuần, Quản trị viên đánh giá năng suất làm việc của đội ngũ tại /kpi và rà soát hộp đen bảo mật /audit thông qua bảng đối chiếu Before / After Diff.',
      checkpoints: [
        'Tại /kpi: Xem bảng xếp hạng số máy sửa xong, thời gian xử lý trung bình, tỷ lệ QC đạt lần đầu (First-Time Pass Rate) và doanh thu tiếp nhận của từng nhân viên.',
        'Tại /audit: Lọc các thao tác nhạy cảm trong ngày (chỉnh sửa giá đơn hàng, xóa dịch vụ, hoàn tiền, điều chỉnh kho) và mở bảng Before / After Diff để xác minh tính hợp lệ.',
      ],
      handoverTo: 'Củng cố kỷ luật vận hành và khen thưởng nhân sự dựa trên dữ liệu minh bạch.',
    },
    {
      step: 6,
      title: 'Bước 06: Quản trị cấu hình Hệ thống (Chi nhánh, Nhân sự, Thương hiệu, Mẫu in, VietQR & Telegram Bot AI)',
      moduleLabel: 'Chi nhánh (/branches), Nhân sự (/users), Thương hiệu (/branding) & Gói cước (/subscription)',
      moduleHref: '/branding',
      statusTransition: {
        from: 'Mở rộng quy mô / Cập nhật chính sách',
        to: 'Đồng bộ Cấu hình Toàn chuỗi',
        statusType: 'ready',
      },
      description:
        'Định kỳ rà soát và cập nhật các thiết lập nền tảng của chuỗi cửa hàng tại nhóm module HỆ THỐNG để đảm bảo nhận diện thương hiệu, phân quyền nhân sự và kết nối tự động hóa luôn hoạt động ổn định.',
      checkpoints: [
        'Quản lý danh sách cơ sở tại /branches và phân quyền tài khoản nhân sự theo đúng 5 vai trò cửa hàng gắn với branch_id tại /users.',
        'Cập nhật mẫu in phiếu nhiệt K80 / A4, tài khoản nhận tiền tự động VietQR SePay và cấu hình Telegram Bot nhận thông báo + Trợ lý AI báo cáo nhanh tại /branding.',
        'Theo dõi hạn mức chi nhánh/nhân sự và gia hạn bản quyền kịp thời tại Gói cước & Bản quyền (/subscription).',
      ],
      handoverTo: 'Hệ thống sẵn sàng vận hành ổn định, bảo mật và tự động hóa cho toàn chuỗi.',
    },
  ],
  specialScenarios: [
    {
      id: 'admin-edit-order-intervention',
      title: '1. Can thiệp chỉnh sửa thông tin đơn hàng, giá dịch vụ hoặc chiết khấu ngoại lệ (AdminEditOrderModal) & Tự động ghi vết Audit Log',
      trigger:
        'Khi đơn sửa chữa đã qua bước báo giá hoặc đang xử lý nhưng phát sinh yêu cầu thay đổi hạng mục dịch vụ, áp dụng chiết khấu đặc biệt của chủ cửa hàng, hoặc điều chỉnh sai sót thông tin tiếp nhận.',
      statusLabel: 'Can thiệp Quản trị (AdminEditOrderModal)',
      statusType: 'progress',
      resolutionSteps: [
        'Truy cập module Đơn sửa chữa (/repairs), mở chi tiết đơn hàng cần can thiệp và nhấn nút Chỉnh sửa đơn dành riêng cho Quản trị viên (AdminEditOrderModal).',
        'Thực hiện điều chỉnh các trường được phép: danh sách dịch vụ sửa chữa, đơn giá từng hạng mục, mức giảm giá/chiết khấu ngoại lệ, kỹ thuật viên phụ trách hoặc ghi chú quản trị.',
        'Khi bấm Lưu thay đổi, hệ thống tự động tính toán lại Tổng tiền phải thu (total_amount), cập nhật số dư còn phải thanh toán và ngay lập tức ghi một bản ghi bất biến vào Nhật ký hoạt động (/audit) kèm bảng so sánh giá trị Cũ (Before) và Mới (After).',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) -> Nhật ký hoạt động (/audit)',
    },
    {
      id: 'admin-refund-approval-workflow',
      title: '2. Phê duyệt Hoàn tiền khách hàng (RefundModal) — Tự động hoàn kho linh kiện (return_refund), ghi phiếu chi sổ quỹ & cập nhật Lợi nhuận ròng',
      trigger:
        'Khi phát sinh khiếu nại sau sửa chữa không thể khắc phục, khách hủy dịch vụ sau khi đã đặt cọc/thanh toán, hoặc cửa hàng thực hiện chính sách hoàn tiền bảo hành tại /payments hoặc /repairs.',
      statusLabel: 'Hoàn tiền & Đồng bộ 4 Chiều (RefundModal)',
      statusType: 'wait',
      resolutionSteps: [
        'Mở chi tiết đơn hàng tại /repairs hoặc giao dịch tại /payments, khởi chạy cửa sổ Hoàn tiền (RefundModal) và nhập số tiền hoàn trả (toàn phần hoặc một phần), phương thức hoàn tiền và lý do bắt buộc.',
        'Đồng bộ Kho tự động: Nếu chọn thu hồi linh kiện đã lắp, hệ thống tự động cộng trả số lượng vào tồn kho chi nhánh và sinh bút toán Thẻ kho loại Hoàn trả linh kiện (return_refund).',
        'Đồng bộ Sổ quỹ & Tài chính tự động: Hệ thống tự động tạo bút toán hoàn tiền tại /payments, ghi nhận khoản chi hoàn tiền vào ca trực hiện tại ở /shifts (nếu hoàn tiền mặt) và khấu trừ trực tiếp vào công thức Lợi nhuận ròng trên /dashboard.',
        'Đồng bộ Kiểm toán: Toàn bộ thông tin người duyệt hoàn tiền, số tiền và lý do được ghi vết vĩnh viễn tại Nhật ký hoạt động (/audit).',
      ],
      relatedModule: 'Lịch sử Thanh toán (/payments) <-> Đơn sửa chữa (/repairs) <-> Kho (/inventory) <-> Sổ quỹ (/shifts)',
    },
    {
      id: 'admin-fraud-investigation-audit-diff',
      title: '3. Tra cứu & Điều tra gian lận qua bảng đối chiếu Before / After Diff tại Nhật ký hoạt động (/audit)',
      trigger:
        'Khi phát hiện dấu hiệu bất thường như đơn hàng bị giảm giá đột ngột trước khi thu tiền, số lượng tồn kho bị điều chỉnh giảm không rõ nguyên nhân, hoặc biên bản chốt ca tại /shifts báo lệch quỹ tiền mặt (cash_discrepancy).',
      statusLabel: 'Điều tra Before / After Diff',
      statusType: 'danger',
      resolutionSteps: [
        'Truy cập module Nhật ký hoạt động (/audit), sử dụng bộ lọc theo Chi nhánh, Nhân sự thực hiện, Loại hành động (Order Updated, Refund Created, Stock Adjusted, Shift Closed) và khung giờ nghi vấn.',
        'Mở chi tiết bản ghi khả nghi để kiểm tra bảng đối chiếu Before / After Diff: xem chính xác trường dữ liệu nào đã bị sửa (ví dụ: total_amount từ 1.200.000đ xuống 600.000đ, hoặc quantity tồn kho từ 10 xuống 8).',
        'Đối chiếu chéo mã tham chiếu (order_code / shift_id) với Lịch sử Thanh toán (/payments) và Sổ quỹ & Ca trực (/shifts) để làm rõ trách nhiệm cá nhân bằng bằng chứng dữ liệu không thể chối cãi.',
      ],
      relatedModule: 'Nhật ký hoạt động (/audit) <-> Sổ quỹ & Ca trực (/shifts) <-> Lịch sử Thanh toán (/payments)',
    },
    {
      id: 'admin-new-branch-standardization',
      title: '4. Thiết lập Chuẩn hóa Hệ thống cho Chi nhánh mới (/branches -> /users -> /branding Mẫu in K80/A4, VietQR SePay & Telegram Bot AI)',
      trigger:
        'Khi cửa hàng khai trương thêm cơ sở mới trong chuỗi và cần đưa vào vận hành đồng bộ theo quy chuẩn FIXO Repair OS ngay trong ngày.',
      statusLabel: 'Chuẩn hóa Cơ sở Mới',
      statusType: 'ready',
      resolutionSteps: [
        'Bước 1 — Khởi tạo cơ sở tại /branches: Kiểm tra hạn mức chi nhánh tại /subscription, sau đó tạo mới chi nhánh với Mã định danh (code), Tên hiển thị, Địa chỉ và Số điện thoại hotline riêng.',
        'Bước 2 — Phân bổ nhân sự tại /users: Tạo tài khoản cho đội ngũ nhân viên của chi nhánh mới theo đúng 5 vai trò (cskh, tech, qc, inventory, admin) và gán cố định vào branch_id vừa tạo.',
        'Bước 3 — Chuẩn hóa Mẫu in, VietQR & Telegram AI tại /branding: Kiểm tra mẫu phiếu in nhiệt K80 / A4 2 liên tự động nhận thông tin chi nhánh mới, xác nhận cấu hình tài khoản ngân hàng VietQR SePay tự động khớp lệnh và bật kết nối Telegram Bot nhận thông báo & Trợ lý AI báo cáo nhanh cho chủ cửa hàng.',
      ],
      relatedModule: 'Quản lý Chi nhánh (/branches) -> Tài khoản & Phân quyền (/users) -> Thương hiệu & Mẫu in (/branding)',
    },
  ],
  rbacGuardrails: [
    {
      id: 'admin-tenant-scope-and-multi-branch-governance',
      ruleTitle: 'Toàn quyền Điều hành Đa Chi nhánh trong phạm vi Tenant (tenant_id) & Tách biệt hoàn toàn với Super Admin',
      policyCode: 'tenant-scope-and-multi-branch-governance',
      severity: 'strict',
      description:
        'Vai trò Quản trị viên (admin) có toàn quyền truy cập 15 module cửa hàng và chuyển đổi giám sát giữa tất cả các chi nhánh thuộc cùng chuỗi cửa hàng (tenant_id). Tuy nhiên, dữ liệu được cách ly nghiêm ngặt theo kiến trúc Multi-Tenant và tách biệt hoàn toàn với vai trò Quản trị nền tảng (super_admin tại /platform/* — vốn không sử dụng Trung tâm Hướng dẫn cấp cửa hàng này).',
      reason:
        'Đảm bảo chủ cửa hàng kiểm soát 100% mọi cơ sở trực thuộc thương hiệu của mình nhưng tuyệt đối không bị lẫn lộn dữ liệu giữa các chuỗi cửa hàng khác nhau trên nền tảng SaaS.',
    },
    {
      id: 'admin-full-financial-and-cogs-visibility',
      ruleTitle: 'Quyền Truy cập Độc quyền Giá vốn Linh kiện (COGS) & Công thức Lợi nhuận Ròng Toàn chuỗi',
      policyCode: 'full-financial-and-cogs-visibility',
      severity: 'strict',
      description:
        'Chỉ duy nhất vai trò Quản trị viên (admin) mới được quyền nhìn thấy bức tranh tài chính hợp nhất gồm: Doanh thu thực thu, Giá vốn linh kiện xuất kho (COGS), Chi phí vận hành ca trực, Hoàn tiền và Lợi nhuận ròng của toàn bộ các chi nhánh (trong khi Kỹ thuật viên và QC bị ẩn 100% dữ liệu tài chính, còn CSKH và Thủ kho chỉ được xem phần nghiệp vụ thu ngân hoặc giá nhập kho tại chi nhánh mình).',
      reason:
        'Bảo vệ tuyệt đối bí mật lợi nhuận ròng, cấu trúc biên lợi nhuận gộp và dòng tiền chiến lược của chủ doanh nghiệp.',
    },
    {
      id: 'admin-immutable-audit-trail-accountability',
      ruleTitle: 'Bắt buộc Ghi vết Kiểm toán Bất biến (Before / After Diff) cho mọi Thao tác Can thiệp của Admin',
      policyCode: 'immutable-audit-trail-accountability',
      severity: 'strict',
      description:
        'Mặc dù Admin có quyền cao nhất tại cửa hàng để chỉnh sửa đơn hàng (AdminEditOrderModal), duyệt hoàn tiền (RefundModal), đóng hộ ca trực hoặc thay đổi phân quyền nhân sự, mọi thao tác can thiệp này đều bị hệ thống tự động ghi vết vào Nhật ký hoạt động (/audit) kèm bảng đối chiếu Before / After Diff và không ai có quyền xóa hay chỉnh sửa lịch sử kiểm toán.',
      reason:
        'Duy trì tính toàn vẹn dữ liệu kế toán - vận hành và đảm bảo khả năng truy vết minh bạch ngay cả khi cửa hàng có nhiều đồng sáng lập hoặc quản lý cấp cao cùng sử dụng quyền Admin.',
    },
    {
      id: 'admin-strict-destructive-action-safeguards',
      ruleTitle: 'Kiểm soát Nghiêm ngặt Thao tác Nhạy cảm (Xóa đơn, Khóa nhân sự, Hoàn tiền & Đóng hộ ca trực)',
      policyCode: 'strict-destructive-action-safeguards',
      severity: 'warning',
      description:
        'Đối với các thao tác có ảnh hưởng trực tiếp tới dòng tiền và trạng thái vận hành như Hoàn tiền khách hàng, Đóng hộ ca trực đang mở, Khóa tài khoản nhân viên hoặc Hủy đơn sửa chữa đã phát sinh vật tư, hệ thống luôn yêu cầu bước xác nhận tường minh kèm lý do bắt buộc và tự động kích hoạt quy trình hoàn trả tồn kho / cân bằng sổ quỹ tương ứng.',
      reason:
        'Ngăn ngừa thao tác nhầm lẫn gây lệch số liệu liên thông giữa Đơn sửa chữa (/repairs), Tồn kho (/inventory) và Sổ quỹ tiền mặt (/shifts).',
    },
  ],
};

export default adminGuideData;
