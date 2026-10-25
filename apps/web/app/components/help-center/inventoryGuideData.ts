import type { RoleGuideConfig } from './types';

export const inventoryGuideData: RoleGuideConfig = {
  roleKey: 'inventory',
  tabLabel: 'Thủ kho',
  roleTitle: 'Chuyên viên Quản trị Kho, Mua hàng & Chuỗi cung ứng (Inventory & Procurement)',
  badgeLabel: 'ROLE: INVENTORY · 5 MODULES QUẢN TRỊ KHO & MUA HÀNG',
  missionSummary:
    'Đảm bảo dòng chảy vật tư và linh kiện chính hãng liên tục cho xưởng kỹ thuật tại chi nhánh: quản lý danh mục linh kiện theo mã SKU, vị trí kệ tủ (shelf_location) và ngưỡng cảnh báo tồn tối thiểu (low_stock_threshold); xử lý khẩn cấp các phiếu Yêu cầu linh kiện đặc biệt (SpecialPartRequest) từ Kỹ thuật viên để giải phóng đơn Chờ linh kiện (waiting_parts -> in_repair); lập Phiếu nhập hàng từ Nhà cung cấp (GoodsReceipt / PO) cập nhật giá vốn bình quân; ghi nhận biến động Thẻ kho (InventoryTransaction) và đối soát sổ nợ đối tác.',
  dataScope:
    'Cô lập kho theo chi nhánh được phân công (Branch Warehouse Isolation): Truy cập đúng 5 module trên Sidebar khớp 100% với rolePermissions.inventory gồm Kho & Mua hàng (/inventory), Đối tác (/partners), Thiết bị (/devices), Đơn sửa chữa (/repairs) và Tổng quan (/dashboard).',
  financialVisibility:
    'Phân quyền quản trị giá vốn nhập kho và công nợ mua hàng (cogs-privacy-and-financial-rbac): Được quyền xem và cập nhật đơn giá nhập (cost_price / unit_cost), tổng giá trị Phiếu nhập hàng (GoodsReceipt / PO) và công nợ phải trả Nhà cung cấp (AP); không can thiệp vào sổ quỹ thu tiền khách lẻ tại quầy CSKH.',
  coreResponsibilities: [
    'Quản trị danh mục linh kiện theo mã SKU, số lượng tồn thực tế (quantity), định mức cảnh báo tồn kho tối thiểu (low_stock_threshold) và sơ đồ vị trí kệ tủ (shelf_location) tại /inventory.',
    'Tiếp nhận và xử lý các đơn sửa chữa đang ở trạng thái Chờ linh kiện (waiting_parts) cùng Yêu cầu linh kiện đặc biệt (SpecialPartRequest): Duyệt yêu cầu -> Đặt mua nhà cung cấp -> Nhập kho và cấp phát (fulfillSpecialPart) giải phóng đơn về Đang sửa (in_repair).',
    'Lập Phiếu nhập hàng từ Nhà cung cấp (GoodsReceipt / PO), kiểm đếm chất lượng linh kiện đầu vào, cập nhật tồn kho thực tế và tự động tính lại giá vốn nhập kho (cost_price).',
    'Ghi nhận và kiểm soát toàn bộ biến động Thẻ kho (InventoryTransaction: nhập kho import, xuất sửa chữa export_repair, hoàn kho return_refund, điều chỉnh kiểm kê adjustment) gắn liền với mã tham chiếu đơn hàng.',
    'Quản lý hồ sơ Nhà cung cấp linh kiện, Đối tác vận chuyển COD (/partners), chuẩn hóa mã linh kiện tương thích theo từng dòng thiết bị Apple (/devices) và đối soát công nợ định kỳ.',
  ],
  modules: [
    {
      id: 'inventory',
      label: 'Kho & Mua hàng',
      href: '/inventory',
      group: 'VẬN HÀNH',
      summary:
        'Bàn điều hành kho trung tâm tại /inventory hợp nhất 4 phân khu nghiệp vụ: Tồn kho & Kệ tủ (sku, quantity, low_stock_threshold, shelf_location) tích hợp xử lý Yêu cầu linh kiện đặc biệt (SpecialPartRequest), Nhập hàng từ Nhà cung cấp (GoodsReceipt / PO), Nhà cung cấp & Sổ nợ (Suppliers), và Thẻ kho & Biến động (InventoryTransaction).',
      subSections: [
        {
          title: '1. Phân khu Tồn kho & Kệ tủ (StockTab — sku, quantity, low_stock_threshold, shelf_location)',
          badge: 'Quản lý SKU & Kệ tủ',
          badgeType: 'ready',
          description:
            'Hiển thị danh mục linh kiện tại kho chi nhánh với mã SKU, tên linh kiện, danh mục thiết bị, số lượng tồn thực tế (quantity), định mức tối thiểu (low_stock_threshold), vị trí kệ/ngăn tủ (shelf_location), giá bán niêm yết và giá vốn nhập kho (cost_price); hỗ trợ lọc nhanh các mặt hàng sắp hết (Low Stock).',
        },
        {
          title: '2. Xử lý Yêu cầu linh kiện đặc biệt từ Kỹ thuật viên (SpecialPartRequest)',
          badge: 'Giải phóng đơn waiting_parts',
          badgeType: 'wait',
          description:
            'Tiếp nhận phiếu yêu cầu mua linh kiện ngoài danh mục hoặc linh kiện đang hết tồn từ Kỹ thuật viên: thực hiện Duyệt yêu cầu, Đặt mua nhà cung cấp và Xác nhận Nhập kho / Cấp phát (fulfillSpecialPart) để tự động chuyển đơn sửa chữa từ Chờ linh kiện (waiting_parts) về lại Đang sửa (in_repair).',
        },
        {
          title: '3. Phân khu Nhập hàng từ Nhà cung cấp (ReceiptsTab — GoodsReceipt / PO)',
          badge: 'Phiếu nhập PO & Giá vốn',
          badgeType: 'progress',
          description:
            'Tạo mới và tra cứu lịch sử Phiếu nhập hàng (GoodsReceipt / PO) từ Nhà cung cấp: kê khai danh sách SKU, số lượng nhập, đơn giá nhập (unit_cost), số tiền đã thanh toán và phần ghi nợ công nợ nhà cung cấp.',
        },
        {
          title: '4. Phân khu Nhà cung cấp & Sổ nợ (SuppliersTab — Suppliers & Debt Balance)',
          badge: 'Đối soát công nợ AP',
          badgeType: 'new',
          description:
            'Quản lý danh bạ Nhà cung cấp vật tư, theo dõi tổng giá trị mua hàng, dư nợ phải trả hiện tại (debt_balance) và lập phiếu thanh toán công nợ định kỳ.',
        },
        {
          title: '5. Phân khu Thẻ kho & Biến động (MovementsTab — InventoryTransaction)',
          badge: 'Truy vết xuất nhập tồn',
          badgeType: 'ready',
          description:
            'Sổ cái ghi nhận mọi giao dịch biến động số lượng linh kiện theo thời gian thực gồm: Nhập kho (import), Xuất sửa chữa tự động (export_repair), Hoàn trả linh kiện khi hoàn tiền (return_refund) và Điều chỉnh kiểm kê (adjustment) kèm mã tham chiếu (reference_code).',
        },
      ],
      keyActions: [
        'Tra cứu tồn kho theo mã SKU, lọc danh sách linh kiện chạm ngưỡng tồn tối thiểu (low_stock_threshold) và cập nhật vị trí kệ tủ (shelf_location).',
        'Duyệt phiếu Yêu cầu linh kiện đặc biệt (SpecialPartRequest), đặt hàng và xác nhận cấp phát linh kiện để giải phóng đơn Chờ linh kiện (waiting_parts).',
        'Tạo Phiếu nhập hàng từ Nhà cung cấp (GoodsReceipt / PO) để cộng tồn kho thực tế và cập nhật giá vốn bình quân (cost_price).',
        'Tạo phiếu giao dịch kho / điều chỉnh kiểm kê (CreatePartTransactionModal) và tra cứu lịch sử Thẻ kho (InventoryTransaction).',
        'Theo dõi dư nợ Nhà cung cấp (debt_balance) và thực hiện đối soát thanh toán công nợ tại tab Nhà cung cấp & Sổ nợ.',
      ],
    },
    {
      id: 'partners',
      label: 'Đối tác',
      href: '/partners',
      group: 'VẬN HÀNH',
      summary:
        'Quản lý danh mục đối tác vận chuyển / giao nhận COD (logistics), đối tác sửa chữa phần cứng chuyên sâu (specialized_repair) và đối tác cung ứng linh kiện (parts_supplier) liên kết với chi nhánh.',
      subSections: [
        {
          title: 'Danh bạ Đối tác Cung ứng Linh kiện & Vận chuyển COD',
          badge: 'Logistics & Parts Supplier',
          badgeType: 'ready',
          description:
            'Phân loại rõ nhóm dịch vụ đối tác gồm: Nhà cung ứng linh kiện (parts_supplier), Vận chuyển / Logistics (logistics), Sửa phần cứng chuyên sâu (specialized_repair) và Bảo hành mở rộng (warranty_extended) kèm đầu mối liên hệ, số điện thoại và trạng thái hợp tác.',
        },
      ],
      keyActions: [
        'Tra cứu và thêm mới hồ sơ đối tác cung ứng linh kiện hoặc đơn vị vận chuyển giao nhận COD tại /partners.',
        'Cập nhật thông tin người liên hệ (contact_person), số điện thoại hotline và trạng thái hoạt động (Hoạt động / Tạm ngừng) của từng đối tác.',
        'Theo dõi thống kê số lượng vận đơn giao nhận (shipments_count) và lịch sử phối hợp cung ứng vật tư với từng đơn vị đối tác.',
      ],
    },
    {
      id: 'devices',
      label: 'Thiết bị',
      href: '/devices',
      group: 'VẬN HÀNH',
      summary:
        'Tra cứu danh mục dòng thiết bị Apple (AirPods, Apple Watch, Apple Pencil, MacBook, iPad) và mã model phần cứng (model_code) để chuẩn hóa mã linh kiện SKU tương thích chính xác theo từng đời máy.',
      subSections: [
        {
          title: 'Chuẩn hóa Mã Linh kiện Tương thích theo 5 Dòng Thiết bị Apple',
          badge: 'AirPods · Watch · Pencil · Mac · iPad',
          badgeType: 'new',
          description:
            'Đối chiếu thông số đời máy và mã model phần cứng (ví dụ: AirPods Pro 2 USB-C vs Lightning, Apple Watch Series 8 41mm vs 45mm) trước khi khởi tạo mã SKU mới hoặc đặt mua linh kiện thay thế từ Nhà cung cấp.',
        },
      ],
      keyActions: [
        'Tra cứu danh mục 5 nhóm thiết bị Apple và mã model phần cứng (model_code) để tránh nhầm lẫn kích thước pin, màng loa, cáp cảm biến giữa các đời máy.',
        'Sử dụng tên dòng máy chuẩn tại /devices làm quy chuẩn đặt tên và phân nhóm danh mục (category) cho linh kiện trong kho.',
        'Phối hợp với Kỹ thuật viên và QC khi cần xác minh thông số kỹ thuật của linh kiện mới nhập về cho các dòng máy đời mới.',
      ],
    },
    {
      id: 'repairs',
      label: 'Đơn sửa chữa',
      href: '/repairs',
      group: 'WORKSPACE',
      summary:
        'Theo dõi trực tiếp các đơn sửa chữa đang bị tạm dừng ở trạng thái Chờ linh kiện (waiting_parts) cần ưu tiên cung ứng gấp và đối chiếu danh sách linh kiện kỹ thuật viên đã sử dụng (parts_used) trên từng đơn hàng.',
      subSections: [
        {
          title: 'Giám sát Đơn hàng Chờ linh kiện (waiting_parts) & Đối chiếu Vật tư (parts_used)',
          badge: 'Chờ linh kiện (waiting_parts)',
          badgeType: 'wait',
          description:
            'Giúp Thủ kho nắm bắt chính xác đơn hàng nào đang chờ linh kiện gì, của Kỹ thuật viên nào phụ trách, thời gian khách hẹn lấy máy và danh mục linh kiện thực tế đã gắn vào hồ sơ đơn (parts_used).',
        },
      ],
      keyActions: [
        'Lọc danh sách đơn sửa chữa theo trạng thái Chờ linh kiện (waiting_parts) để xác định thứ tự ưu tiên đặt mua hoặc xuất cấp vật tư.',
        'Mở chi tiết đơn sửa chữa để kiểm tra danh sách linh kiện Kỹ thuật viên đã kê khai sử dụng (parts_used) và ghi chú yêu cầu vật tư.',
        'Đối chiếu mã đơn sửa chữa (order_code) với các bản ghi xuất kho tự động (export_repair) hoặc hoàn kho (return_refund) trên Thẻ kho.',
      ],
    },
    {
      id: 'dashboard',
      label: 'Tổng quan',
      href: '/dashboard',
      group: 'WORKSPACE',
      summary:
        'Bảng điều khiển theo dõi nhanh các chỉ số cảnh báo tồn kho thấp (Low Stock Alerts), số lượng yêu cầu linh kiện đang chờ xử lý và nhịp độ lưu lượng đơn sửa chữa tại chi nhánh.',
      keyActions: [
        'Quan sát nhanh thẻ cảnh báo số lượng mã SKU đang chạm hoặc thấp hơn ngưỡng tồn kho tối thiểu (low_stock_threshold) ngay đầu ca làm việc.',
        'Theo dõi số lượng đơn hàng đang ở trạng thái Đang sửa (in_repair) và Chờ linh kiện (waiting_parts) để chủ động chuẩn bị nguồn vật tư trong ngày.',
        'Nắm bắt nhịp độ vận hành chung của chi nhánh để lên kế hoạch nhập hàng bổ sung trước các khung giờ hoặc ngày cao điểm.',
      ],
    },
  ],
  dailyWorkflow: [
    {
      step: 1,
      title: 'Kiểm tra cảnh báo tồn kho tối thiểu (low_stock_threshold) & Rà soát vị trí kệ tủ (shelf_location) đầu ca',
      moduleLabel: 'Kho & Mua hàng (/inventory) & Tổng quan (/dashboard)',
      moduleHref: '/inventory',
      statusTransition: {
        from: 'Đầu ca làm việc',
        to: 'Rà soát SKU chạm ngưỡng tối thiểu',
        statusType: 'wait',
      },
      description:
        'Ngay khi bắt đầu ca làm việc, Thủ kho truy cập /dashboard và phân khu Tồn kho & Kệ tủ tại /inventory để kiểm tra toàn bộ các mã SKU có số lượng tồn thực tế (quantity) chạm hoặc thấp hơn ngưỡng cảnh báo tối thiểu (low_stock_threshold).',
      checkpoints: [
        'Bật bộ lọc "Sắp hết hàng (Low Stock)" tại tab Tồn kho & Kệ tủ (/inventory?tab=stock) để liệt kê các linh kiện chủ lực (pin AirPods, màng loa, chân sạc, cảm biến) cần nhập bổ sung.',
        'Kiểm tra sơ đồ vị trí kệ tủ (shelf_location: ví dụ Kệ A1 - Khay 02) đảm bảo linh kiện vật lý được sắp xếp đúng ngăn, khớp với số liệu tồn trên hệ thống.',
      ],
      handoverTo: 'Lập danh sách mặt hàng cần ưu tiên đặt mua và chuyển sang xử lý các đơn đang chờ linh kiện.',
    },
    {
      step: 2,
      title: 'Xử lý các đơn đang Chờ linh kiện (waiting_parts) & Yêu cầu mua linh kiện đặc biệt từ Kỹ thuật viên',
      moduleLabel: 'Kho & Mua hàng (/inventory) & Đơn sửa chữa (/repairs)',
      moduleHref: '/inventory',
      statusTransition: {
        from: 'Chờ linh kiện (waiting_parts)',
        to: 'Đang sửa (in_repair)',
        statusType: 'progress',
      },
      description:
        'Khi Kỹ thuật viên gửi Yêu cầu linh kiện đặc biệt (SpecialPartRequest) làm đơn chuyển sang trạng thái Chờ linh kiện (waiting_parts), Thủ kho thực hiện quy trình cung ứng khép kín để giải phóng đơn nhanh nhất.',
      checkpoints: [
        'Kiểm tra chi tiết phiếu yêu cầu linh kiện gắn với mã đơn tại /repairs và /inventory: đối chiếu đúng dòng máy Apple tại /devices và thông số kỹ thuật Kỹ thuật viên mô tả.',
        'Thực hiện quy trình 3 bước: Duyệt yêu cầu -> Liên hệ Nhà cung cấp đặt mua nhanh hoặc xuất cấp từ kho dự phòng -> Xác nhận Nhập kho / Cấp phát linh kiện (fulfillSpecialPart).',
        'Ngay khi Thủ kho xác nhận hoàn tất cung ứng linh kiện, hệ thống tự động chuyển trạng thái đơn từ Chờ linh kiện (waiting_parts) về lại Đang sửa (in_repair) trên bàn của Kỹ thuật viên phụ trách.',
      ],
      handoverTo: 'Bàn giao linh kiện vật lý tận tay Kỹ thuật viên để tiếp tục hoàn thiện ca sửa chữa.',
    },
    {
      step: 3,
      title: 'Tạo Phiếu nhập hàng từ Nhà cung cấp (GoodsReceipt / PO) & Cập nhật tồn kho thực tế tại chi nhánh',
      moduleLabel: 'Kho & Mua hàng (/inventory?tab=receipts)',
      moduleHref: '/inventory',
      statusTransition: {
        from: 'Hàng về kho chi nhánh',
        to: 'Hoàn tất Phiếu nhập (GoodsReceipt)',
        statusType: 'ready',
      },
      description:
        'Khi lô linh kiện từ Nhà cung cấp được giao tới cửa hàng, Thủ kho kiểm đếm ngoại quan/số lượng thực tế và lập Phiếu nhập hàng (GoodsReceipt / PO) tại phân khu Nhập hàng từ NCC.',
      checkpoints: [
        'Chọn đúng Nhà cung cấp (Supplier), kê khai từng mã SKU linh kiện, số lượng thực nhận và đơn giá nhập thực tế (unit_cost / cost_price).',
        'Khai báo số tiền thanh toán ngay (nếu chi tiền mặt/chuyển khoản) hoặc ghi nhận vào công nợ phải trả Nhà cung cấp (debt_balance).',
        'Khi bấm Lưu Phiếu nhập hàng, hệ thống tự động cộng số lượng vào tồn kho chi nhánh (quantity), cập nhật giá vốn nhập kho và sinh bản ghi Thẻ kho loại Nhập kho (import).',
      ],
      handoverTo: 'Phân loại linh kiện mới nhập vào đúng vị trí kệ tủ (shelf_location) đã quy hoạch.',
    },
    {
      step: 4,
      title: 'Ghi nhận biến động Thẻ kho (InventoryTransaction) & Đối chiếu mã đơn sửa chữa',
      moduleLabel: 'Kho & Mua hàng (/inventory?tab=movements)',
      moduleHref: '/inventory',
      statusTransition: {
        from: 'Phát sinh giao dịch xuất/nhập/điều chỉnh',
        to: 'Đồng bộ Thẻ kho (InventoryTransaction)',
        statusType: 'ready',
      },
      description:
        'Tại phân khu Thẻ kho & Biến động (/inventory?tab=movements), Thủ kho giám sát và đối chiếu toàn bộ lịch sử vào/ra của từng mã SKU theo 4 loại giao dịch chuẩn.',
      checkpoints: [
        'Kiểm tra các bút toán tự động: Xuất sửa chữa (export_repair) khi đơn hoàn tất, Hoàn trả linh kiện (return_refund) khi đơn hoàn tiền, và Nhập kho (import) từ phiếu PO.',
        'Khi phát hiện chênh lệch kiểm kê thực tế hoặc linh kiện lỗi DOA cần xuất trả Nhà cung cấp, sử dụng chức năng tạo giao dịch điều chỉnh (adjustment) kèm ghi rõ mã tham chiếu và lý do.',
        'Đảm bảo 100% biến động xuất sửa chữa đều gắn kèm mã đơn sửa chữa (order_code) và tên nhân sự thực hiện để phục vụ kiểm toán.',
      ],
      handoverTo: 'Đảm bảo số liệu tồn kho sổ sách khớp 100% với tồn kho vật lý trên kệ tủ.',
    },
    {
      step: 5,
      title: 'Quản lý thông tin Nhà cung cấp, Đối tác vận chuyển (/partners) & Đối soát công nợ định kỳ',
      moduleLabel: 'Kho & Mua hàng (/inventory?tab=suppliers) & Đối tác (/partners)',
      moduleHref: '/partners',
      statusTransition: {
        from: 'Cuối ca / Định kỳ hàng tuần',
        to: 'Hoàn tất đối soát Nhà cung cấp & Đối tác',
        statusType: 'new',
      },
      description:
        'Cuối ngày hoặc định kỳ hàng tuần, Thủ kho rà soát sổ nợ Nhà cung cấp tại /inventory?tab=suppliers và cập nhật danh mục đối tác cung ứng / vận chuyển tại /partners.',
      checkpoints: [
        'Kiểm tra tổng dư nợ phải trả (debt_balance) của từng Nhà cung cấp, đối chiếu các Phiếu nhập hàng (GoodsReceipt) chưa tất toán và lập phiếu trả nợ công nợ khi đến hạn.',
        'Cập nhật danh bạ Đối tác tại /partners (Nhà cung ứng linh kiện parts_supplier, Đối tác vận chuyển COD logistics) để đảm bảo thông tin liên hệ và luồng giao nhận luôn thông suốt.',
      ],
      handoverTo: 'Báo cáo tổng hợp tình hình tồn kho và công nợ mua hàng cho Quản trị viên cửa hàng (admin).',
    },
  ],
  specialScenarios: [
    {
      id: 'inv-auto-deduction-idempotency',
      title: '1. Cơ chế Tự động trừ tồn kho (export_repair) khi đơn Hoàn tất (completed) & Chống trừ trùng lặp (Idempotency)',
      trigger:
        'Khi Lễ tân / CSKH hoàn tất thu tiền và bấm Xác nhận trả máy chuyển đơn sửa chữa sang trạng thái Hoàn tất (completed).',
      statusLabel: 'Khấu trừ Tự động (export_repair)',
      statusType: 'ready',
      resolutionSteps: [
        'Hệ thống tự động quét danh sách linh kiện Kỹ thuật viên đã kê khai trên đơn (parts_used) để thực hiện trừ số lượng tồn kho (quantity) tại đúng chi nhánh của đơn hàng.',
        'Đồng thời, hệ thống tự động sinh bản ghi Thẻ kho (InventoryTransaction) với loại giao dịch Xuất sửa chữa (export_repair), gắn mã tham chiếu là mã đơn (order_code) và chốt Giá vốn linh kiện (COGS) tại thời điểm xuất.',
        'Cơ chế khóa chống trùng lặp (Idempotency Guard — cờ inventory_deducted_at / kiểm tra giao dịch tồn tại): Đảm bảo mỗi linh kiện trên một đơn sửa chữa chỉ bị trừ tồn kho đúng 1 lần duy nhất, tuyệt đối không bị trừ kép dù đơn hàng có được cập nhật lại ghi chú hay in lại phiếu.',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) -> Kho & Mua hàng (/inventory?tab=movements)',
    },
    {
      id: 'inv-auto-return-on-refund',
      title: '2. Cơ chế Tự động hoàn trả linh kiện về kho (return_refund) khi đơn hàng phát sinh Hoàn tiền (RefundModal)',
      trigger:
        'Khi CSKH hoặc Quản trị viên thực hiện nghiệp vụ Hoàn tiền toàn phần/một phần (RefundModal) cho đơn sửa chữa đã từng xuất kho linh kiện.',
      statusLabel: 'Hoàn kho Tự động (return_refund)',
      statusType: 'wait',
      resolutionSteps: [
        'Ngay khi giao dịch Hoàn tiền được xác nhận kèm thu hồi linh kiện, hệ thống tự động cộng trả lại số lượng linh kiện (quantity) vào tồn kho của chi nhánh.',
        'Hệ thống tự động tạo bút toán đảo trên Thẻ kho (InventoryTransaction) với loại giao dịch Hoàn trả linh kiện (return_refund), gắn kèm mã đơn sửa chữa và lý do hoàn tiền.',
        'Thủ kho kiểm tra lại linh kiện thu hồi thực tế từ Kỹ thuật viên: nếu linh kiện còn nguyên vẹn thì đưa lại lên kệ tủ (shelf_location); nếu linh kiện bị lỗi hỏng thì lập phiếu điều chỉnh (adjustment) để tách khỏi tồn khả dụng.',
      ],
      relatedModule: 'Đơn sửa chữa (/repairs) -> Kho & Mua hàng (/inventory?tab=movements)',
    },
    {
      id: 'inv-emergency-special-part-fulfillment',
      title: '3. Xử lý khẩn cấp Yêu cầu mua linh kiện đặc biệt ngoài danh mục (SpecialPartRequest -> fulfillSpecialPart)',
      trigger:
        'Khi Kỹ thuật viên gặp ca bệnh hiếm hoặc linh kiện đặc thù chưa có sẵn trong kho và gửi phiếu Yêu cầu linh kiện đặc biệt (SpecialPartsRequestModal) tại /tech.',
      statusLabel: 'Cung ứng Khẩn cấp (waiting_parts -> in_repair)',
      statusType: 'progress',
      resolutionSteps: [
        'Bước 1 (KTV khởi tạo): Đơn sửa chữa tự động tạm dừng thời gian SLA sửa chữa và chuyển sang trạng thái Chờ linh kiện (waiting_parts).',
        'Bước 2 (Thủ kho & Admin/CSKH phối hợp): Thủ kho tra cứu nhà cung ứng tại /partners để báo giá nhập và thời gian hàng về; nếu phát sinh chênh lệch chi phí lớn, phối hợp CSKH thông báo và xin xác nhận của khách hàng.',
        'Bước 3 (Nhập kho & Giải phóng đơn — fulfillSpecialPart): Khi linh kiện về tới kho, Thủ kho tạo mã SKU (nếu là mã mới), lập Phiếu nhập hàng (GoodsReceipt) và bấm xác nhận hoàn tất cung ứng (fulfillSpecialPart) để tự động đẩy đơn từ waiting_parts về lại Đang sửa (in_repair) cho Kỹ thuật viên.',
      ],
      relatedModule: 'Không gian Kỹ thuật (/tech) <-> Kho & Mua hàng (/inventory) <-> Đơn sửa chữa (/repairs)',
    },
    {
      id: 'inv-stocktake-discrepancy-and-doa',
      title: '4. Xử lý Chênh lệch kiểm kê thực tế (Hao hụt / Lỗi linh kiện DOA trả lại Nhà cung cấp) qua InventoryTransaction',
      trigger:
        'Khi kiểm kê định kỳ phát hiện số lượng thực tế trên kệ tủ (shelf_location) lệch so với phần mềm, hoặc phát hiện linh kiện mới nhập bị lỗi nhà sản xuất (DOA — Dead on Arrival).',
      statusLabel: 'Điều chỉnh Kiểm kê (adjustment)',
      statusType: 'danger',
      resolutionSteps: [
        'Truy cập Kho & Mua hàng (/inventory?tab=stock hoặc /inventory?tab=movements) và mở cửa sổ tạo giao dịch điều chỉnh kho (CreatePartTransactionModal).',
        'Chọn đúng mã SKU linh kiện, chọn loại giao dịch Điều chỉnh kiểm kê (adjustment) hoặc Xuất trả Nhà cung cấp, và nhập số lượng chênh lệch thực tế.',
        'Bắt buộc ghi rõ nguyên nhân chi tiết vào trường Lý do / Mã tham chiếu (ví dụ: "Kiểm kê cuối tháng lệch -1 viên pin AirPods Pro 2" hoặc "Xuất trả NCC lô màng loa lỗi DOA theo phiếu PO #...").',
        'Nếu là hàng lỗi DOA trả lại Nhà cung cấp, cập nhật giảm trừ tương ứng vào sổ nợ Nhà cung cấp tại tab Nhà cung cấp & Sổ nợ (/inventory?tab=suppliers).',
      ],
      relatedModule: 'Kho & Mua hàng (/inventory?tab=movements & /inventory?tab=suppliers)',
    },
  ],
  rbacGuardrails: [
    {
      id: 'inv-branch-warehouse-isolation',
      ruleTitle: 'Cô lập Tồn kho Nghiêm ngặt theo Chi nhánh (Branch Warehouse Isolation)',
      policyCode: 'branch-warehouse-isolation',
      severity: 'strict',
      description:
        'Tài khoản Thủ kho được gắn cố định với mã chi nhánh làm việc (branch_id); mọi thao tác tra cứu tồn kho, nhập hàng (GoodsReceipt), xử lý yêu cầu linh kiện và điều chỉnh Thẻ kho tại /inventory chỉ tác động lên kho vật lý của đúng chi nhánh đó (chỉ Quản trị viên admin mới có quyền chuyển đổi xem kho toàn chuỗi).',
      reason:
        'Ngăn chặn tuyệt đối rủi ro xuất nhầm tồn kho hoặc ghi nhận nhầm phiếu nhập hàng giữa các cơ sở khác nhau trong chuỗi cửa hàng.',
    },
    {
      id: 'inv-idempotent-stock-deduction',
      ruleTitle: 'Tự động Trừ kho & Hoàn kho Chống trùng lặp (Idempotency Guard)',
      policyCode: 'idempotent-stock-deduction',
      severity: 'strict',
      description:
        'Các nghiệp vụ trừ kho khi hoàn tất đơn (export_repair) và hoàn kho khi hoàn tiền (return_refund) được vận hành tự động bởi State Machine của hệ thống kèm khóa chống trùng lặp (Idempotency); Thủ kho không cần và không được tự ý trừ tay lần hai đối với các linh kiện đã kê khai trong parts_used của đơn hàng.',
      reason:
        'Đảm bảo tính toàn vẹn 100% giữa trạng thái Đơn sửa chữa, số lượng Tồn kho thực tế và Giá vốn hàng bán (COGS) trên báo cáo tài chính.',
    },
    {
      id: 'inv-cogs-privacy-and-financial-rbac',
      ruleTitle: 'Bảo mật Giá vốn Nhập kho (cost_price / unit_cost) & Phân quyền Nhập hàng Tài chính',
      policyCode: 'cogs-privacy-and-financial-rbac',
      severity: 'strict',
      description:
        'Chỉ vai trò Thủ kho (inventory) và Quản trị viên (admin) mới được cấp quyền xem/cập nhật Giá vốn nhập kho (cost_price / unit_cost), lập Phiếu nhập hàng (GoodsReceipt / PO) và quản lý Sổ nợ Nhà cung cấp; các thông tin nhạy cảm này bị ẩn hoàn toàn đối với Kỹ thuật viên và QC. Ngược lại, Thủ kho không có quyền truy cập vào Sổ quỹ thu ngân (/shifts) hay Thanh toán khách lẻ (/payments).',
      reason:
        'Bảo vệ bí mật thương mại về nguồn cung ứng, chiết khấu nhà cung cấp và biên lợi nhuận gộp của cửa hàng, đồng thời đảm bảo phân tách độc lập giữa Quản trị Kho và Thu ngân Quầy.',
    },
    {
      id: 'inv-mandatory-transaction-reference',
      ruleTitle: 'Bắt buộc Gắn Mã tham chiếu & Lý do trên mọi Biến động Thẻ kho (InventoryTransaction)',
      policyCode: 'mandatory-transaction-reference',
      severity: 'warning',
      description:
        'Mọi bút toán làm thay đổi số lượng tồn kho tại /inventory (bao gồm Nhập hàng PO, Xuất sửa chữa, Hoàn kho, hoặc Điều chỉnh kiểm kê thủ công) đều bắt buộc phải lưu vết đầy đủ: Mã tham chiếu (reference_code / order_code), Lý do biến động (notes), Số lượng trước/sau và Định danh người thực hiện.',
      reason:
        'Tạo chuỗi bằng chứng kiểm toán (Audit Trail) minh bạch 100%, giúp Quản trị viên và Thủ kho truy vết tức thì nguyên nhân bất kỳ sự thay đổi tồn kho nào.',
    },
  ],
};

export default inventoryGuideData;
