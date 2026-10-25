import type { RoleGuideConfig } from './types';

export const techGuideData: RoleGuideConfig = {
  roleKey: 'tech',
  tabLabel: 'Kỹ thuật viên',
  roleTitle: 'Kỹ thuật viên Sửa chữa Chuyên sâu (Tech / Technician Workbench)',
  badgeLabel: 'ROLE: TECH · 1 WORKSPACE CHUYÊN BIỆT (/TECH)',
  missionSummary:
    'Chịu trách nhiệm trực tiếp về chất lượng kỹ thuật phần cứng tại xưởng: nhận máy từ Hàng đợi chờ sửa kèm âm báo thời gian thực, in tem khay nhiệt K80 định danh thiết bị, chẩn đoán chuyên sâu độc lập cho từng thành phần (Tai trái, Tai phải, Hộp sạc, Apple Watch, Apple Pencil), bóc tách linh kiện kho sử dụng (parts_used), phối hợp yêu cầu linh kiện đặc biệt hoặc bàn giao ca minh bạch và bàn giao máy hoàn chỉnh sang bộ phận Kiểm định Chất lượng (QC).',
  dataScope:
    'Tập trung 100% tại module duy nhất Không gian Kỹ thuật (/tech, nhóm VẬN HÀNH) khớp với rolePermissions.tech, chia thành 3 phân vùng tác nghiệp: Hàng đợi chờ sửa (waiting_tech), Bàn làm việc của tôi (in_repair, waiting_parts, rework_needed) và Lịch sử đã hoàn thành trong phạm vi 7 ngày gần nhất (today, 3_days, 7_days).',
  financialVisibility:
    'Bảo mật RBAC tuyệt đối (cogs-privacy-and-financial-rbac): Hệ thống ẩn 100% giá bán dịch vụ, tổng tiền đơn hàng, giá vốn linh kiện nhập kho (cost_price / COGS) và doanh thu trên cả Backend API lẫn giao diện Frontend; chặn quyền tự ý thêm hoặc xóa các dịch vụ có giá tiền.',
  coreResponsibilities: [
    'Theo dõi Hàng đợi chờ sửa (waiting_tech) có âm báo realtime khi Lễ tân/CSKH vừa bàn giao máy; bấm "Nhận đơn" để tự động gán technician_id, chuyển đơn sang Đang sửa (in_repair) và in tem khay nhiệt K80.',
    'Thực hiện chẩn đoán kỹ thuật chuyên sâu và ghi nhận tình trạng chi tiết vào repair_note riêng cho từng thành phần: Tai trái (L), Tai phải (R), Hộp sạc (Case), Apple Watch hoặc Apple Pencil.',
    'Khai báo chính xác danh mục linh kiện cần dùng (parts_needed) và bóc tách linh kiện xuất kho thực tế đã thay thế (parts_used) trong TechOrderDetailModal trước khi hoàn tất.',
    'Gửi Yêu cầu linh kiện đặc biệt ngoài danh mục qua SpecialPartsRequestModal (chuyển đơn sang waiting_parts) khi gặp ca bệnh cần vật tư hiếm chưa có sẵn trong kho.',
    'Thực hiện Bàn giao đơn giữa ca minh bạch qua HandoverTechModal (với 4 lý do chuẩn hóa: wrong_order, complex_repair, shift_change, missing_parts_tools) hoặc xử lý ưu tiên đơn Yêu cầu làm lại (rework_needed) khi QC trả về.',
  ],
  modules: [
    {
      id: 'tech',
      label: 'Không gian Kỹ thuật',
      href: '/tech',
      group: 'VẬN HÀNH',
      summary:
        'Bàn làm việc kỹ thuật chuyên biệt duy nhất của Kỹ thuật viên tại đường dẫn /tech: tích hợp đầy đủ 3 phân vùng quản lý luồng máy sửa chữa, bộ lọc phạm vi ca trực 7 ngày (Hôm nay / 3 ngày / 7 ngày), in tem khay nhiệt K80, bóc tách linh kiện kho và điều phối bàn giao nội bộ.',
      subSections: [
        {
          title: '1. Phân vùng Hàng đợi chờ sửa (waiting_tech — Chờ kỹ thuật)',
          badge: 'Chờ kỹ thuật (waiting_tech)',
          badgeType: 'wait',
          description:
            'Hiển thị toàn bộ thiết bị vừa được CSKH tiếp nhận và bàn giao xuống xưởng kèm thông báo âm báo realtime; xem nhanh mô tả bệnh ban đầu theo từng thành phần (Tai trái / Tai phải / Hộp sạc / Đồng hồ), bấm "Nhận đơn" để tự động gán technician_id của bạn, chuyển trạng thái sang Đang sửa (in_repair) và in ngay tem khay nhiệt K80.',
        },
        {
          title:
            '2. Phân vùng Bàn làm việc của tôi (in_repair — Đang sửa, waiting_parts — Chờ linh kiện, rework_needed — Yêu cầu làm lại)',
          badge: 'Đang sửa / Chờ linh kiện / Rework',
          badgeType: 'progress',
          description:
            'Quản lý tập trung các đơn hàng kỹ thuật viên đang trực tiếp phụ trách xử lý: mở TechOrderDetailModal để cập nhật ghi chú kỹ thuật (repair_note), khai báo linh kiện dự kiến (parts_needed), bóc tách linh kiện xuất kho thực tế (parts_used), mở SpecialPartsRequestModal yêu cầu mua linh kiện đặc biệt ngoài, mở HandoverTechModal bàn giao đơn hoặc xử lý ưu tiên đơn QC yêu cầu làm lại (rework_needed).',
        },
        {
          title:
            '3. Phân vùng Lịch sử đã hoàn thành (waiting_qc, ready_for_return, completed trong 7 ngày gần nhất)',
          badge: 'Tra cứu 7 ngày (today / 3_days / 7_days)',
          badgeType: 'ready',
          description:
            'Lưu trữ danh sách các ca bệnh kỹ thuật viên vừa hoàn tất sửa chữa (đang ở trạng thái Chờ QC waiting_qc, Chờ trả khách ready_for_return hoặc Hoàn tất completed) trong phạm vi tối đa 7 ngày gần nhất (today, 3_days, 7_days) để đối chiếu lại thông số kỹ thuật, linh kiện đã thay hoặc hỗ trợ giải đáp nhanh khi bộ phận QC kiểm định.',
        },
      ],
      keyActions: [
        'Bấm "Nhận đơn" tại Hàng đợi chờ sửa (waiting_tech) để tự động gán technician_id, chuyển đơn sang in_repair và in tem khay nhiệt K80 dán lên khay linh kiện.',
        'Mở TechOrderDetailModal để ghi nhận chẩn đoán chuyên sâu (repair_note), định mức linh kiện cần dùng (parts_needed) và kê khai mã SKU linh kiện xuất kho thực tế (parts_used).',
        'Kích hoạt SpecialPartsRequestModal khi cần yêu cầu CSKH/Thủ kho/Admin mua linh kiện đặc biệt ngoài danh mục (tự động tạm dừng đơn sang waiting_parts).',
        'Kích hoạt HandoverTechModal để bàn giao đơn đang sửa cho kỹ thuật viên khác cùng chi nhánh hoặc trả về Hàng đợi chung kèm lý do bắt buộc.',
        'Xử lý ưu tiên các đơn gắn nhãn Yêu cầu làm lại (rework_needed) kèm lý do lỗi cụ thể (rework_reason) từ QC và bấm "Hoàn thành sửa" để đẩy đơn sang Chờ QC (waiting_qc).',
      ],
    },
  ],
  dailyWorkflow: [
    {
      step: 1,
      title: 'Nhận máy từ Hàng đợi chờ sửa & In tem khay nhiệt K80',
      moduleLabel: 'Không gian Kỹ thuật (/tech — Hàng đợi chờ sửa)',
      moduleHref: '/tech',
      statusTransition: {
        from: 'Chờ kỹ thuật (waiting_tech)',
        to: 'Đang sửa (in_repair)',
        statusType: 'progress',
      },
      description:
        'Khi Lễ tân/CSKH chuyển đơn sang Chờ kỹ thuật (waiting_tech), hệ thống phát âm báo thông báo đơn mới tại Hàng đợi chờ sửa. Kỹ thuật viên kiểm tra khay máy vật lý, đọc kỹ yêu cầu ban đầu và bấm nhận việc.',
      checkpoints: [
        'Xem thông tin mô tả lỗi tiếp nhận ban đầu (test_note / appearance_notes) theo từng bộ phận: Tai trái (L), Tai phải (R), Hộp sạc (Case), Apple Watch hoặc Apple Pencil.',
        'Nhấn nút "Nhận đơn": Hệ thống tự động gán technician_id cho tài khoản của bạn, ghi nhận mốc thời gian tech_accepted_at / repair_started_at và chuyển đơn sang phân vùng Bàn làm việc của tôi (in_repair).',
        'Bấm in tem khay nhiệt K80 (handlePrintRoutingSlip) để dán định danh lên khay đựng thiết bị và linh kiện tháo rời, tránh thất lạc hoặc nhầm lẫn giữa các ca máy.',
      ],
      handoverTo: 'Thiết bị được định danh trên khay kỹ thuật cá nhân và chuyển vào Bàn làm việc của tôi.',
    },
    {
      step: 2,
      title: 'Chẩn đoán chuyên sâu & Ghi nhận tình trạng riêng cho Tai trái / Tai phải / Hộp sạc / Đồng hồ',
      moduleLabel: 'Không gian Kỹ thuật (/tech — TechOrderDetailModal)',
      moduleHref: '/tech',
      statusTransition: {
        from: 'Đang sửa (in_repair)',
        to: 'Đang chẩn đoán & Xử lý phần cứng',
        statusType: 'progress',
      },
      description:
        'Tiến hành đo kiểm dòng sạc, kiểm tra vi mạch, màng loa, micro, cảm biến và đối chiếu với mô tả ban đầu của CSKH để xác định chính xác nguyên nhân lỗi phần cứng.',
      checkpoints: [
        'Mở cửa sổ chi tiết kỹ thuật (TechOrderDetailModal) trên thẻ đơn tại Bàn làm việc của tôi.',
        'Ghi chép rõ kết quả đo kiểm và phương án xử lý kỹ thuật vào trường Ghi chú kỹ thuật (repair_note) tách biệt rõ cho Tai trái, Tai phải, Hộp sạc hoặc thân máy Apple Watch.',
        'Cập nhật danh sách linh kiện dự kiến cần dùng (parts_needed) để chuẩn bị lấy vật tư từ kho nội bộ.',
      ],
      handoverTo: 'Chốt phương án can thiệp phần cứng hoặc thông báo CSKH nếu phát hiện bệnh phát sinh.',
    },
    {
      step: 3,
      title: 'Xử lý sửa chữa phần cứng & Phối hợp linh kiện / Báo phát sinh bệnh cho CSKH',
      moduleLabel: 'Không gian Kỹ thuật (/tech)',
      moduleHref: '/tech',
      statusTransition: {
        from: 'in_repair',
        to: 'in_repair hoặc Chờ linh kiện (waiting_parts)',
        statusType: 'wait',
      },
      description:
        'Thực hiện quy trình thay thế linh kiện, đóng chip, xử lý âm thanh/pin chuyên sâu. Chủ động phối hợp với Lễ tân/CSKH và Thủ kho nếu phát sinh tình huống ngoài dự kiến.',
      checkpoints: [
        'Nếu phát hiện thêm lỗi phần cứng ngoài báo giá ban đầu: Ghi rõ tình trạng vào repair_note và báo ngay cho CSKH liên hệ khách hàng chốt thêm dịch vụ bổ sung (KTV không tự ý sửa khi khách chưa duyệt).',
        'Nếu cần linh kiện đặc biệt không có sẵn trong kho: Mở SpecialPartsRequestModal gửi yêu cầu mua ngoài để chuyển đơn sang trạng thái Chờ linh kiện (waiting_parts) cho đến khi CSKH/Thủ kho xác nhận đã có hàng (fulfillSpecialPart).',
      ],
      handoverTo: 'Hoàn thiện lắp ráp phần cứng sau khi đủ vật tư và khách đã duyệt phương án.',
    },
    {
      step: 4,
      title: 'Bóc tách linh kiện kho đã sử dụng (parts_used) & Tự kiểm tra nội bộ',
      moduleLabel: 'Không gian Kỹ thuật (/tech — TechOrderDetailModal)',
      moduleHref: '/tech',
      statusTransition: {
        from: 'Đang sửa (in_repair)',
        to: 'Đã kê khai linh kiện & Vệ sinh máy',
        statusType: 'progress',
      },
      description:
        'Sau khi sửa chữa xong phần cứng, Kỹ thuật viên thực hiện kê khai chính xác các mã linh kiện SKU đã lấy từ kho và tự kiểm tra chất lượng sơ bộ tại bàn trước khi chuyển QC.',
      checkpoints: [
        'Chọn đầy đủ mã SKU và số lượng linh kiện thực tế đã lắp vào máy trong mục Linh kiện xuất kho (parts_used) để hệ thống đối soát tồn kho và tính giá vốn tự động khi hoàn tất đơn.',
        'Vệ sinh sạch keo thừa, lưới loa, chân sạc và kiểm tra nhanh các chức năng cơ bản (kết nối, âm thanh L/R, mic, sạc) đảm bảo đạt chuẩn kỹ thuật.',
      ],
      handoverTo: 'Sẵn sàng đóng gói khay thiết bị chuyển sang bước nghiệm thu chất lượng.',
    },
    {
      step: 5,
      title: 'Bấm Hoàn thành sửa & Đẩy đơn sang Chờ QC (waiting_qc)',
      moduleLabel: 'Không gian Kỹ thuật (/tech)',
      moduleHref: '/tech',
      statusTransition: {
        from: 'Đang sửa (in_repair)',
        to: 'Chờ QC (waiting_qc)',
        statusType: 'wait',
      },
      description:
        'Xác nhận hoàn tất công đoạn sửa chữa trên hệ thống để chuyển đơn sang hàng đợi của bộ phận Kiểm định Chất lượng (QC) và lưu vào Lịch sử đã hoàn thành 7 ngày.',
      checkpoints: [
        'Kiểm tra lần cuối nội dung Ghi chú kỹ thuật (repair_note) và danh sách Linh kiện đã sử dụng (parts_used).',
        'Nhấn nút "Hoàn thành sửa": Hệ thống ghi nhận mốc thời gian repair_completed_at, chuyển trạng thái đơn sang Chờ QC (waiting_qc) và đưa đơn vào tab Lịch sử đã hoàn thành (7 ngày gần nhất).',
      ],
      handoverTo: 'Bàn giao khay thiết bị vật lý sang bộ phận Kiểm định QC (/qc) để nghiệm thu độc lập.',
    },
  ],
  specialScenarios: [
    {
      id: 'tech-special-parts-request',
      title: 'Gửi Yêu cầu linh kiện đặc biệt ngoài danh mục (SpecialPartsRequestModal)',
      trigger:
        'Khi thiết bị đang sửa (in_repair) cần linh kiện hiếm ngoài danh mục SKU chuẩn hoặc linh kiện trong kho đã hết tồn khả dụng, cần CSKH/Thủ kho/Admin mua gấp từ nhà cung cấp bên ngoài.',
      statusLabel: 'Chờ linh kiện (waiting_parts)',
      statusType: 'wait',
      resolutionSteps: [
        'Tại thẻ đơn trên Bàn làm việc của tôi hoặc thanh công cụ /tech, nhấn nút mở cửa sổ Yêu cầu linh kiện đặc biệt (SpecialPartsRequestModal).',
        'Chọn đúng mã đơn đang sửa, nhập chi tiết tên linh kiện, thông số kỹ thuật/đời máy cần mua vào ô mô tả (special_parts_needed) và giữ tích chọn tạm dừng đơn.',
        'Khi bấm gửi yêu cầu: Đơn tự động chuyển sang trạng thái Chờ linh kiện (waiting_parts), ghi nhận mốc paused_at và gửi cảnh báo tới Quầy CSKH, Thủ kho và Admin.',
        'Ngay khi CSKH/Thủ kho/Admin mua được linh kiện và bấm Xác nhận đã có linh kiện (fulfillSpecialPart), đơn tự động mở khóa về lại Đang sửa (in_repair) trên Bàn làm việc của bạn.',
      ],
      relatedModule: 'Không gian Kỹ thuật (/tech) <-> Đơn sửa chữa (/repairs) & Kho (/inventory)',
    },
    {
      id: 'tech-handover-between-shifts',
      title: 'Bàn giao đơn giữa ca cho kỹ thuật viên khác hoặc trả về Hàng đợi chung (HandoverTechModal)',
      trigger:
        'Khi Kỹ thuật viên hết ca làm việc, nhận nhầm dòng máy không thuộc chuyên môn, gặp ca bệnh vi mạch phức tạp cần thợ chuyên sâu hoặc thiếu dụng cụ đo kiểm tại bàn.',
      statusLabel: 'Bàn giao đơn / Đổi KTV',
      statusType: 'progress',
      resolutionSteps: [
        'Nhấn nút "Bàn giao" trên thẻ đơn đang phụ trách để mở cửa sổ HandoverTechModal.',
        'Chọn hình thức nhận bàn giao: Chuyển trực tiếp cho một Kỹ thuật viên khác đang hoạt động cùng chi nhánh (gán lại technician_id mới) HOẶC trả đơn về Hàng đợi chờ sửa chung (waiting_tech) để đồng nghiệp khác nhận.',
        'Chọn 1 trong 4 nhãn lý do bắt buộc: Nhận nhầm đơn (wrong_order), Máy khó / Ca bệnh phức tạp (complex_repair), Hết ca làm việc / Đổi ca (shift_change), hoặc Thiếu đồ nghề / linh kiện (missing_parts_tools).',
        'Nhập ghi chú bàn giao chi tiết (những bước đã kiểm tra, tình trạng mạch hiện tại) để đồng nghiệp ca sau nắm bắt ngay mà không phải tháo đo lại từ đầu.',
      ],
      relatedModule: 'Không gian Kỹ thuật (/tech — HandoverTechModal)',
    },
    {
      id: 'tech-rework-from-qc',
      title: 'Xử lý đơn Yêu cầu làm lại (Rework — rework_needed) khi bộ phận QC trả về',
      trigger:
        'Bộ phận Kiểm định QC phát hiện thiết bị sau sửa chữa vẫn còn lỗi chưa triệt để (lệch âm, rè ở âm lượng cao, hở keo viền, hao pin, lỗi cảm biến) hoặc khách hàng mang máy quay lại bảo hành.',
      statusLabel: 'Yêu cầu làm lại (rework_needed)',
      statusType: 'danger',
      resolutionSteps: [
        'Đơn hàng bị QC từ chối sẽ tự động quay trở lại phân vùng Bàn làm việc của tôi với nhãn cảnh báo đỏ Yêu cầu làm lại (rework_needed) và được xếp lên đầu danh sách ưu tiên.',
        'Mở chi tiết đơn để đọc kỹ Lý do yêu cầu làm lại (rework_reason / qc_note) do chuyên viên QC ghi nhận ở từng hạng mục không đạt.',
        'Tiến hành xử lý triệt để điểm lỗi theo đúng yêu cầu của QC, cập nhật bổ sung kết quả khắc phục vào repair_note (và cập nhật parts_used nếu có đổi linh kiện khác).',
        'Sau khi kiểm tra kỹ lưỡng, bấm lại nút "Hoàn thành sửa" để đẩy đơn sang Chờ QC (waiting_qc) thực hiện nghiệm thu lần tiếp theo.',
      ],
      relatedModule: 'Không gian Kỹ thuật (/tech) <-> Kiểm định QC (/qc)',
    },
    {
      id: 'tech-additional-issue-discovery',
      title: 'Phát hiện thêm bệnh / lỗi phát sinh ngoài báo giá tiếp nhận ban đầu',
      trigger:
        'Trong quá trình tháo máy đo kiểm chuyên sâu, Kỹ thuật viên phát hiện thêm hư hỏng phần cứng khác chưa có trong danh mục dịch vụ khách đã chốt lúc tiếp nhận (ví dụ: khách gửi thay pin nhưng phát hiện thêm đứt cáp mic hoặc chạm IC sạc).',
      statusLabel: 'Phối hợp CSKH báo giá bổ sung',
      statusType: 'new',
      resolutionSteps: [
        'Tạm dừng can thiệp vào hạng mục phát sinh chưa được duyệt giá để tránh tranh chấp chi phí với khách hàng.',
        'Ghi chú rõ ràng, khách quan tình trạng lỗi phát sinh và phương án kỹ thuật đề xuất vào trường Ghi chú kỹ thuật (repair_note) trên đơn.',
        'Thông báo ngay cho Lễ tân/CSKH tại quầy để CSKH liên hệ khách hàng tư vấn và cập nhật thêm dịch vụ bổ sung (additional_services) vào đơn hàng.',
        'Chỉ tiếp tục sửa chữa hạng mục phát sinh sau khi CSKH xác nhận khách hàng đã đồng ý báo giá mới trên hệ thống.',
      ],
      relatedModule: 'Không gian Kỹ thuật (/tech) <-> Đơn sửa chữa (/repairs)',
    },
  ],
  rbacGuardrails: [
    {
      id: 'tech-financial-rbac',
      ruleTitle: 'Bảo mật Tuyệt đối Giá bán, Giá vốn Linh kiện & Doanh thu (Financial & COGS Privacy)',
      policyCode: 'cogs-privacy-and-financial-rbac',
      severity: 'strict',
      description:
        'Hệ thống ẩn 100% giá tiền dịch vụ, tổng tiền đơn hàng (total_price / initial_price), giá vốn nhập kho linh kiện (cost_price / COGS) và báo cáo doanh thu trên cả tầng Backend API Serializer lẫn giao diện Frontend đối với vai trò tech / technician; đồng thời chặn hoàn toàn quyền tự thêm hoặc xóa dịch vụ có giá tiền trên đơn.',
      reason:
        'Bảo vệ tuyệt đối bí mật cấu trúc giá vốn và chính sách giá của cửa hàng, đồng thời giúp Kỹ thuật viên tập trung 100% vào chất lượng chuyên môn sửa chữa mà không bị chi phối bởi giá trị thương mại của đơn hàng.',
    },
    {
      id: 'tech-history-7days-scope',
      ruleTitle: 'Giới hạn Phạm vi Tra cứu Lịch sử Đơn sửa chữa trong 7 Ngày Gần nhất',
      policyCode: 'shift-day-view-and-role-history-scope',
      severity: 'strict',
      description:
        'Tài khoản Kỹ thuật viên chỉ được phép truy vấn các đơn đang hoạt động (waiting_tech, in_repair, waiting_parts, rework_needed) và tra cứu lịch sử các đơn đã hoàn tất sửa chữa trong phạm vi tối đa 7 ngày gần nhất thông qua 3 mốc lọc ca trực: Hôm nay (today), 3 ngày (3_days) và 7 ngày (7_days).',
      reason:
        'Tối ưu hóa tốc độ tải dữ liệu tại Bàn kỹ thuật và ngăn chặn việc truy xuất, sao chép toàn bộ cơ sở dữ liệu lịch sử đơn hàng và thông tin khách hàng tích lũy dài hạn của cửa hàng.',
    },
    {
      id: 'tech-focused-workspace',
      ruleTitle: 'Không gian Làm việc Tập trung Duy nhất tại /tech (Focused Tech Workspace)',
      policyCode: 'focused-tech-workspace',
      severity: 'info',
      description:
        'Theo ma trận phân quyền rolePermissions.tech, thanh điều hướng Sidebar của Kỹ thuật viên chỉ hiển thị duy nhất module Không gian Kỹ thuật (/tech). Mọi thao tác truy cập trực tiếp bằng URL sang /dashboard, /repairs, /inventory hoặc các module quản trị khác đều được AppShell tự động điều hướng an toàn về lại /tech.',
      reason:
        'Loại bỏ hoàn toàn sự phân tâm từ các nghiệp vụ thu ngân, kế toán hay quản trị kho, cung cấp một giao diện Workbench tinh gọn và tốc độ phản hồi nhanh nhất cho thao tác kỹ thuật.',
    },
    {
      id: 'tech-strict-branch-isolation',
      ruleTitle: 'Cô lập Dữ liệu Nghiêm ngặt theo Chi nhánh Phân công (Strict Branch Isolation)',
      policyCode: 'strict-branch-isolation',
      severity: 'strict',
      description:
        'Mỗi tài khoản Kỹ thuật viên được gắn cố định với một mã chi nhánh (branch_id); hệ thống chỉ hiển thị Hàng đợi chờ sửa, danh sách Kỹ thuật viên nhận bàn giao ca và tồn kho linh kiện thuộc đúng chi nhánh đó.',
      reason:
        'Đảm bảo tính chính xác tuyệt đối khi nhận khay máy vật lý tại xưởng, bàn giao đơn giữa các kỹ thuật viên cùng cơ sở và trừ tồn kho linh kiện đúng kho chi nhánh thực tế.',
    },
  ],
};

export default techGuideData;
