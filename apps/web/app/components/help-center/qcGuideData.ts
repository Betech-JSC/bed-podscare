import type { RoleGuideConfig } from './types';

export const qcGuideData: RoleGuideConfig = {
  roleKey: 'qc',
  tabLabel: 'Kiểm định QC',
  roleTitle: 'Chuyên viên Kiểm định Chất lượng Độc lập (QC Inspector)',
  badgeLabel: 'ROLE: QC · 5 MODULES KIỂM ĐỊNH ĐỘC LẬP',
  missionSummary:
    'Chốt chặn kiểm soát chất lượng độc lập trước khi thiết bị đến tay khách hàng: tiếp nhận máy ở trạng thái Chờ QC (waiting_qc), đối chiếu chéo yêu cầu ban đầu của khách hàng với ghi chú kỹ thuật (repair_note) và linh kiện đã thay (parts_used), thực hiện nghiệm thu toàn diện theo bộ Checklist tiêu chuẩn động từng dòng thiết bị Apple (/devices/checklist-template), và ra quyết định duyệt QC Đạt (ready_for_return) hoặc Yêu cầu làm lại (rework_needed).',
  dataScope:
    'Cô lập dữ liệu theo chi nhánh được phân công (Strict Branch Isolation): Truy cập đúng 5 module trên Sidebar khớp 100% với rolePermissions.qc gồm Kiểm định QC (/qc), Thiết bị (/devices), Tổng quan (/dashboard), Đơn sửa chữa (/repairs) và Timeline (/timeline).',
  financialVisibility:
    'Bảo mật giá vốn và độc lập tài chính (cogs-privacy-and-financial-rbac): Tập trung 100% vào hồ sơ kỹ thuật, lịch sử kiểm định và tiêu chuẩn chất lượng thiết bị; hệ thống ẩn hoàn toàn giá vốn nhập kho linh kiện (cost_price / COGS), không can thiệp vào sổ quỹ thu ngân và không tự ý xóa/sửa cấu hình hệ thống.',
  coreResponsibilities: [
    'Tiếp nhận danh sách thiết bị vừa được Kỹ thuật viên hoàn tất sửa chữa chuyển sang trạng thái Chờ QC (waiting_qc) tại bàn Kiểm định QC (/qc).',
    'Đối chiếu chặt chẽ 3 nguồn thông tin trên đơn: Mô tả lỗi tiếp nhận ban đầu của CSKH (issue_description), Ghi chú xử lý của Kỹ thuật viên (repair_note) và Linh kiện thực tế đã xuất dùng (parts_used).',
    'Thực hiện kiểm tra thực tế từng hạng mục theo bộ Checklist động (/devices/checklist-template) cho từng dòng máy Apple: Âm thanh & Mic, Chống ồn ANC/Transparency, Cảm biến tiệm cận/tháo tai, Pin & Dòng sạc, Kết nối Bluetooth & Ngoại quan vệ sinh.',
    'Ra quyết định nghiệm thu minh bạch: Duyệt QC Đạt (pass -> ready_for_return) để mở khóa bước trả máy cho CSKH, hoặc Đánh dấu Không đạt / Yêu cầu làm lại (fail -> rework_needed) kèm lý do lỗi bắt buộc (rework_reason).',
    'Giám sát lịch sử các vòng lặp sửa lại (multiple rework) và thẩm định nghiêm ngặt các ca thiết bị quay lại bảo hành (warranty) thông qua Đơn sửa chữa (/repairs), Thiết bị (/devices) và Timeline (/timeline).',
  ],
  modules: [
    {
      id: 'qc',
      label: 'Kiểm định QC',
      href: '/qc',
      group: 'VẬN HÀNH',
      summary:
        'Bàn kiểm định chất lượng trung tâm tại /qc: hiển thị danh sách máy đang ở trạng thái Chờ QC (waiting_qc), tự động tải bộ Checklist tiêu chuẩn động theo từng dòng thiết bị Apple (/devices/checklist-template) và thực hiện chấm điểm nghiệm thu (QC Đạt hoặc Yêu cầu làm lại).',
      subSections: [
        {
          title: '1. Danh sách Đơn hàng chờ kiểm định (waiting_qc — Chờ QC)',
          badge: 'Chờ QC (waiting_qc)',
          badgeType: 'wait',
          description:
            'Hiển thị toàn bộ các đơn vừa được Kỹ thuật viên bấm Hoàn thành sửa chuyển sang waiting_qc tại chi nhánh; tóm tắt nhanh mã đơn, tên thiết bị, tên Kỹ thuật viên phụ trách, lỗi tiếp nhận ban đầu và nội dung kỹ thuật đã xử lý (repair_note).',
        },
        {
          title: '2. Cửa sổ Thẩm định Chất lượng & Checklist Động (/devices/checklist-template)',
          badge: 'Đạt / Không đạt từng tiêu chí',
          badgeType: 'progress',
          description:
            'Tự động nạp danh sách tiêu chí kiểm tra chức năng theo đúng model thiết bị (device_model_id) hoặc danh mục (AirPods, Apple Watch, Apple Pencil, MacBook, iPad); cho phép tích chọn ĐẠT / KHÔNG ĐẠT trên từng tiêu chí, nhập lý do bắt buộc (rework_reason) khi có hạng mục lỗi và ghi chú thẩm định QC (qc_note).',
        },
        {
          title: '3. Khu vực Lịch sử kiểm định gần đây (ready_for_return, rework_needed, completed)',
          badge: 'Đối soát lịch sử QC',
          badgeType: 'ready',
          description:
            'Lưu trữ danh sách các đơn đã qua thẩm định QC (Sẵn sàng trả, Cần sửa lại, Hoàn tất) có phân trang để chuyên viên QC tra cứu nhanh kết quả những ca máy vừa nghiệm thu trong ca.',
        },
      ],
      keyActions: [
        'Chọn thẻ đơn đang ở trạng thái Chờ QC (waiting_qc) và nhấn nút "Tiến hành kiểm định QC" để mở cửa sổ thẩm định.',
        'Kiểm tra thông tin tóm tắt từ Kỹ thuật viên: Lỗi ban đầu, Linh kiện đã dùng (parts_used) và Ghi chú Kỹ thuật (repair_note).',
        'Thực hiện đo kiểm thực tế và tích đánh giá ĐẠT / KHÔNG ĐẠT cho từng tiêu chí trong bộ Checklist tiêu chuẩn động của thiết bị.',
        'Nhấn "Xác nhận QC ĐẠT -> Sẵn sàng trả máy" (khi đạt 100% tiêu chí) để chuyển đơn sang Chờ trả khách (ready_for_return).',
        'Nhấn "Từ chối QC · Yêu cầu sửa lại" kèm nhập rõ Lý do không đạt (rework_reason) để trả đơn về trạng thái Yêu cầu làm lại (rework_needed).',
      ],
    },
    {
      id: 'devices',
      label: 'Thiết bị',
      href: '/devices',
      group: 'VẬN HÀNH',
      summary:
        'Thư viện danh mục thiết bị Apple (AirPods, Apple Watch, Apple Pencil, MacBook, iPad) và bộ tiêu chí Checklist chuẩn của từng dòng máy (chế độ chỉ xem tra cứu quy chuẩn dành cho QC).',
      subSections: [
        {
          title: 'Danh mục 5 nhóm thiết bị Apple & Mã Model (model_code)',
          badge: 'Chuẩn hóa theo đời máy',
          badgeType: 'new',
          description:
            'Phân nhóm chi tiết theo danh mục (AirPods, Apple Watch, Apple Pencil, MacBook, iPad) kèm mã model phần cứng (ví dụ: A2698, Lightning, USB-C) để QC nhận diện đúng đặc thù kỹ thuật của từng đời máy.',
        },
        {
          title: 'Bộ tiêu chí Checklist chuẩn (checklist_templates — Chế độ tra cứu cho QC)',
          badge: 'Tiêu chuẩn nghiệm thu',
          badgeType: 'ready',
          description:
            'Hiển thị danh sách đầy đủ các hạng mục kiểm tra chức năng được chuẩn hóa cho từng dòng sản phẩm dùng chung giữa bước tiếp nhận CSKH và bước nghiệm thu xuất xưởng tại bàn QC.',
        },
      ],
      keyActions: [
        'Tra cứu danh mục thiết bị Apple (AirPods, Apple Watch, Apple Pencil, MacBook, iPad) và mã model phần cứng tương ứng.',
        'Xem và đối chiếu bộ tiêu chí Checklist chuẩn (checklist_templates) của từng dòng máy để áp dụng thống nhất khi kiểm định.',
        'Tuân thủ chế độ chỉ xem tra cứu đối với nhân sự QC: không tự ý xóa hoặc thay đổi cấu hình danh mục thiết bị dùng chung của toàn hệ thống.',
      ],
    },
    {
      id: 'dashboard',
      label: 'Tổng quan',
      href: '/dashboard',
      group: 'WORKSPACE',
      summary:
        'Bảng điều khiển theo dõi nhanh số lượng đơn đang chờ kiểm định chất lượng tại chi nhánh, nhịp độ luân chuyển máy từ xưởng kỹ thuật sang bàn QC và tình hình hoàn thành đơn trong ngày.',
      keyActions: [
        'Quan sát nhanh chỉ số lượng đơn đang ở trạng thái Chờ QC (waiting_qc) cần ưu tiên xử lý ngay.',
        'Theo dõi lưu lượng máy đang sửa tại bàn kỹ thuật (in_repair) để chủ động chuẩn bị dụng cụ test và phân bổ thời gian nghiệm thu.',
        'Nắm bắt tỷ lệ đơn đã duyệt Chờ trả khách (ready_for_return) và các cảnh báo vận hành chung trong ca làm việc tại chi nhánh.',
      ],
    },
    {
      id: 'repairs',
      label: 'Đơn sửa chữa',
      href: '/repairs',
      group: 'WORKSPACE',
      summary:
        'Tra cứu chi tiết hồ sơ đơn sửa chữa để đối chiếu toàn diện tình trạng tiếp nhận ban đầu của CSKH (ngoại quan từng bộ phận Tai trái / Tai phải / Hộp sạc) với ghi chú kỹ thuật (repair_note) và linh kiện đã thay (parts_used).',
      keyActions: [
        'Mở hồ sơ chi tiết đơn sửa chữa để xem lại biên bản tiếp nhận ban đầu của CSKH và ghi chú ngoại quan trước khi tháo máy.',
        'Đối chiếu danh sách dịch vụ khách hàng yêu cầu với danh mục linh kiện Kỹ thuật viên đã kê khai xuất dùng (parts_used) và ghi chú kỹ thuật (repair_note).',
        'Kiểm tra xem đơn hàng thuộc loại Tiếp nhận tại quầy, Ship COD tỉnh hay đơn Bảo hành (warranty) để áp dụng mức độ kiểm tra tương ứng.',
      ],
    },
    {
      id: 'timeline',
      label: 'Timeline',
      href: '/timeline',
      group: 'WORKSPACE',
      summary:
        'Theo dõi trực quan lịch sử các lần chuyển trạng thái của đơn hàng, kiểm soát số vòng lặp kiểm định (rework) và nhật ký bàn giao giữa Kỹ thuật viên và chuyên viên QC.',
      keyActions: [
        'Theo dõi thời điểm Kỹ thuật viên bắt đầu sửa (in_repair) và thời điểm bấm hoàn tất chuyển sang Chờ QC (waiting_qc).',
        'Kiểm tra lịch sử các vòng lặp Yêu cầu làm lại (rework_needed -> in_repair -> waiting_qc) để biết thiết bị đã bị trả về bao nhiêu lần.',
        'Đọc lại nhật ký bàn giao và các ghi chú lỗi trước đó giữa Kỹ thuật viên và QC để thẩm định trọng tâm vào điểm lỗi tái phát.',
      ],
    },
  ],
  dailyWorkflow: [
    {
      step: 1,
      title: 'Tiếp nhận đơn ở trạng thái Chờ QC (waiting_qc) & Kiểm tra khay thiết bị vật lý',
      moduleLabel: 'Kiểm định QC (/qc) & Tổng quan (/dashboard)',
      moduleHref: '/qc',
      statusTransition: {
        from: 'Đang sửa (in_repair)',
        to: 'Chờ QC (waiting_qc)',
        statusType: 'wait',
      },
      description:
        'Khi Kỹ thuật viên bấm Hoàn thành sửa tại /tech, đơn hàng tự động chuyển sang trạng thái Chờ QC (waiting_qc) và xuất hiện ngay trong danh sách Đơn hàng chờ kiểm định tại /qc kèm số lượng badge trên Sidebar.',
      checkpoints: [
        'Nhận khay thiết bị vật lý từ bàn Kỹ thuật viên, đối chiếu đúng mã đơn (order_code), số Serial/IMEI trên tem khay nhiệt K80 và đủ các thành phần đi kèm (Tai trái, Tai phải, Hộp sạc, Dây đeo/Bút).',
        'Ưu tiên kiểm định trước các đơn khách đang đợi lấy ngay tại quầy, đơn bảo hành hoặc đơn vừa được Kỹ thuật viên xử lý lại (Rework).',
      ],
      handoverTo: 'Đưa thiết bị vào bàn đo kiểm QC và mở hồ sơ đối chiếu thông tin.',
    },
    {
      step: 2,
      title: 'Đối chiếu yêu cầu sửa chữa ban đầu, ghi chú kỹ thuật (repair_note) & linh kiện đã thay (parts_used)',
      moduleLabel: 'Kiểm định QC (/qc) & Đơn sửa chữa (/repairs)',
      moduleHref: '/qc',
      statusTransition: {
        from: 'Chờ QC (waiting_qc)',
        to: 'Đang đối chiếu hồ sơ kỹ thuật',
        statusType: 'progress',
      },
      description:
        'Trước khi test chức năng, chuyên viên QC bắt buộc thực hiện bước đối chiếu chéo 3 chiều giữa yêu cầu của khách hàng, giải pháp của Kỹ thuật viên và vật tư đã xuất kho.',
      checkpoints: [
        'Đọc kỹ trường Lỗi ban đầu (issue_description) và tình trạng ngoại quan lúc CSKH tiếp nhận tại /repairs để đảm bảo không bỏ sót bất kỳ yêu cầu nào của khách.',
        'Kiểm tra trường Nội dung Kỹ thuật đã sửa (repair_note) để nắm rõ Kỹ thuật viên đã can thiệp vào bộ phận nào (Tai trái L, Tai phải R, Hộp sạc Case hay IC nguồn/cảm biến).',
        'Kiểm tra mục Linh kiện đã dùng (parts_used) để xác nhận Kỹ thuật viên đã kê khai đúng và đủ linh kiện thực tế lắp vào máy.',
      ],
      handoverTo: 'Mở cửa sổ Thẩm định chất lượng trên /qc để tải bộ Checklist động theo dòng máy.',
    },
    {
      step: 3,
      title: 'Thực hiện Checklist kiểm định động theo 5 nhóm hạng mục tiêu chuẩn thiết bị Apple',
      moduleLabel: 'Kiểm định QC (/qc — Cửa sổ Thẩm định QC)',
      moduleHref: '/qc',
      statusTransition: {
        from: 'Chờ QC (waiting_qc)',
        to: 'Đang đo kiểm theo Checklist động',
        statusType: 'progress',
      },
      description:
        'Nhấn nút "Tiến hành kiểm định QC": Hệ thống tự động gọi API /devices/checklist-template để nạp bộ tiêu chí chuẩn theo đúng dòng máy. QC thực hiện test thực tế từng nhóm hạng mục phần cứng và ngoại quan.',
      checkpoints: [
        'Nhóm 1 — Âm thanh & Micro: Nghe thử ở nhiều mức âm lượng (50% - 100%) đảm bảo âm lượng hai bên L/R cân bằng, dải bass/treble trong trẻo không rè âm; thu âm thử kiểm tra Micro đàm thoại nghe rõ và lọc gió tốt.',
        'Nhóm 2 — Chống ồn chủ động ANC & Xuyên âm (Transparency): Chuyển đổi qua lại giữa các chế độ Kiểm soát tiếng ồn, đảm bảo không bị hú rít, không có tiếng sôi nền (white noise) hoặc lệch áp suất tai.',
        'Nhóm 3 — Cảm biến tiệm cận / Tháo tai & Cảm ứng: Kiểm tra cảm biến tự động dừng/phát nhạc khi tháo/đeo tai (In-ear detection), thao tác bóp/gõ chạm trên thân tai nghe hoặc cảm ứng màn hình/Digital Crown trên Apple Watch.',
        'Nhóm 4 — Pin & Dòng sạc: Kiểm tra dòng sạc vào Hộp sạc (Lightning / USB-C / MagSafe) và tốc độ nhận sạc của từng bên tai nghe/đồng hồ; theo dõi độ ổn định phần trăm pin, đảm bảo máy không nóng bất thường.',
        'Nhóm 5 — Kết nối Bluetooth & Ngoại quan vệ sinh: Test kết nối ổn định trong cự ly 10m và đóng/mở nắp hộp sạc nhận pop-up nhạy; soi kỹ đường ghép vỏ khít đẹp, sạch hoàn toàn vết keo thừa và bụi bẩn trên màng loa.',
      ],
      handoverTo: 'Tích giữ ĐẠT cho các tiêu chí hoàn hảo hoặc bỏ tích (KHÔNG ĐẠT) ngay tại tiêu chí phát hiện lỗi.',
    },
    {
      step: 4,
      title: 'Ra quyết định nghiệm thu độc lập: Duyệt QC Đạt (pass) hoặc Yêu cầu làm lại (fail)',
      moduleLabel: 'Kiểm định QC (/qc)',
      moduleHref: '/qc',
      statusTransition: {
        from: 'Chờ QC (waiting_qc)',
        to: 'Chờ trả khách (ready_for_return) / Yêu cầu làm lại (rework_needed)',
        statusType: 'ready',
      },
      description:
        'Dựa trên kết quả tích chọn Checklist động, chuyên viên QC đưa ra phán quyết cuối cùng thông qua 1 trong 2 nhánh quyết định trên cửa sổ thẩm định.',
      checkpoints: [
        'Nhánh Duyệt QC Đạt (pass): Chỉ mở khóa khi 100% tiêu chí trong Checklist đều được đánh dấu ĐẠT; bấm "Xác nhận QC ĐẠT -> Sẵn sàng trả máy" để chuyển đơn sang ready_for_return.',
        'Nhánh Từ chối QC / Yêu cầu làm lại (fail): Khi có bất kỳ tiêu chí nào KHÔNG ĐẠT, bắt buộc nhập rõ nguyên nhân lỗi vào ô Lý do không đạt (rework_reason) và bấm "Từ chối QC · Yêu cầu sửa lại" để trả đơn về rework_needed.',
      ],
      handoverTo: 'Hệ thống tự động đồng bộ trạng thái đơn sang Quầy CSKH (nếu Đạt) hoặc Bàn Kỹ thuật viên (nếu Không đạt).',
    },
    {
      step: 5,
      title: 'Theo dõi lịch sử kiểm định, giám sát vòng lặp Rework & Bàn giao khay máy',
      moduleLabel: 'Kiểm định QC (/qc) & Timeline (/timeline)',
      moduleHref: '/timeline',
      statusTransition: {
        from: 'Đã chấm điểm QC',
        to: 'Lưu biên bản QC & Bàn giao vật lý',
        statusType: 'ready',
      },
      description:
        'Sau khi lưu kết quả trên hệ thống, chuyên viên QC phân loại khay thiết bị vật lý đúng luồng và theo dõi tiến độ các đơn phải sửa lại trên Timeline.',
      checkpoints: [
        'Đối với máy Đạt QC (ready_for_return): Chuyển khay máy sang Kệ chờ trả khách tại quầy Lễ tân/CSKH để CSKH thu tiền và bàn giao cho khách.',
        'Đối với máy Không đạt QC (rework_needed): Chuyển trả khay máy trực tiếp về Bàn làm việc của đúng Kỹ thuật viên phụ trách kèm trao đổi nhanh điểm lỗi cần khắc phục.',
      ],
      handoverTo: 'Khép kín bước 4 trong luồng vận hành 6 bước chuẩn của FIXO Repair OS.',
    },
  ],
  specialScenarios: [
    {
      id: 'qc-decision-pass-ready-for-return',
      title: 'Nhánh (a): Duyệt QC Đạt (pass) — Chuyển sang Chờ trả khách & Kích hoạt thông báo CSKH',
      trigger:
        'Thiết bị vượt qua 100% các tiêu chí trong bộ Checklist kiểm định (isAllPassed === true), lỗi ban đầu đã được xử lý triệt để và ngoại quan vệ sinh sạch đẹp.',
      statusLabel: 'Chờ trả khách (ready_for_return)',
      statusType: 'ready',
      resolutionSteps: [
        'Đảm bảo toàn bộ các dòng tiêu chí trong cửa sổ Thẩm định chất lượng (/qc) đều đang ở trạng thái ĐẠT (màu xanh Calm Jade).',
        'Nhập thêm nhận xét tổng quan vào ô Ghi chú thẩm định QC (qc_note) nếu cần lưu ý CSKH khi tư vấn khách lúc trả máy.',
        'Nhấn nút "Xác nhận QC ĐẠT -> Sẵn sàng trả máy": Hệ thống gọi qcService.createInspection với result: "pass" và chuyển trạng thái đơn từ waiting_qc sang ready_for_return.',
        'Đơn hàng lập tức hiển thị trong danh sách Máy chờ trả khách tại màn hình Tổng quan (/dashboard) và Đơn sửa chữa (/repairs) của bộ phận CSKH để tiến hành thu tiền (Tiền mặt / VietQR SePay / COD) và trả máy.',
      ],
      relatedModule: 'Kiểm định QC (/qc) -> Đơn sửa chữa (/repairs) & Tổng quan (/dashboard)',
    },
    {
      id: 'qc-decision-fail-rework-needed',
      title: 'Nhánh (b): Đánh dấu Không đạt / Yêu cầu làm lại (fail / rework_needed) — Trả về đúng KTV',
      trigger:
        'Phát hiện bất kỳ hạng mục nào chưa đạt yêu cầu (ví dụ: tai trái còn rè ở âm lượng trên 80%, chống ồn ANC bị hú nhẹ, hở keo viền hộp sạc, hoặc Kỹ thuật viên chưa kê khai đủ linh kiện).',
      statusLabel: 'Yêu cầu làm lại (rework_needed)',
      statusType: 'danger',
      resolutionSteps: [
        'Nhấp vào tiêu chí bị lỗi trên bảng Checklist để chuyển trạng thái dòng đó sang KHÔNG ĐẠT (hệ thống tự động khóa nút Xác nhận QC ĐẠT và mở khung nhập lý do lỗi màu đỏ nhạt).',
        'Nhập mô tả lỗi cụ thể, rõ ràng vào trường bắt buộc "Lý do không đạt / Yêu cầu Kỹ Thuật xử lý lại *" (rework_reason) — nêu rõ bộ phận nào lỗi và biểu hiện ở điều kiện test nào.',
        'Nhấn nút "Từ chối QC · Yêu cầu sửa lại": Hệ thống lưu biên bản kiểm định với result: "fail", lùi trạng thái đơn từ waiting_qc về rework_needed.',
        'Đơn hàng tự động trả ngược về đầu phân vùng "Bàn làm việc của tôi" của đúng Kỹ thuật viên phụ trách (technician_id) tại /tech kèm nhãn cảnh báo đỏ Yêu cầu làm lại.',
      ],
      relatedModule: 'Kiểm định QC (/qc) -> Không gian Kỹ thuật (/tech)',
    },
    {
      id: 'qc-warranty-and-multiple-rework',
      title: 'Kiểm định thiết bị quay lại Bảo hành (warranty) hoặc đơn sửa lại nhiều lần (multiple rework)',
      trigger:
        'Đơn hàng có nguồn tiếp nhận là Bảo hành (warranty) do khách mang máy quay lại vì tái phát lỗi cũ, hoặc đơn đã bị trả về rework_needed từ 2 lần trở lên trong cùng một ca.',
      statusLabel: 'Thẩm định Nghiêm ngặt / Burn-in Test',
      statusType: 'wait',
      resolutionSteps: [
        'Mở module Timeline (/timeline) và Đơn sửa chữa (/repairs) để đọc toàn bộ lịch sử các lần sửa chữa trước, các ghi chú lỗi QC cũ (qc_note / rework_reason) và linh kiện đã từng thay thế.',
        'Thực hiện kiểm tra tải kéo dài (burn-in test): cho thiết bị phát nhạc liên tục ở chế độ bật ANC từ 15 - 30 phút để kiểm tra độ sụt pin thực tế và hiện tượng ngắt kết nối ngầm.',
        'Đối chiếu chéo độ cân bằng âm thanh và dòng sạc giữa hai bên tai nghe với thông số chuẩn của dòng máy tại module Thiết bị (/devices).',
        'Chỉ bấm duyệt QC Đạt khi xác nhận lỗi tái phát đã được xử lý tận gốc; ghi rõ kết quả burn-in test vào ô Ghi chú thẩm định QC (qc_note).',
      ],
      relatedModule: 'Kiểm định QC (/qc), Timeline (/timeline) & Đơn sửa chữa (/repairs)',
    },
    {
      id: 'qc-reference-device-checklist-standards',
      title: 'Tra cứu & Đối chiếu mẫu Checklist tiêu chuẩn theo dòng máy tại module Thiết bị (/devices)',
      trigger:
        'Khi kiểm định một dòng thiết bị Apple mới/ít gặp hoặc cần kiểm tra xem bộ tiêu chí Checklist chuẩn của model đó gồm những hạng mục bắt buộc nào.',
      statusLabel: 'Tra cứu Chuẩn (/devices)',
      statusType: 'new',
      resolutionSteps: [
        'Truy cập module Thiết bị (/devices) trên Sidebar và chọn danh mục tương ứng (AirPods, Apple Watch, Apple Pencil, MacBook hoặc iPad).',
        'Tìm đúng tên dòng máy và mã model (model_code) để xem danh sách các thẻ tiêu chí kiểm tra chức năng (checklist_templates) đang áp dụng.',
        'Nếu phát hiện dòng máy chưa được cấu hình đủ tiêu chí kiểm định chuyên sâu, ghi nhận đề xuất và báo cho Quản trị viên (admin) cập nhật bổ sung.',
      ],
      relatedModule: 'Thiết bị (/devices) <-> Kiểm định QC (/qc)',
    },
  ],
  rbacGuardrails: [
    {
      id: 'qc-independent-gatekeeper',
      ruleTitle: 'Chốt chặn Kiểm định Độc lập trước khi Trả khách (Independent QC Gatekeeper)',
      policyCode: 'independent-qc-gatekeeper',
      severity: 'strict',
      description:
        'Mọi đơn sửa chữa sau khi Kỹ thuật viên hoàn tất (waiting_qc) bắt buộc phải đi qua bước nghiệm thu độc lập của vai trò QC (hoặc Admin) tại /qc mới có thể chuyển sang trạng thái Chờ trả khách (ready_for_return); Kỹ thuật viên và CSKH không thể tự ý bỏ qua bước QC.',
      reason:
        'Đảm bảo nguyên tắc phân tách trách nhiệm (Segregation of Duties): người trực tiếp sửa máy không tự nghiệm thu sản phẩm của mình, giữ vững chất lượng đồng nhất trước khi bàn giao cho khách hàng.',
    },
    {
      id: 'qc-mandatory-rework-reason',
      ruleTitle: 'Bắt buộc Ghi rõ Lý do Lỗi Kỹ thuật khi Đánh trượt QC (Mandatory Rework Reason)',
      policyCode: 'mandatory-rework-reason',
      severity: 'strict',
      description:
        'Khi đánh dấu bất kỳ tiêu chí nào là KHÔNG ĐẠT và bấm Từ chối QC (chuyển đơn về rework_needed), hệ thống bắt buộc chuyên viên QC phải nhập nội dung lý do lỗi cụ thể (rework_reason); nếu để trống hệ thống sẽ chặn thao tác gửi.',
      reason:
        'Cung cấp căn cứ kỹ thuật minh bạch giúp Kỹ thuật viên nắm bắt chính xác điểm lỗi cần khắc phục ngay lập tức, đồng thời làm dữ liệu đối soát tỷ lệ Rework trong báo cáo Hiệu suất KPI.',
    },
    {
      id: 'qc-strict-branch-isolation',
      ruleTitle: 'Cô lập Dữ liệu Nghiêm ngặt theo Chi nhánh Phân công (Strict Branch Isolation)',
      policyCode: 'strict-branch-isolation',
      severity: 'strict',
      description:
        'Tài khoản chuyên viên QC được gắn cố định với một mã chi nhánh (branch_id); danh sách Đơn chờ kiểm định tại /qc, Đơn sửa chữa (/repairs), Tổng quan (/dashboard) và Timeline (/timeline) chỉ hiển thị dữ liệu của đúng chi nhánh đó.',
      reason:
        'Đảm bảo chuyên viên QC chỉ nghiệm thu các khay thiết bị vật lý thực tế đang có mặt tại xưởng của cơ sở mình, tránh nhầm lẫn trạng thái đơn hàng giữa các chi nhánh.',
    },
    {
      id: 'qc-financial-and-config-rbac',
      ruleTitle: 'Bảo mật Giá vốn Linh kiện (cost_price) & Chế độ Chỉ xem Cấu hình Thiết bị',
      policyCode: 'cogs-privacy-and-financial-rbac',
      severity: 'warning',
      description:
        'Hệ thống ẩn hoàn toàn giá vốn nhập kho linh kiện (cost_price / COGS), không cấp quyền truy cập Sổ quỹ (/shifts) hay Thanh toán (/payments) cho vai trò QC; tại module Thiết bị (/devices), nhân sự QC chỉ thực hiện tra cứu danh mục và mẫu Checklist mà không tự ý xóa/sửa cấu hình hệ thống.',
      reason:
        'Bảo vệ bí mật giá vốn linh kiện của chuỗi cửa hàng và bảo toàn tính toàn vẹn của bộ tiêu chuẩn Checklist dùng chung trên toàn hệ thống.',
    },
  ],
};

export default qcGuideData;
