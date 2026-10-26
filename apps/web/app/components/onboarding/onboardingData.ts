import {
  normalizeOnboardingRole,
  type OnboardingRoleConfig,
  type OnboardingStoreRoleKey,
  type SetupChecklistStep,
} from './types.ts';

export const ONBOARDING_ROLE_CONFIGS: Record<
  OnboardingStoreRoleKey,
  OnboardingRoleConfig
> = {
  admin: {
    roleKey: 'admin',
    roleLabel: 'Quản trị viên / Chủ cửa hàng',
    badgeText: 'TOÀN QUYỀN ĐIỀU HÀNH GIAN HÀNG · ĐA CHI NHÁNH',
    welcomeHeadline: 'Chào mừng Chủ cửa hàng đến với FIXO Repair OS',
    welcomeSummary:
      'Bạn nắm quyền điều hành toàn diện hệ thống cửa hàng: giám sát doanh thu và công nợ theo thời gian thực, chuyển đổi linh hoạt giữa các chi nhánh, phân quyền nhân sự 5 bộ phận và kiểm soát nhật ký kiểm toán.',
    primaryWorkspaceLabel: 'Trung tâm Điều hành (/dashboard)',
    primaryWorkspaceHref: '/dashboard',
    rbacSummary:
      'Toàn quyền truy cập 15 module điều hành cửa hàng, chuyển đổi phạm vi xem tất cả chi nhánh và quản trị thương hiệu phiếu in.',
    steps: [
      {
        stepNumber: 1,
        id: 'admin-step-1-dashboard',
        title: 'Giám sát Trung tâm Điều hành & Đối soát Doanh thu',
        subtitle: 'Nắm bắt sức khỏe tài chính và tiến độ xưởng trong một màn hình',
        spotlightArea: 'WORKSPACE · Tổng quan (/dashboard)',
        targetModuleId: 'dashboard',
        targetHref: '/dashboard',
        icon: 'dashboard',
        description:
          'Màn hình Tổng quan cung cấp 4 thẻ chỉ số tài chính trọng tâm (Tổng doanh thu, Đã thu thực tế, Chưa thu công nợ và Tổng quan ca trực) cùng danh sách các tác vụ khẩn cấp cần xử lý ngay.',
        actionPoints: [
          'Lọc số liệu theo Hôm nay, Hôm qua, 7 ngày, 30 ngày hoặc khoảng ngày tùy chỉnh.',
          'Nhấn vào từng thẻ chỉ số để mở bảng đối soát chi tiết từng đơn hàng (Drilldown Modal) và xuất báo cáo Excel.',
          'Theo dõi tiến độ Bảng kiểm Thiết lập Cửa hàng 5 bước ngay đầu trang Tổng quan.',
        ],
        handoverNote:
          'Phối hợp với Lễ tân/CSKH để đối soát chênh lệch tiền mặt cuối mỗi ca trực.',
        guardrailNote:
          'Chỉ Quản trị viên mới có quyền xem báo cáo tổng hợp xuyên suốt tất cả chi nhánh.',
      },
      {
        stepNumber: 2,
        id: 'admin-step-2-branches-users',
        title: 'Quản lý Đa Chi nhánh & Phân quyền Nhân sự RBAC',
        subtitle: 'Thiết lập cơ cấu tổ chức chuẩn hóa theo 5 vị trí vận hành',
        spotlightArea: 'HỆ THỐNG · Chi nhánh (/branches) & Tài khoản (/users)',
        targetModuleId: 'users',
        targetHref: '/users',
        icon: 'users',
        description:
          'Tạo lập các chi nhánh hoạt động độc lập và cấp tài khoản cho nhân sự theo đúng vai trò chuyên trách: Lễ tân CSKH, Kỹ thuật viên, Kiểm định QC và Thủ kho.',
        actionPoints: [
          'Sử dụng bộ chọn Chi nhánh trên đầu Sidebar để xem dữ liệu riêng từng cơ sở hoặc toàn hệ thống.',
          'Tạo tài khoản nhân viên gắn cố định với từng chi nhánh để đảm bảo cách ly dữ liệu vận hành.',
          'Tạm khóa hoặc kích hoạt lại tài khoản nhân sự tức thì khi có biến động nhân sự.',
        ],
        handoverNote:
          'Mỗi nhân sự khi đăng nhập lần đầu sẽ tự động nhận được luồng hướng dẫn riêng theo đúng vai trò được gán.',
        guardrailNote:
          'Nhân sự cấp chi nhánh bị khóa cố định tại cơ sở được phân công, không thể tự ý chuyển sang chi nhánh khác.',
      },
      {
        stepNumber: 3,
        id: 'admin-step-3-warranty-audit',
        title: 'Kiểm soát Bảo hành, Hoàn tiền & Nhật ký Kiểm toán',
        subtitle: 'Minh bạch hóa mọi thay đổi trạng thái và giao dịch nhạy cảm',
        spotlightArea: 'VẬN HÀNH & HỆ THỐNG · Bảo hành (/warranty) & Nhật ký (/audit)',
        targetModuleId: 'audit',
        targetHref: '/audit',
        icon: 'audit',
        description:
          'Mọi thao tác sửa giá, hoàn tiền bảo hành, thu hồi phiếu bảo hành hoặc chuyển trạng thái đơn hàng đều được lưu vết chi tiết (JSON Diff) trong Nhật ký hoạt động.',
        actionPoints: [
          'Tra cứu lịch sử bảo hành, tạo phiếu tiếp nhận bảo hành (Rework) hoặc xử lý hoàn tiền cho khách.',
          'Mở Nhật ký hoạt động (/audit) để đối chiếu giá trị cũ và giá trị mới của mọi thao tác nhạy cảm.',
          'Đánh giá năng suất làm việc của từng Kỹ thuật viên và CSKH tại module Hiệu suất KPI (/kpi).',
        ],
        handoverNote:
          'Dữ liệu kiểm toán được ghi nhận tự động từ mọi bộ phận trong suốt vòng đời đơn hàng.',
        guardrailNote:
          'Nhật ký kiểm toán là dữ liệu bất biến (Immutable Audit Trail), không thể chỉnh sửa hoặc xóa bỏ.',
      },
      {
        stepNumber: 4,
        id: 'admin-step-4-branding-saas',
        title: 'Cấu hình Thương hiệu Phiếu in & Thanh toán VietQR',
        subtitle: 'Đồng bộ nhận diện cửa hàng trên phiếu A4, K80 và mã QR thu tiền',
        spotlightArea: 'HỆ THỐNG · Thương hiệu & Mẫu in (/branding)',
        targetModuleId: 'branding',
        targetHref: '/branding',
        icon: 'spark',
        description:
          'Tải lên Logo riêng của cửa hàng, cấu hình Hotline, lời dặn chân trang phiếu in và tài khoản ngân hàng nhận tiền để sinh mã VietQR động tự động trên từng đơn sửa chữa.',
        actionPoints: [
          'Tải lên ảnh Logo thương hiệu và xem trước trực tiếp trên mẫu phiếu A4 2 liên và phiếu nhiệt K80.',
          'Cập nhật Ngân hàng, Số tài khoản và Chủ tài khoản để CSKH quét mã thu tiền nhanh tại quầy.',
          'Theo dõi hạn dùng gói cước và nâng cấp bản quyền tại module Gói cước & Bản quyền (/subscription).',
        ],
        handoverNote:
          'Cấu hình thương hiệu được áp dụng tức thì cho toàn bộ phiếu in của Lễ tân/CSKH.',
        guardrailNote:
          'Chỉ Quản trị viên cửa hàng mới được phép thay đổi thông tin tài khoản ngân hàng nhận tiền.',
      },
    ],
  },

  cskh: {
    roleKey: 'cskh',
    roleLabel: 'Lễ tân / CSKH',
    badgeText: 'TUYẾN ĐẦU TIẾP NHẬN · BÁO GIÁ · THU TIỀN & TRẢ MÁY',
    welcomeHeadline: 'Chào mừng Lễ tân / CSKH đến với Trạm POS FIXO',
    welcomeSummary:
      'Bạn là điểm chạm đầu tiên và cuối cùng của khách hàng tại cửa hàng: mở ca làm việc, tiếp nhận thiết bị siêu tốc, theo dõi tiến độ sửa chữa, thu tiền VietQR và trả máy kích hoạt bảo hành.',
    primaryWorkspaceLabel: 'Đơn sửa chữa (/repairs)',
    primaryWorkspaceHref: '/repairs',
    rbacSummary:
      'Truy cập 6 module cốt lõi: Tổng quan, Đơn sửa chữa, Khách hàng, Timeline, Bảo hành và Sổ quỹ & Ca trực tại chi nhánh được phân công.',
    steps: [
      {
        stepNumber: 1,
        id: 'cskh-step-1-shift',
        title: 'Mở Ca Làm việc & Khai báo Tiền mặt Đầu ca',
        subtitle: 'Bước khởi đầu bắt buộc trước khi phát sinh giao dịch thu chi',
        spotlightArea: 'HỆ THỐNG · Sổ quỹ & Ca trực (/shifts)',
        targetModuleId: 'shifts',
        targetHref: '/shifts',
        icon: 'payments',
        description:
          'Trước khi thu tiền đơn sửa chữa hoặc ghi nhận phiếu chi tại quầy, bạn cần mở ca làm việc và nhập số dư tiền mặt thực tế đầu ca để hệ thống tự động đối soát cuối ngày.',
        actionPoints: [
          'Nhấn nút Mở ca trên thanh Topbar hoặc truy cập trực tiếp module Sổ quỹ & Ca trực (/shifts).',
          'Nhập số tiền mặt đầu ca và ghi chú bàn giao nếu có.',
          'Cuối ca làm việc, thực hiện Kết ca để đối chiếu doanh thu tiền mặt và chuyển khoản VietQR.',
        ],
        handoverNote:
          'Biên bản kết ca sẽ được lưu trữ để Quản trị viên đối soát doanh thu thực thu.',
        guardrailNote:
          'Hệ thống yêu cầu phải có ca trực đang mở trước khi xác nhận thu tiền mặt tại quầy.',
      },
      {
        stepNumber: 2,
        id: 'cskh-step-2-intake',
        title: 'Tiếp nhận Thiết bị Siêu tốc & In Phiếu A4 / K80',
        subtitle: 'Ghi nhận chuẩn xác bộ phận L / R / Case và 9 tiêu chí kiểm tra',
        spotlightArea: 'WORKSPACE · Đơn sửa chữa (/repairs)',
        targetModuleId: 'repairs',
        targetHref: '/repairs',
        icon: 'repairs',
        description:
          'Sử dụng màn hình Tiếp nhận 2 cột để tra cứu nhanh khách hàng theo số điện thoại, chọn thành phần phần cứng nhận vào, đánh giá checklist 9 tiêu chí và in phiếu giao ngay cho khách.',
        actionPoints: [
          'Chọn đúng bộ phận khách gửi lại: Tai trái (L), Tai phải (R), Hộp sạc (Case) hoặc thân máy.',
          'Sử dụng phím tắt 1 (Hoạt động), 2 (Lỗi), 3 (Không kiểm tra) để điền nhanh bảng kiểm đầu vào.',
          'In phiếu tiếp nhận A4 2 liên hoặc phiếu nhiệt K80 có sẵn mã QR để khách tự tra cứu tiến độ.',
        ],
        handoverNote:
          'Sau khi tạo đơn và duyệt báo giá, chuyển trạng thái sang Chờ kỹ thuật để xưởng nhận máy.',
        guardrailNote:
          'Luôn ghi rõ tình trạng trầy xước ngoại quan để bảo vệ quyền lợi của cả khách hàng và cửa hàng.',
      },
      {
        stepNumber: 3,
        id: 'cskh-step-3-tracking-cod',
        title: 'Điều phối Tiến độ, Dịch vụ Bổ sung & Đơn Giao nhận COD',
        subtitle: 'Cầu nối thông tin giữa Kỹ thuật viên tại xưởng và Khách hàng',
        spotlightArea: 'WORKSPACE · Khách hàng (/customers) & Timeline (/timeline)',
        targetModuleId: 'customers',
        targetHref: '/customers',
        icon: 'customers',
        description:
          'Khi Kỹ thuật viên phát hiện thêm lỗi phát sinh hoặc cần đặt linh kiện đặc biệt, bạn liên hệ khách hàng để xác nhận báo giá bổ sung và cập nhật địa chỉ giao hàng nếu khách chọn ship COD.',
        actionPoints: [
          'Thêm hoặc điều chỉnh hạng mục dịch vụ bổ sung trên đơn hàng khi khách hàng đồng ý sửa thêm.',
          'Đánh dấu loại đơn COD và nhập đầy đủ địa chỉ nhận hàng đối với khách gửi máy từ xa.',
          'Tra cứu toàn bộ lịch sử sửa chữa và chi tiêu của khách tại module Khách hàng (/customers).',
        ],
        handoverNote:
          'Thông báo lại cho Kỹ thuật viên ngay sau khi khách hàng xác nhận đồng ý phương án xử lý.',
        guardrailNote:
          'Chỉ thêm dịch vụ phát sinh khi đã có sự đồng thuận rõ ràng từ phía khách hàng.',
      },
      {
        stepNumber: 4,
        id: 'cskh-step-4-checkout-warranty',
        title: 'Thu tiền VietQR Tự động, Trả máy & Kích hoạt Bảo hành',
        subtitle: 'Hoàn tất đơn hàng khi bộ phận QC đã kiểm định đạt chuẩn',
        spotlightArea: 'VẬN HÀNH · Bảo hành (/warranty)',
        targetModuleId: 'warranty',
        targetHref: '/warranty',
        icon: 'warranty',
        description:
          'Đối với các đơn đã qua QC (Chờ trả khách), bạn thực hiện thu tiền qua mã động VietQR SePay hoặc tiền mặt, hoàn tất trả máy và tra cứu bảo hành điện tử khi khách quay lại.',
        actionPoints: [
          'Mở hộp thoại Thanh toán & Trả máy, áp dụng chiết khấu (nếu có) và chọn thời hạn bảo hành phù hợp.',
          'Hiển thị mã QR động VietQR để khách quét chuyển khoản tự động xác nhận hoặc thu tiền mặt.',
          'Khi khách mang máy quay lại bảo hành, sử dụng chức năng Tiếp nhận Bảo hành tại /warranty hoặc /dashboard.',
        ],
        handoverNote:
          'Khi đơn chuyển sang Hoàn tất, hệ thống tự động kích hoạt bảo hành điện tử và ghi nhận vào Sổ quỹ.',
        guardrailNote:
          'Đơn hàng thông thường bắt buộc phải hoàn tất thanh toán đủ trước khi chuyển sang trạng thái Hoàn tất.',
      },
    ],
  },

  tech: {
    roleKey: 'tech',
    roleLabel: 'Kỹ thuật viên',
    badgeText: 'CHUYÊN BIỆT KỸ THUẬT PHẦN CỨNG · KHÔNG GIAN /TECH',
    welcomeHeadline: 'Chào mừng Kỹ thuật viên đến với Bàn làm việc Kỹ thuật',
    welcomeSummary:
      'Không gian làm việc của bạn được thiết kế tinh gọn và tập trung 100% tại module Không gian Kỹ thuật (/tech) để nhận máy, chẩn đoán phần cứng, bóc tách linh kiện và bàn giao kiểm định QC.',
    primaryWorkspaceLabel: 'Không gian Kỹ thuật (/tech)',
    primaryWorkspaceHref: '/tech',
    rbacSummary:
      'Truy cập chuyên biệt tại module Không gian Kỹ thuật (/tech) thuộc chi nhánh được phân công; bảo mật phân quyền tập trung thuần túy vào thông số kỹ thuật và linh kiện.',
    steps: [
      {
        stepNumber: 1,
        id: 'tech-step-1-queue',
        title: 'Nhận việc từ Hàng đợi Chờ sửa & In Tem Khay K80',
        subtitle: 'Tiếp nhận thiết bị từ quầy lễ tân với âm báo thời gian thực',
        spotlightArea: 'VẬN HÀNH · Không gian Kỹ thuật (/tech — Hàng đợi chờ sửa)',
        targetModuleId: 'tech',
        targetHref: '/tech',
        icon: 'wrench',
        description:
          'Khi Lễ tân bàn giao thiết bị xuống xưởng, đơn hàng sẽ xuất hiện tại phân vùng Hàng đợi chờ sửa kèm âm báo. Bạn kiểm tra khay vật lý và nhấn Nhận đơn để bắt đầu xử lý.',
        actionPoints: [
          'Đọc kỹ ghi chú kiểm tra đầu vào theo từng bộ phận: Tai trái (L), Tai phải (R), Hộp sạc (Case) hoặc Đồng hồ.',
          'Nhấn nút Nhận đơn để hệ thống gán thiết bị vào Bàn làm việc cá nhân của bạn (Đang sửa).',
          'Nhấn In tem khay K80 để dán mã định danh lên khay linh kiện, chống nhầm lẫn giữa các ca máy.',
        ],
        handoverNote:
          'Thiết bị chuyển từ trạng thái Chờ kỹ thuật (waiting_tech) sang Đang sửa (in_repair).',
        guardrailNote:
          'Chỉ nhận đơn khi bạn đã tiếp nhận đúng thiết bị vật lý tại bàn kỹ thuật của chi nhánh.',
      },
      {
        stepNumber: 2,
        id: 'tech-step-2-diagnosis',
        title: 'Chẩn đoán Chuyên sâu & Ghi chú Kỹ thuật Từng Bộ phận',
        subtitle: 'Lưu vết đầy đủ thông số đo kiểm và phương án can thiệp phần cứng',
        spotlightArea: 'VẬN HÀNH · Không gian Kỹ thuật (/tech — Bàn làm việc của tôi)',
        targetModuleId: 'tech',
        targetHref: '/tech',
        icon: 'headphones',
        description:
          'Tại phân vùng Bàn làm việc của tôi, bạn mở chi tiết kỹ thuật của đơn hàng để ghi nhận kết quả đo dòng, tình trạng vi mạch, pin, màng loa hoặc micro cho từng bộ phận.',
        actionPoints: [
          'Mở cửa sổ Chi tiết Kỹ thuật trên thẻ đơn hàng đang sửa.',
          'Ghi rõ kết quả kiểm tra chuyên sâu vào ô Ghi chú kỹ thuật (repair_note) để bộ phận QC và CSKH nắm bắt.',
          'Nếu phát hiện bệnh phát sinh ngoài yêu cầu ban đầu, ghi chú rõ và báo CSKH xác nhận với khách trước khi can thiệp.',
        ],
        handoverNote:
          'Thông tin ghi chú kỹ thuật được đồng bộ tức thì sang màn hình theo dõi của Lễ tân và QC.',
        guardrailNote:
          'Tuyệt đối không tự ý thay thế bộ phận ngoài yêu cầu khi CSKH chưa xác nhận khách hàng đã duyệt.',
      },
      {
        stepNumber: 3,
        id: 'tech-step-3-parts-handover',
        title: 'Bóc tách Linh kiện Kho, Yêu cầu Vật tư Đặc biệt & Bàn giao Ca',
        subtitle: 'Quản lý chính xác vật tư thay thế và phối hợp liên bộ phận',
        spotlightArea: 'VẬN HÀNH · Không gian Kỹ thuật (/tech — Linh kiện & Bàn giao)',
        targetModuleId: 'tech',
        targetHref: '/tech',
        icon: 'package',
        description:
          'Khai báo chính xác linh kiện đã xuất kho sử dụng cho ca sửa chữa, gửi yêu cầu mua vật tư hiếm nếu kho hết hàng, hoặc bàn giao đơn cho đồng nghiệp khi hết ca trực.',
        actionPoints: [
          'Chọn đúng mã linh kiện thực tế đã thay thế (parts_used) để hệ thống đối chiếu tồn kho kỹ thuật.',
          'Nếu thiếu linh kiện hiếm, mở chức năng Yêu cầu linh kiện đặc biệt để chuyển đơn sang Chờ linh kiện (waiting_parts).',
          'Khi đổi ca hoặc cần chuyển ca bệnh phức tạp, nhấn Bàn giao đơn và chọn lý do bàn giao chuẩn hóa.',
        ],
        handoverNote:
          'Yêu cầu linh kiện đặc biệt sẽ được đẩy tự động sang màn hình của Thủ kho và Quản trị viên.',
        guardrailNote:
          'Mọi thao tác bàn giao đơn giữa các kỹ thuật viên đều yêu cầu chọn lý do minh bạch.',
      },
      {
        stepNumber: 4,
        id: 'tech-step-4-complete-qc',
        title: 'Hoàn tất Sửa chữa Chuyển QC & Tra cứu Lịch sử 7 Ngày',
        subtitle: 'Đảm bảo chất lượng đầu ra và tuân thủ phân quyền kỹ thuật',
        spotlightArea: 'VẬN HÀNH · Không gian Kỹ thuật (/tech — Hoàn thành & Lịch sử)',
        targetModuleId: 'tech',
        targetHref: '/tech',
        icon: 'check',
        description:
          'Sau khi lắp ráp và kiểm tra hoạt động ổn định, bạn nhấn Hoàn thành sửa để chuyển máy sang bộ phận Kiểm định Chất lượng (QC), hoặc xử lý ưu tiên các đơn QC yêu cầu làm lại (Rework).',
        actionPoints: [
          'Kiểm tra lại danh sách linh kiện đã kê khai trước khi nhấn nút Hoàn thành sửa (chuyển sang waiting_qc).',
          'Ưu tiên xử lý các đơn gắn nhãn Yêu cầu làm lại (rework_needed) kèm lý do chi tiết từ bộ phận QC.',
          'Tra cứu lại các đơn đã sửa xong trong phạm vi 7 ngày gần nhất (Hôm nay / 3 ngày / 7 ngày) để đối chiếu kỹ thuật.',
        ],
        handoverNote:
          'Thiết bị sau khi hoàn tất sửa sẽ chuyển thẳng vào Hàng đợi Kiểm định của bộ phận QC.',
        guardrailNote:
          'Giới hạn phân quyền RBAC: Kỹ thuật viên chỉ truy cập chuyên biệt tại Không gian Kỹ thuật (/tech) theo đúng phạm vi chi nhánh được phân công.',
      },
    ],
  },

  qc: {
    roleKey: 'qc',
    roleLabel: 'Kiểm định Chất lượng (QC)',
    badgeText: 'CHỐT CHẶN CHẤT LƯỢNG ĐỘC LẬP TRƯỚC KHI TRẢ KHÁCH',
    welcomeHeadline: 'Chào mừng Chuyên viên Kiểm định QC đến với FIXO',
    welcomeSummary:
      'Bạn giữ vai trò chốt chặn chất lượng cuối cùng tại xưởng: kiểm tra độc lập toàn bộ tiêu chí kỹ thuật sau sửa chữa, phê duyệt máy đạt chuẩn để trả khách hoặc yêu cầu kỹ thuật viên làm lại.',
    primaryWorkspaceLabel: 'Kiểm định QC (/qc)',
    primaryWorkspaceHref: '/qc',
    rbacSummary:
      'Truy cập 5 module: Tổng quan, Đơn sửa chữa, Kiểm định QC, Thiết bị và Timeline trong phạm vi chi nhánh.',
    steps: [
      {
        stepNumber: 1,
        id: 'qc-step-1-queue',
        title: 'Tiếp nhận Hàng đợi Kiểm định Chất lượng (/qc)',
        subtitle: 'Theo dõi tập trung các thiết bị vừa được Kỹ thuật viên hoàn tất',
        spotlightArea: 'VẬN HÀNH · Kiểm định QC (/qc)',
        targetModuleId: 'qc',
        targetHref: '/qc',
        icon: 'qc',
        description:
          'Module Kiểm định QC liệt kê toàn bộ đơn hàng đang ở trạng thái Chờ QC (waiting_qc). Số lượng đơn chờ kiểm định được hiển thị trực tiếp trên huy hiệu của thanh Sidebar.',
        actionPoints: [
          'Chọn đơn hàng trong danh sách Chờ QC để mở bảng đánh giá chất lượng chi tiết.',
          'Xem thông tin Kỹ thuật viên phụ trách, ghi chú quá trình sửa chữa và linh kiện đã thay thế.',
          'Đối chiếu tình trạng ngoại quan thực tế so với ghi chú lúc tiếp nhận ban đầu.',
        ],
        handoverNote:
          'Nhận thiết bị vật lý kèm tem khay K80 từ bàn bàn giao của Kỹ thuật viên.',
        guardrailNote:
          'Chỉ những đơn hàng đã được Kỹ thuật viên bấm Hoàn thành sửa mới xuất hiện trong hàng đợi chốt QC.',
      },
      {
        stepNumber: 2,
        id: 'qc-step-2-checklist',
        title: 'Đo kiểm Độc lập theo Bộ Tiêu chí Chuẩn Thiết bị',
        subtitle: 'Đảm bảo âm thanh, kết nối, cảm biến, sạc và ngoại quan đạt 100%',
        spotlightArea: 'WORKSPACE · Thiết bị (/devices) & Kiểm định QC (/qc)',
        targetModuleId: 'devices',
        targetHref: '/devices',
        icon: 'headphones',
        description:
          'Thực hiện kiểm tra chéo toàn bộ các hạng mục chức năng theo mẫu checklist của từng dòng AirPods, Apple Watch hoặc Apple Pencil để đảm bảo không sót lỗi tiềm ẩn.',
        actionPoints: [
          'Kiểm tra từng hạng mục: Kết nối Bluetooth, Âm thanh L/R, Micro đàm thoại, Chống ồn ANC/Xuyên âm, Cảm biến và Pin.',
          'Đánh dấu kết quả Đạt (Pass) hoặc Không đạt (Fail) cho từng tiêu chí trong biên bản QC.',
          'Tra cứu chuẩn thông số và mẫu checklist của từng đời máy tại module Thiết bị (/devices).',
        ],
        handoverNote:
          'Kết quả từng tiêu chí QC được lưu trữ vĩnh viễn vào hồ sơ đơn sửa chữa.',
        guardrailNote:
          'Không phê duyệt Đạt nếu bất kỳ hạng mục cốt lõi nào trong yêu cầu sửa chữa của khách chưa ổn định.',
      },
      {
        stepNumber: 3,
        id: 'qc-step-3-pass',
        title: 'Phê duyệt Đạt Chuẩn & Chuyển CSKH Trả máy',
        subtitle: 'Kích hoạt trạng thái Sẵn sàng trả khách (ready_for_return)',
        spotlightArea: 'WORKSPACE · Đơn sửa chữa (/repairs)',
        targetModuleId: 'repairs',
        targetHref: '/repairs',
        icon: 'verified',
        description:
          'Khi thiết bị vượt qua toàn bộ bài kiểm tra chất lượng, bạn xác nhận Đạt QC để hệ thống chuyển đơn sang trạng thái Chờ trả khách và thông báo tức thì cho quầy Lễ tân/CSKH.',
        actionPoints: [
          'Ghi nhận kết luận nghiệm thu chất lượng vào biên bản kiểm định.',
          'Nhấn xác nhận Đạt QC để chuyển trạng thái đơn sang Chờ trả khách (ready_for_return).',
          'Bàn giao thiết bị sạch đẹp về quầy Lễ tân để liên hệ khách hàng đến nhận máy.',
        ],
        handoverNote:
          'Lễ tân/CSKH nhận thông báo tự động để tiến hành thu tiền và trả máy cho khách.',
        guardrailNote:
          'Biên bản QC được gắn định danh tài khoản Kiểm định viên thực hiện nghiệm thu.',
      },
      {
        stepNumber: 4,
        id: 'qc-step-4-rework',
        title: 'Đánh dấu Không Đạt (Rework) & Trả về Kỹ thuật viên',
        subtitle: 'Kiểm soát chặt chẽ quy trình xử lý lại lỗi kỹ thuật nội bộ',
        spotlightArea: 'WORKSPACE · Timeline (/timeline)',
        targetModuleId: 'timeline',
        targetHref: '/timeline',
        icon: 'timeline',
        description:
          'Nếu phát hiện thiết bị còn lỗi âm thanh, hao nguồn hoặc lắp ráp chưa khít, bạn đánh dấu Không đạt kèm lý do chi tiết để trả ngược đơn về bàn làm việc của Kỹ thuật viên.',
        actionPoints: [
          'Nhập rõ nguyên nhân không đạt vào ô Lý do yêu cầu làm lại (rework_reason).',
          'Hệ thống tự động chuyển đơn về trạng thái Yêu cầu làm lại (rework_needed) và phát thông báo cho Kỹ thuật viên.',
          'Theo dõi toàn bộ lịch sử luân chuyển qua lại giữa Kỹ thuật và QC tại module Timeline (/timeline).',
        ],
        handoverNote:
          'Đơn Rework sẽ được hiển thị ưu tiên trên đầu Bàn làm việc của Kỹ thuật viên phụ trách.',
        guardrailNote:
          'Bắt buộc phải ghi rõ lý do kỹ thuật cụ thể khi đánh dấu Không đạt để Kỹ thuật viên khắc phục trúng đích.',
      },
    ],
  },

  inventory: {
    roleKey: 'inventory',
    roleLabel: 'Thủ kho & Mua hàng',
    badgeText: 'QUẢN TRỊ TỒN KHO CHI NHÁNH · NHẬP HÀNG & CUNG ỨNG LINH KIỆN',
    welcomeHeadline: 'Chào mừng Thủ kho đến với Trung tâm Kho & Mua hàng FIXO',
    welcomeSummary:
      'Bạn phụ trách đảm bảo nguồn cung linh kiện chính xác cho xưởng sửa chữa: kiểm soát tồn kho cách ly theo chi nhánh, lập phiếu nhập hàng nhà cung cấp và đáp ứng yêu cầu vật tư đặc biệt.',
    primaryWorkspaceLabel: 'Kho & Mua hàng (/inventory)',
    primaryWorkspaceHref: '/inventory',
    rbacSummary:
      'Truy cập 5 module: Tổng quan, Đơn sửa chữa, Kho & Mua hàng, Đối tác và Thiết bị tại chi nhánh được phân công.',
    steps: [
      {
        stepNumber: 1,
        id: 'inventory-step-1-stock',
        title: 'Kiểm soát Tồn kho Linh kiện Cách ly Theo Chi nhánh',
        subtitle: 'Theo dõi số lượng tồn thực tế, cảnh báo sắp hết hàng và lịch sử xuất nhập',
        spotlightArea: 'VẬN HÀNH · Kho & Mua hàng (/inventory — Tồn kho)',
        targetModuleId: 'inventory',
        targetHref: '/inventory',
        icon: 'inventory',
        description:
          'Module Kho & Mua hàng giúp bạn tra cứu tức thì số lượng tồn kho của từng mã SKU linh kiện (pin, màng loa, vỏ case, cảm biến) tại đúng chi nhánh đang vận hành.',
        actionPoints: [
          'Lọc danh sách linh kiện theo trạng thái tồn kho: Còn hàng, Sắp hết hàng (dưới ngưỡng cảnh báo) hoặc Hết hàng.',
          'Thực hiện xuất/nhập điều chỉnh tồn kho kèm ghi chú nguyên nhân rõ ràng.',
          'Đối chiếu lịch sử biến động tồn kho tự động khi đơn sửa chữa hoàn tất.',
        ],
        handoverNote:
          'Số liệu tồn kho được cập nhật tự động mỗi khi Kỹ thuật viên kê khai linh kiện và đơn hàng hoàn tất.',
        guardrailNote:
          'Tồn kho được cách ly nghiêm ngặt theo từng chi nhánh (Branch Warehouse Isolation).',
      },
      {
        stepNumber: 2,
        id: 'inventory-step-2-special-parts',
        title: 'Đáp ứng Yêu cầu Linh kiện Đặc biệt từ Kỹ thuật viên',
        subtitle: 'Giải phóng nhanh các đơn hàng đang tạm dừng Chờ linh kiện (waiting_parts)',
        spotlightArea: 'WORKSPACE · Đơn sửa chữa (/repairs)',
        targetModuleId: 'repairs',
        targetHref: '/repairs',
        icon: 'repairs',
        description:
          'Khi Kỹ thuật viên gặp ca máy cần vật tư hiếm chưa có trong kho và gửi Yêu cầu linh kiện đặc biệt, bạn tiến hành đặt mua ngoài và xác nhận cấp phát ngay khi hàng về.',
        actionPoints: [
          'Theo dõi các đơn hàng đang ở trạng thái Chờ linh kiện (waiting_parts) tại /repairs hoặc /dashboard.',
          'Kiểm tra nội dung yêu cầu vật tư đặc biệt của Kỹ thuật viên.',
          'Nhấn xác nhận Đã có linh kiện (Fulfill Special Part) để đơn hàng tự động quay lại trạng thái Đang sửa (in_repair).',
        ],
        handoverNote:
          'Ngay khi bạn xác nhận đã có hàng, Kỹ thuật viên sẽ nhận được thông báo để tiếp tục sửa máy.',
        guardrailNote:
          'Luôn cập nhật giá nhập và nguồn cung ứng trước khi bàn giao linh kiện đặc biệt xuống xưởng.',
      },
      {
        stepNumber: 3,
        id: 'inventory-step-3-goods-receipt',
        title: 'Lập Phiếu Nhập Kho (Goods Receipt) & Quản lý Nhà cung cấp',
        subtitle: 'Chuẩn hóa quy trình mua hàng, tính giá vốn bình quân và công nợ phải trả',
        spotlightArea: 'VẬN HÀNH · Kho & Mua hàng (/inventory — Nhập kho & Nhà cung cấp)',
        targetModuleId: 'inventory',
        targetHref: '/inventory',
        icon: 'package',
        description:
          'Khi nhập lô linh kiện mới từ Nhà cung cấp, bạn tạo Phiếu nhập kho đa mặt hàng để hệ thống tự động cộng tồn kho chi nhánh và ghi nhận công nợ phải trả nhà cung cấp.',
        actionPoints: [
          'Tạo mới hồ sơ Nhà cung cấp và chọn danh sách linh kiện nhập kho trong cùng một phiếu.',
          'Khai báo số tiền đã thanh toán trước và khoản nợ còn lại cho từng lô hàng nhập.',
          'Thực hiện lập phiếu thanh toán nợ nhà cung cấp và tra cứu sổ cái công nợ minh bạch.',
        ],
        handoverNote:
          'Phiếu nhập kho giúp Quản trị viên nắm rõ biến động giá vốn linh kiện theo từng đợt mua hàng.',
        guardrailNote:
          'Mọi phiếu nhập kho sau khi lưu đều tự động ghi nhận vào lịch sử giao dịch kho và sổ công nợ.',
      },
      {
        stepNumber: 4,
        id: 'inventory-step-4-devices-partners',
        title: 'Đồng bộ Danh mục Thiết bị & Đối tác Gia công Ngoài',
        subtitle: 'Chuẩn hóa danh mục đời máy Apple và mạng lưới đối tác kỹ thuật',
        spotlightArea: 'WORKSPACE & VẬN HÀNH · Thiết bị (/devices) & Đối tác (/partners)',
        targetModuleId: 'devices',
        targetHref: '/devices',
        icon: 'partners',
        description:
          'Tra cứu cấu hình chi tiết của từng dòng thiết bị (AirPods, Apple Watch, Apple Pencil) và quản lý thông tin các Đối tác cung ứng hoặc gia công kỹ thuật chuyên sâu.',
        actionPoints: [
          'Rà soát danh mục các đời thiết bị và linh kiện tương thích tại module Thiết bị (/devices).',
          'Quản lý danh bạ Đối tác kỹ thuật và đơn vị cung ứng liên kết tại module Đối tác (/partners).',
          'Phối hợp với Quản trị viên để bổ sung các dòng thiết bị mới ra mắt vào danh mục chuẩn.',
        ],
        handoverNote:
          'Danh mục thiết bị chuẩn hóa giúp Lễ tân tiếp nhận nhanh và Kỹ thuật viên chọn đúng mã linh kiện.',
        guardrailNote:
          'Không xóa các mã thiết bị hoặc linh kiện đã có phát sinh lịch sử đơn sửa chữa.',
      },
    ],
  },
};

/**
 * Danh sách 5 bước thiết lập gian hàng ban đầu dành riêng cho Chủ cửa hàng (role `admin`) trên `/dashboard`.
 */
export const ADMIN_SETUP_CHECKLIST_STEPS: SetupChecklistStep[] = [
  {
    id: 'step-branding',
    stepNumber: 1,
    title: 'Thiết lập Thương hiệu, Phiếu in & Tài khoản VietQR',
    description:
      'Tải lên Logo cửa hàng, cấu hình Hotline, ghi chú chân phiếu in A4/K80 và tài khoản ngân hàng nhận tiền SePay VietQR.',
    moduleId: 'branding',
    href: '/branding',
    ctaLabel: 'Cấu hình thương hiệu',
    icon: 'spark',
    estimatedTime: '2 phút',
  },
  {
    id: 'step-branches',
    stepNumber: 2,
    title: 'Kiểm tra & Khởi tạo Chi nhánh Hoạt động',
    description:
      'Rà soát thông tin địa chỉ, số điện thoại của chi nhánh chính hoặc khởi tạo thêm các chi nhánh mới trong chuỗi.',
    moduleId: 'branches',
    href: '/branches',
    ctaLabel: 'Quản lý chi nhánh',
    icon: 'building',
    estimatedTime: '2 phút',
  },
  {
    id: 'step-users',
    stepNumber: 3,
    title: 'Tạo Tài khoản Nhân sự & Phân quyền 5 Bộ phận',
    description:
      'Cấp tài khoản đăng nhập riêng cho Lễ tân CSKH, Kỹ thuật viên, Kiểm định QC và Thủ kho gắn với từng chi nhánh.',
    moduleId: 'users',
    href: '/users',
    ctaLabel: 'Tạo tài khoản nhân sự',
    icon: 'users',
    estimatedTime: '3 phút',
  },
  {
    id: 'step-catalog',
    stepNumber: 4,
    title: 'Rà soát Danh mục Thiết bị & Mẫu Checklist Tiếp nhận',
    description:
      'Kiểm tra các dòng thiết bị (AirPods, Apple Watch, Apple Pencil), bảng kiểm 9 tiêu chí và danh mục linh kiện kho.',
    moduleId: 'devices',
    href: '/devices',
    ctaLabel: 'Thiết lập danh mục',
    icon: 'headphones',
    estimatedTime: '3 phút',
  },
  {
    id: 'step-first-shift',
    stepNumber: 5,
    title: 'Mở Ca Làm việc Đầu tiên & Tạo Đơn Tiếp nhận Mẫu',
    description:
      'Khai báo số dư tiền mặt đầu ca tại Sổ quỹ & Ca trực để sẵn sàng tiếp nhận đơn sửa chữa và thu tiền tại quầy.',
    moduleId: 'shifts',
    href: '/shifts',
    ctaLabel: 'Mở ca làm việc',
    icon: 'payments',
    estimatedTime: '2 phút',
  },
];

/**
 * Lấy cấu hình Onboarding tương ứng với role của người dùng.
 * Trả về `null` nếu là `super_admin` hoặc role không hợp lệ.
 */
export function getOnboardingRoleConfig(
  rawRole?: string | null
): OnboardingRoleConfig | null {
  const roleKey = normalizeOnboardingRole(rawRole);
  if (!roleKey) {
    return null;
  }
  return ONBOARDING_ROLE_CONFIGS[roleKey] ?? null;
}
