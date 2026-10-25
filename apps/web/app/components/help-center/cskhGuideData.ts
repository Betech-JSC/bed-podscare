import type { RoleGuideConfig } from './types';

export const cskhGuideData: RoleGuideConfig = {
  roleKey: 'cskh',
  tabLabel: 'Lễ tân / CSKH',
  roleTitle: 'Lễ tân & Chăm sóc Khách hàng (CSKH / Front-Desk POS)',
  badgeLabel: 'ROLE: CSKH · 6 MODULES CẤP CỬA HÀNG',
  missionSummary:
    'Đầu mối giao tiếp trực tiếp với khách hàng tại quầy: chịu trách nhiệm mở/chốt ca sổ quỹ hàng ngày, tiếp nhận thiết bị (nhanh hoặc chi tiết theo lô), tư vấn báo giá minh bạch, in phiếu biên nhận A4 2 liên hoặc nhiệt K80, bàn giao máy cho Kỹ thuật viên, phối hợp xử lý phát sinh linh kiện/dịch vụ, thu tiền (Tiền mặt / VietQR SePay tự động đối soát / COD Giao nhận) và trả máy kích hoạt bảo hành điện tử.',
  dataScope:
    'Cô lập dữ liệu theo chi nhánh được phân công (Strict Branch Isolation): Truy cập đúng 6 module trên Sidebar gồm Tổng quan (/dashboard), Đơn sửa chữa (/repairs), Khách hàng (/customers), Timeline (/timeline), Bảo hành (/warranty) và Sổ quỹ & Ca trực (/shifts).',
  financialVisibility:
    'Được xem bảng giá bán dịch vụ niêm yết, thu tiền đơn hàng, lập phiếu thu/chi tiền mặt vận hành tại ca trực (CashTransaction) và thực hiện hoàn tiền khách hàng (RefundModal); hệ thống ẩn hoàn toàn giá vốn linh kiện nhập kho (cost_price / COGS) và báo cáo lợi nhuận ròng cấp Quản trị viên.',
  coreResponsibilities: [
    'Mở ca làm việc đầu ngày (OpenShiftModal) và khai báo chính xác số dư tiền mặt đầu ca tại két trước khi thực hiện giao dịch thu/chi.',
    'Tiếp nhận thiết bị nhanh qua Bàn tiếp nhận nhanh (IntakeQuickConsole) hoặc tạo đơn chi tiết qua IntakeWizardModal (Tại quầy / Ship COD / Bảo hành, hỗ trợ gom lô intake_batch_code).',
    'Ghi nhận trung thực ngoại quan độc lập từng bộ phận (Tai trái, Tai phải, Hộp sạc, Apple Watch, Apple Pencil), báo giá dịch vụ và in biên nhận A4 2 liên hoặc phiếu nhiệt K80.',
    'Phối hợp với Kỹ thuật viên khi phát sinh thêm dịch vụ sửa chữa hoặc xác nhận đã mua linh kiện đặc biệt ngoài (fulfillSpecialPart) kèm lập phiếu chi tại quầy.',
    'Thu đủ 100% công nợ qua Tiền mặt, quét mã động VietQR SePay (tự động khớp lệnh qua Webhook) hoặc gán COD Giao nhận hợp lệ trước khi bấm Hoàn tất trả máy (CheckoutHandoverModal).',
    'Tra cứu bảo hành điện tử, tiếp nhận máy bảo hành (WarrantyClaim / Rework), xử lý hoàn tiền khách hàng (RefundModal) và chốt ca đối soát sổ quỹ cuối ngày (CloseShiftModal).',
  ],
  modules: [
    {
      id: 'dashboard',
      label: 'Tổng quan',
      href: '/dashboard',
      group: 'WORKSPACE',
      summary:
        'Bàn điều khiển trung tâm đầu ca tích hợp Bàn tiếp nhận nhanh (IntakeQuickConsole), thẻ theo dõi danh sách máy đã qua QC chờ trả khách, đơn đang chờ linh kiện và cảnh báo vận hành trong ca.',
      subSections: [
        {
          title: 'Bàn tiếp nhận nhanh (IntakeQuickConsole)',
          badge: 'Tạo đơn tức thì',
          badgeType: 'new',
          description:
            'Nhập nhanh SĐT khách hàng (tự động chuẩn hóa Unicode), chọn dòng thiết bị Apple và bệnh phổ biến để khởi tạo đơn ngay tại màn hình chính khi quầy đông khách.',
        },
        {
          title: 'Thẻ theo dõi Máy chờ trả khách & Đơn chờ linh kiện',
          badge: 'Theo dõi trong ca',
          badgeType: 'ready',
          description:
            'Hiển thị danh sách các đơn đã được QC duyệt Đạt (ready_for_return) cần gọi khách đến nhận máy và các đơn đang tạm dừng chờ linh kiện (waiting_parts).',
        },
      ],
      keyActions: [
        'Khởi tạo nhanh đơn sửa chữa tại Bàn tiếp nhận nhanh (IntakeQuickConsole) chỉ trong 30 giây.',
        'Quan sát cảnh báo vận hành trong ca: trạng thái mở/đóng ca trực, số đơn chờ khách duyệt báo giá và số máy sẵn sàng trả khách.',
        'Nhấp trực tiếp vào thẻ đơn chờ trả khách để chuyển nhanh sang màn hình thu tiền và bàn giao máy.',
      ],
    },
    {
      id: 'repairs',
      label: 'Đơn sửa chữa',
      href: '/repairs',
      group: 'WORKSPACE',
      summary:
        'Không gian làm việc POS 3-Pane trọng tâm của Lễ tân/CSKH: quản lý toàn bộ vòng đời đơn hàng, tạo đơn chi tiết theo lô, in phiếu A4/K80, cập nhật dịch vụ phát sinh, xác nhận mua linh kiện ngoài và thu tiền trả máy.',
      subSections: [
        {
          title: 'Giao diện POS 3-Pane & Tiếp nhận chi tiết (IntakeWizardModal)',
          badge: 'Tại quầy / Ship COD / Bảo hành',
          badgeType: 'progress',
          description:
            'Hỗ trợ 3 hình thức tiếp nhận (Tại quầy, Ship COD tỉnh/nội thành, Bảo hành), cho phép tiếp nhận lô nhiều máy cùng lúc dưới chung mã lô (intake_batch_code) và ghi nhận tình trạng riêng cho Tai trái / Tai phải / Hộp sạc.',
        },
        {
          title: 'Thu tiền & Trả máy hoàn tất (CheckoutHandoverModal)',
          badge: 'Hoàn tất (completed)',
          badgeType: 'ready',
          description:
            'Đối soát tổng tiền thanh toán, chọn Tiền mặt, quét mã động VietQR SePay hoặc gán COD Giao nhận, in phiếu xuất kiêm bảo hành và đóng đơn.',
        },
      ],
      keyActions: [
        'Mở IntakeWizardModal tạo đơn chi tiết (Tại quầy / Ship COD / Bảo hành) và gom nhóm lô nhiều thiết bị qua intake_batch_code.',
        'In phiếu biên nhận nhiệt K80 (tự động cắt 2 liên: Liên 1 giao khách, Liên 2 dán máy) hoặc mẫu in A4 2 liên chuẩn.',
        'Thêm hoặc xóa dịch vụ sửa chữa bổ sung trên đơn khi Kỹ thuật viên phát hiện thêm bệnh và khách hàng đã đồng ý báo giá.',
        'Bấm xác nhận Đã mua linh kiện ngoài (fulfillSpecialPart) để chuyển đơn từ Chờ linh kiện (waiting_parts) về lại Đang sửa (in_repair) cho Kỹ thuật viên.',
        'Thực hiện Thu tiền & Trả máy qua CheckoutHandoverModal hoặc xử lý hoàn tiền qua RefundModal khi phát sinh hủy/hoàn.',
      ],
    },
    {
      id: 'customers',
      label: 'Khách hàng',
      href: '/customers',
      group: 'WORKSPACE',
      summary:
        'Hệ thống quản lý hồ sơ khách hàng (CRM), hỗ trợ tra cứu tức thì theo SĐT hoặc Họ tên đã chuẩn hóa tiếng Việt, theo dõi lịch sử sửa chữa từng thiết bị và tổng chi tiêu tích lũy.',
      keyActions: [
        'Tra cứu nhanh khách hàng bằng SĐT hoặc Tên (hệ thống tự động lọc bỏ ký tự ẩn Zero-Width Unicode khi copy từ Zalo/iOS Danh bạ).',
        'Tạo mới hoặc cập nhật thông tin liên hệ, địa chỉ giao nhận Ship COD và ghi chú đặc biệt của khách hàng.',
        'Xem toàn bộ lịch sử các đơn sửa chữa trước đây, danh sách Serial/IMEI thiết bị khách sở hữu và tổng chi tiêu tích lũy.',
      ],
    },
    {
      id: 'timeline',
      label: 'Timeline',
      href: '/timeline',
      group: 'WORKSPACE',
      summary:
        'Dòng thời gian trực quan theo dõi nhật ký dịch chuyển trạng thái của từng đơn sửa chữa tại chi nhánh theo thời gian thực để phản hồi khách hàng chính xác.',
      keyActions: [
        'Theo dõi tức thì đơn hàng đang nằm ở bước nào (Chờ kỹ thuật, Đang sửa, Chờ linh kiện, Chờ QC hay Chờ trả khách).',
        'Tra cứu mốc thời gian chuyển trạng thái và nhân sự phụ trách từng khâu để giải đáp ngay khi khách gọi hotline hỏi tiến độ.',
      ],
    },
    {
      id: 'warranty',
      label: 'Bảo hành',
      href: '/warranty',
      group: 'VẬN HÀNH',
      summary:
        'Cổng tra cứu sổ bảo hành điện tử theo mã đơn, Serial/IMEI hoặc SĐT khách hàng; kiểm tra thời hạn bảo hành còn hiệu lực của từng hạng mục và kích hoạt tiếp nhận bảo hành (WarrantyClaim / Rework).',
      keyActions: [
        'Tra cứu nhanh hạn bảo hành điện tử bằng Mã đơn sửa chữa, Số điện thoại khách hàng hoặc số Serial/IMEI thiết bị.',
        'Kiểm tra trạng thái hiệu lực bảo hành (Còn hạn / Hết hạn) chi tiết đến từng dịch vụ và linh kiện đã thay thế trên đơn gốc.',
        'Kích hoạt Tiếp nhận bảo hành (WarrantyClaim / Rework) liên kết trực tiếp với đơn gốc để đẩy thẳng vào hàng đợi ưu tiên của Kỹ thuật viên.',
      ],
    },
    {
      id: 'shifts',
      label: 'Sổ quỹ & Ca trực',
      href: '/shifts',
      group: 'HỆ THỐNG',
      summary:
        'Quản lý mở ca đầu ngày, lập phiếu thu/chi tiền mặt vận hành tại quầy, đối soát dòng tiền cuối ngày tách bạch giữa Tiền mặt tại két với Chuyển khoản VietQR SePay và in phiếu bàn giao ca K80.',
      subSections: [
        {
          title: 'Mở ca đầu ngày (OpenShiftModal) & Phiếu Thu/Chi (CashTransaction)',
          badge: 'Đầu ca & Trong ca',
          badgeType: 'progress',
          description:
            'Khai báo tiền mặt đầu ca để mở khóa tính năng thu ngân; ghi nhận mọi khoản thu/chi tiền mặt phát sinh tại quầy (mua linh kiện ngoài, trả ship, văn phòng phẩm).',
        },
        {
          title: 'Đối soát & Kết ca cuối ngày (CloseShiftModal)',
          badge: 'Cuối ca',
          badgeType: 'ready',
          description:
            'Tách bạch tự động doanh thu Tiền mặt tại két và doanh thu Chuyển khoản Ngân hàng (VietQR SePay), tính toán chênh lệch thực tế và in phiếu bàn giao ca nhiệt K80.',
        },
      ],
      keyActions: [
        'Mở ca làm việc đầu ngày qua OpenShiftModal và nhập chính xác số dư tiền mặt đầu ca.',
        'Tạo phiếu thu/chi tiền mặt nội bộ (CashTransaction) kèm lý do và chứng từ rõ ràng ngay trong ca trực.',
        'Thực hiện Kết ca cuối ngày qua CloseShiftModal: nhập số tiền mặt kiểm đếm thực tế, đối soát tự động với sổ quỹ và in phiếu bàn giao ca K80.',
      ],
    },
  ],
  dailyWorkflow: [
    {
      step: 1,
      title: 'Mở ca đầu ngày & Khai báo tiền mặt tại két (OpenShiftModal)',
      moduleLabel: 'Sổ quỹ & Ca trực (/shifts)',
      moduleHref: '/shifts',
      statusTransition: {
        from: 'Ca đóng',
        to: 'Ca trực Đang mở (open)',
        statusType: 'ready',
      },
      description:
        'Ngay khi bắt đầu ca làm việc, Lễ tân/CSKH kiểm đếm tiền mặt thực tế trong két tại quầy và mở ca trực để kích hoạt quyền thu tiền và lập phiếu thu/chi trong ngày.',
      checkpoints: [
        'Truy cập Sổ quỹ & Ca trực (/shifts), nhấn Mở ca làm việc (OpenShiftModal) và nhập đúng số tiền mặt bàn giao từ ca trước.',
        'Kiểm tra danh sách máy tồn từ ngày hôm trước tại Tổng quan (/dashboard): đơn đã qua QC chờ trả khách và đơn đang chờ linh kiện.',
      ],
      handoverTo: 'Kích hoạt phiên thu ngân tại quầy, sẵn sàng tiếp nhận khách hàng.',
    },
    {
      step: 2,
      title: 'Tiếp nhận thiết bị & Tư vấn báo giá (IntakeQuickConsole / IntakeWizardModal)',
      moduleLabel: 'Tổng quan (/dashboard) hoặc Đơn sửa chữa (/repairs)',
      moduleHref: '/repairs',
      statusTransition: {
        from: 'Khách mang máy đến / Ship tới',
        to: 'Mới tiếp nhận (received)',
        statusType: 'new',
      },
      description:
        'Tra cứu SĐT khách hàng (tự động lọc ký tự ẩn Unicode), kiểm tra ngoại quan thiết bị và lựa chọn tạo đơn nhanh tại Tổng quan hoặc tạo đơn chi tiết tại Đơn sửa chữa.',
      checkpoints: [
        'Chọn đúng kênh tiếp nhận: Tại quầy, Ship COD hoặc Bảo hành; sử dụng mã lô (intake_batch_code) nếu khách/đại lý gửi nhiều máy cùng lúc.',
        'Ghi nhận chi tiết tình trạng ngoại quan (trầy xước, móp, mất lưới, vào nước) độc lập cho từng thành phần: Tai trái (L), Tai phải (R), Hộp sạc (Case), Apple Watch hoặc Apple Pencil.',
      ],
      handoverTo: 'Xác nhận danh mục dịch vụ sửa chữa và báo giá dự kiến cho khách hàng.',
    },
    {
      step: 3,
      title: 'In phiếu biên nhận (K80 2 liên tự cắt / A4) & Bàn giao Kỹ thuật viên',
      moduleLabel: 'Đơn sửa chữa (/repairs)',
      moduleHref: '/repairs',
      statusTransition: {
        from: 'received / inspecting',
        to: 'Chờ kỹ thuật (waiting_tech)',
        statusType: 'wait',
      },
      description:
        'Sau khi khách đồng ý phương án kiểm tra/báo giá, tiến hành in phiếu biên nhận và chuyển trạng thái đơn sang Chờ kỹ thuật để đưa máy vào hàng đợi sửa chữa.',
      checkpoints: [
        'Chọn mẫu in Nhiệt K80 (tự động cắt 2 liên: Liên 1 giao khách giữ kèm mã QR tra cứu tiến độ, Liên 2 kẹp cùng khay thiết bị) hoặc in mẫu A4 2 liên.',
        'Bấm xác nhận chuyển đơn sang Chờ kỹ thuật (waiting_tech) và bàn giao khay thiết bị vật lý cho bộ phận Kỹ thuật viên.',
      ],
      handoverTo: 'Bàn giao thiết bị vật lý + Liên 2 phiếu in sang Không gian Kỹ thuật (/tech).',
    },
    {
      step: 4,
      title: 'Phối hợp xử lý phát sinh dịch vụ & Mua linh kiện đặc biệt ngoài trong ca',
      moduleLabel: 'Đơn sửa chữa (/repairs) & Sổ quỹ (/shifts)',
      moduleHref: '/repairs',
      statusTransition: {
        from: 'waiting_approval / waiting_parts',
        to: 'Đang sửa (in_repair)',
        statusType: 'progress',
      },
      description:
        'Theo dõi tiến độ trên Timeline (/timeline) và phối hợp tức thì với Kỹ thuật viên khi phát sinh thêm bệnh cần báo giá lại hoặc khi Kỹ thuật viên yêu cầu mua linh kiện đặc biệt ngoài danh mục.',
      checkpoints: [
        'Khi phát sinh thêm lỗi: Liên hệ khách hàng xin ý kiến, nếu khách đồng ý thì thêm dịch vụ bổ sung trực tiếp vào đơn tại Đơn sửa chữa (/repairs).',
        'Khi đơn ở trạng thái Chờ linh kiện (waiting_parts) cần mua gấp bên ngoài: Lập phiếu chi tiền mặt (CashTransaction) tại Sổ quỹ (/shifts) và bấm Xác nhận đã có linh kiện (fulfillSpecialPart) để mở lại đơn Đang sửa (in_repair) cho KTV.',
      ],
      handoverTo: 'Kỹ thuật viên tiếp tục hoàn tất sửa chữa và chuyển sang Kiểm định QC (/qc).',
    },
    {
      step: 5,
      title: 'Thu tiền (Tiền mặt / VietQR SePay / COD) & Trả máy hoàn tất (CheckoutHandoverModal)',
      moduleLabel: 'Đơn sửa chữa (/repairs)',
      moduleHref: '/repairs',
      statusTransition: {
        from: 'ready_for_return',
        to: 'Hoàn tất (completed)',
        statusType: 'ready',
      },
      description:
        'Ngay khi bộ phận QC duyệt Đạt, đơn chuyển sang Chờ trả khách (ready_for_return). CSKH thông báo khách nhận máy, thực hiện thu tiền và bàn giao thiết bị.',
      checkpoints: [
        'Mở CheckoutHandoverModal: Chọn thu Tiền mặt (tự động cộng vào két tiền mặt ca trực) hoặc hiển thị mã động VietQR SePay để khách quét chuyển khoản (Webhook SePay tự động khớp lệnh tức thì).',
        'Đối với đơn gửi tỉnh/giao hàng: Chọn gán phương thức COD Giao nhận hợp lệ trước khi bấm Hoàn tất trả máy (completed) và in phiếu xuất kho kiêm bảo hành điện tử.',
      ],
      handoverTo: 'Hệ thống tự động trừ tồn kho linh kiện, kích hoạt sổ Bảo hành điện tử (/warranty) và ghi nhận doanh thu.',
    },
    {
      step: 6,
      title: 'Chốt ca đối soát sổ quỹ cuối ngày & In biên bản bàn giao ca (CloseShiftModal)',
      moduleLabel: 'Sổ quỹ & Ca trực (/shifts)',
      moduleHref: '/shifts',
      statusTransition: {
        from: 'Ca trực Đang mở (open)',
        to: 'Đã chốt ca (closed)',
        statusType: 'gray',
      },
      description:
        'Cuối ca làm việc, Lễ tân/CSKH kiểm đếm toàn bộ tiền mặt thực tế trong két và thực hiện đóng ca đối soát minh bạch trước khi bàn giao.',
      checkpoints: [
        'Mở CloseShiftModal tại Sổ quỹ & Ca trực (/shifts): Hệ thống tự động tách bạch tổng thu Tiền mặt tại két và tổng thu Chuyển khoản VietQR SePay.',
        'Nhập số tiền mặt kiểm đếm thực tế, ghi chú giải trình nếu có chênh lệch, xác nhận Kết ca và in phiếu bàn giao ca K80 có chữ ký hai bên.',
      ],
      handoverTo: 'Lưu trữ biên bản chốt ca vào hệ thống để Quản trị viên (admin) đối soát tài chính.',
    },
  ],
  specialScenarios: [
    {
      id: 'cskh-warranty-rework',
      title: 'Tiếp nhận máy bảo hành (WarrantyClaim / Rework)',
      trigger:
        'Khách hàng mang thiết bị đã sửa tại cửa hàng quay lại kiểm tra do tái phát lỗi cũ trong thời hạn bảo hành điện tử.',
      statusLabel: 'Bảo hành / Rework',
      statusType: 'wait',
      resolutionSteps: [
        'Truy cập module Bảo hành (/warranty), nhập Mã đơn gốc, SĐT khách hàng hoặc số Serial/IMEI để kiểm tra thời hạn bảo hành điện tử của từng hạng mục.',
        'Đối chiếu tem bảo hành và tình trạng ngoại quan thực tế (đảm bảo thiết bị không bị rơi vỡ mạnh hoặc vào nước mới ngoài phạm vi bảo hành).',
        'Nhấn nút Tiếp nhận bảo hành (WarrantyClaim / Rework): Hệ thống tự động khởi tạo đơn bảo hành gắn kết với lịch sử linh kiện của đơn gốc và đẩy thẳng vào hàng đợi ưu tiên của Kỹ thuật viên.',
      ],
      relatedModule: 'Bảo hành (/warranty) & Đơn sửa chữa (/repairs)',
    },
    {
      id: 'cskh-refund-modal',
      title: 'Xử lý hoàn tiền khách hàng (RefundModal) tự động hoàn kho & ghi phiếu chi',
      trigger:
        'Đơn hàng đã thu tiền (tạm ứng hoặc đã thanh toán hoàn tất) nhưng phát sinh yêu cầu hủy dịch vụ hoặc hoàn tiền theo thỏa thuận với khách hàng.',
      statusLabel: 'Hoàn tiền & Hoàn kho',
      statusType: 'danger',
      resolutionSteps: [
        'Mở chi tiết đơn tại Đơn sửa chữa (/repairs) và chọn chức năng Hoàn tiền (RefundModal).',
        'Nhập số tiền hoàn trả, chọn phương thức hoàn tiền (Tiền mặt tại quầy hoặc Chuyển khoản) và nhập lý do hoàn tiền bắt buộc.',
        'Khi xác nhận hoàn tất: Hệ thống tự động hoàn trả tồn kho các linh kiện đã xuất trên đơn, tự động lập phiếu chi/hoàn trong Sổ quỹ ca trực (/shifts) và ghi vết Before / After Diff vào Nhật ký kiểm toán.',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) & Sổ quỹ & Ca trực (/shifts)',
    },
    {
      id: 'cskh-special-part-fulfill',
      title: 'Xử lý yêu cầu mua linh kiện đặc biệt ngoài của KTV & Lập phiếu chi tiền mặt',
      trigger:
        'Kỹ thuật viên gửi yêu cầu linh kiện đặc biệt ngoài danh mục (đơn chuyển sang waiting_parts) và cần Lễ tân/CSKH chi tiền mặt tại quầy để mua gấp linh kiện về lắp ngay trong ca.',
      statusLabel: 'Chờ linh kiện -> Đang sửa',
      statusType: 'progress',
      resolutionSteps: [
        'Kiểm tra thông tin linh kiện cần mua trên thẻ đơn đang ở trạng thái Chờ linh kiện (waiting_parts) tại Đơn sửa chữa (/repairs).',
        'Vào module Sổ quỹ & Ca trực (/shifts), lập Phiếu chi tiền mặt vận hành (CashTransaction) ghi rõ mã đơn và tên linh kiện mua ngoài để khấu trừ đúng quỹ tiền mặt tại két.',
        'Sau khi nhận linh kiện và bàn giao cho Kỹ thuật viên, bấm nút Xác nhận đã mua linh kiện ngoài (fulfillSpecialPart) trên đơn để chuyển trạng thái đơn từ waiting_parts về lại in_repair.',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) & Sổ quỹ & Ca trực (/shifts)',
    },
    {
      id: 'cskh-upsell-additional-service',
      title: 'Thêm dịch vụ bổ sung khi khách đồng ý sửa thêm bệnh phát sinh',
      trigger:
        'Trong quá trình tháo máy kiểm tra, Kỹ thuật viên phát hiện thêm lỗi phần cứng khác (ví dụ: chai pin kèm hỏng mic) và báo CSKH liên hệ tư vấn khách hàng.',
      statusLabel: 'Cập nhật báo giá đơn',
      statusType: 'new',
      resolutionSteps: [
        'Xem ghi chú chẩn đoán kỹ thuật của Kỹ thuật viên trên chi tiết đơn tại Đơn sửa chữa (/repairs) và gọi điện/nhắn Zalo thông báo rõ chi phí phát sinh cho khách.',
        'Khi khách xác nhận đồng ý: Mở phần Danh mục Dịch vụ trên đơn, bấm Thêm dịch vụ bổ sung (hoặc xóa dịch vụ khách không làm) để hệ thống tự động tính lại Tổng tiền phải thu.',
        'Ghi chú xác nhận khách đã duyệt giá mới để Kỹ thuật viên yên tâm thực hiện tiếp và đảm bảo số tiền khớp 100% khi tạo mã VietQR SePay lúc trả máy.',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) & Timeline (/timeline)',
    },
  ],
  rbacGuardrails: [
    {
      id: 'cskh-payment-guardrails',
      ruleTitle: 'Rào chắn Thanh toán Bắt buộc trước khi Hoàn tất Đơn (Payment Guardrails)',
      policyCode: 'repair-payment-guardrails',
      severity: 'strict',
      description:
        'Hệ thống chặn hoàn toàn thao tác chuyển trạng thái đơn sang Hoàn tất (completed) nếu số tiền khách đã thanh toán chưa đủ 100% tổng giá trị đơn hàng VÀ đơn chưa được gán phương thức COD Giao nhận hợp lệ.',
      reason:
        'Ngăn chặn tuyệt đối rủi ro trả máy quên thu tiền tại quầy, đảm bảo công nợ đơn hàng và số dư Sổ quỹ ca trực luôn chính xác 100%.',
    },
    {
      id: 'cskh-strict-branch-isolation',
      ruleTitle: 'Cô lập Dữ liệu Nghiêm ngặt theo Chi nhánh (Strict Branch Isolation)',
      policyCode: 'strict-branch-isolation',
      severity: 'strict',
      description:
        'Tài khoản Lễ tân/CSKH được gắn cố định với một chi nhánh cụ thể (hiển thị biểu tượng khóa trên Sidebar); chỉ được xem và thao tác trên đơn sửa chữa, sổ quỹ ca trực và bảo hành thuộc chi nhánh đó.',
      reason:
        'Đảm bảo tính độc lập về sổ quỹ tiền mặt, trách nhiệm quản lý thiết bị vật lý tại từng cơ sở và tránh nhầm lẫn đơn hàng liên chi nhánh.',
    },
    {
      id: 'cskh-hide-cost-price',
      ruleTitle: 'Bảo mật Giá vốn Linh kiện (Ẩn cost_price / COGS)',
      policyCode: 'cogs-privacy-and-financial-rbac',
      severity: 'warning',
      description:
        'Lễ tân/CSKH được quyền xem đầy đủ đơn giá bán dịch vụ, chiết khấu và tổng thu khách hàng để tư vấn báo giá, nhưng hệ thống ẩn hoàn toàn trường giá vốn nhập kho (cost_price) của linh kiện và biên lợi nhuận ròng.',
      reason:
        'Bảo mật cấu trúc giá nhập vật tư của chuỗi cửa hàng theo đúng phân tầng quyền hạn tài chính giữa Quầy lễ tân, Kho và Quản trị viên.',
    },
    {
      id: 'cskh-block-internal-tech-fsm',
      ruleTitle: 'Chặn Can thiệp Trạng thái Kỹ thuật & Kiểm định Nội bộ (FSM Role Gate)',
      policyCode: 'fsm-role-transition-guard',
      severity: 'strict',
      description:
        'Vai trò CSKH không được phép tự ý bấm chuyển các bước trạng thái chuyên môn nội bộ của Kỹ thuật viên và QC (như tự nhận sửa in_repair, tự đẩy waiting_qc hay tự duyệt rework_needed / ready_for_return khi chưa qua QC).',
      reason:
        'Giữ vững tính minh bạch của quy trình 6 bước khép kín, đảm bảo mọi thiết bị đều phải qua tay Kỹ thuật viên xử lý và QC nghiệm thu độc lập trước khi trả khách.',
    },
  ],
};

export default cskhGuideData;
