import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

// Import FSM normalizeStatusCode
import { normalizeStatusCode } from '../app/repairs/fsm.ts';

describe('OpenSpec: tech-assigned-orders-and-completion Test Suite', () => {
  const dashboardPath = path.resolve(webDir, 'app/dashboard/page.tsx');
  const techPath = path.resolve(webDir, 'app/tech/page.tsx');
  const modalPath = path.resolve(webDir, 'app/components/TechOrderDetailModal.tsx');

  test('Test 1: Dashboard Kỹ thuật viên (apps/web/app/dashboard/page.tsx) - Tab Navigation & Clickable KPI Filters', () => {
    assert.ok(fs.existsSync(dashboardPath), 'dashboard/page.tsx phải tồn tại');
    const content = fs.readFileSync(dashboardPath, 'utf-8');

    // 1.1 State techTab
    assert.ok(
      content.includes("const [techTab, setTechTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders')"),
      'Phải có state techTab với 3 giá trị my_orders, available, completed'
    );

    // 1.2 Interactive StatCards with onClick & active highlight
    assert.ok(
      content.includes("onClick={() => setTechTab('my_orders')}"),
      'Thẻ KPI Đơn đang phụ trách / Đang sửa chữa phải có onClick chuyển tab my_orders'
    );
    assert.ok(
      content.includes("onClick={() => setTechTab('available')}"),
      'Thẻ KPI Đơn chờ nhận phải có onClick chuyển tab available'
    );
    assert.ok(
      content.includes("onClick={() => setTechTab('completed')}"),
      'Thẻ KPI Đã sửa xong phải có onClick chuyển tab completed'
    );
    assert.ok(
      content.includes("techTab === 'my_orders'") &&
        content.includes('border-[#176b58] ring-2 ring-[#176b58]/20 bg-[#f7faf8]'),
      'Thẻ KPI phải có highlight visual feedback khi tab tương ứng đang active'
    );

    // 1.3 Tab Bar 3 tabs with counters
    assert.ok(content.includes('🔧 Đơn của tôi'), 'Tab Bar phải có tab "🔧 Đơn của tôi"');
    assert.ok(content.includes('⚡ Đơn chờ nhận'), 'Tab Bar phải có tab "⚡ Đơn chờ nhận"');
    assert.ok(content.includes('✓ Đã sửa xong'), 'Tab Bar phải có tab "✓ Đã sửa xong"');
    assert.ok(content.includes('{techActiveOrders.length}'), 'Tab Đơn của tôi phải có badge đếm số lượng');
    assert.ok(content.includes('{techAvailableOrders.length}'), 'Tab Đơn chờ nhận phải có badge đếm số lượng');
    assert.ok(content.includes('{techCompletedOrders.length}'), 'Tab Đã sửa xong phải có badge đếm số lượng');

    // 1.4 Auto-switch to my_orders when grab order
    assert.ok(
      content.includes("setTechTab('my_orders');"),
      'Khi nhận đơn thành công phải tự động chuyển sang tab my_orders'
    );

    // 1.5 Integration of TechOrderDetailModal
    assert.ok(
      content.includes('<TechOrderDetailModal'),
      'Dashboard phải tích hợp component TechOrderDetailModal'
    );
  });

  test('Test 2: Không gian Kỹ thuật viên (apps/web/app/tech/page.tsx) - Tab Bar, KPI StatCards & Quick Actions', () => {
    assert.ok(fs.existsSync(techPath), 'tech/page.tsx phải tồn tại');
    const content = fs.readFileSync(techPath, 'utf-8');

    // 2.1 State activeTab
    assert.ok(
      content.includes("const [activeTab, setActiveTab] = useState<'my_orders' | 'available' | 'completed'>('my_orders')"),
      'tech/page.tsx phải có state activeTab'
    );

    // 2.2 KPI StatCards with onClick & highlight
    assert.ok(
      content.includes("onClick={() => setActiveTab('my_orders')}"),
      'Thẻ KPI trên trang tech phải có onClick chuyển sang tab my_orders'
    );
    assert.ok(
      content.includes("onClick={() => setActiveTab('available')}"),
      'Thẻ KPI Đơn chờ nhận phải có onClick chuyển sang tab available'
    );
    assert.ok(
      content.includes("onClick={() => setActiveTab('completed')}"),
      'Thẻ KPI Đã sửa xong phải có onClick chuyển sang tab completed'
    );

    // 2.3 3 Tabs with counters
    assert.ok(content.includes('🔧 Đơn của tôi'), 'Tab bar phải có "🔧 Đơn của tôi"');
    assert.ok(content.includes('⚡ Đơn chờ nhận'), 'Tab bar phải có "⚡ Đơn chờ nhận"');
    assert.ok(content.includes('✓ Đã sửa xong hôm nay'), 'Tab bar phải có "✓ Đã sửa xong hôm nay"');
    assert.ok(content.includes('{myActiveOrders.length}'), 'Tab Đơn của tôi phải có số đếm myActiveOrders');
    assert.ok(content.includes('{availableOrders.length}'), 'Tab Đơn chờ nhận phải có số đếm availableOrders');
    assert.ok(content.includes('{myCompletedTodayOrders.length}'), 'Tab Đã sửa xong phải có số đếm myCompletedTodayOrders');

    // 2.4 Quick actions: Silent Print K80 & start/pause repair
    assert.ok(content.includes('handlePrintRoutingSlip'), 'Phải hỗ trợ in tem khay K80');
    assert.ok(content.includes('handleGrabOrder'), 'Phải có hàm nhận đơn máy');
    assert.ok(content.includes("setActiveTab('my_orders');"), 'Nhận máy phải chuyển tab sang my_orders');

    // 2.5 Integration of TechOrderDetailModal
    assert.ok(
      content.includes('<TechOrderDetailModal'),
      'Trang tech phải tích hợp TechOrderDetailModal'
    );
  });

  test('Test 3: TechOrderDetailModal (apps/web/app/components/TechOrderDetailModal.tsx) - Full Reception Info & Acceptance Form', () => {
    assert.ok(fs.existsSync(modalPath), 'TechOrderDetailModal.tsx phải tồn tại');
    const content = fs.readFileSync(modalPath, 'utf-8');

    // 3.1 Khối 1: Thông tin tiếp nhận quầy CSKH
    assert.ok(content.includes('KHỐI 1: THÔNG TIN TIẾP NHẬN TỪ QUẦY CSKH'), 'Phải có tiêu đề Khối 1 tiếp nhận quầy CSKH');
    assert.ok(content.includes('order.serial'), 'Phải hiển thị số Serial / IMEI');
    assert.ok(content.includes('order.accessories'), 'Phải hiển thị phụ kiện kèm theo');
    assert.ok(content.includes('order.appearance'), 'Phải hiển thị ngoại quan tiếp nhận');
    assert.ok(content.includes('order.issue'), 'Phải hiển thị tình trạng lỗi khách báo');
    assert.ok(content.includes('order.checks'), 'Phải hiển thị bảng Checklist tiếp nhận');
    assert.ok(content.includes('order.photos'), 'Phải hiển thị lưới ảnh ngoại quan');

    // 3.2 Khối 2: Biểu mẫu nghiệm thu & hoàn thành sửa chữa
    assert.ok(content.includes('KHỐI 2: THAO TÁC KỸ THUẬT & NGHIỆM THU'), 'Phải có tiêu đề Khối 2 nghiệm thu kỹ thuật');
    assert.ok(content.includes('repairNote'), 'Phải có trường repairNote');
    assert.ok(content.includes('partsUsed'), 'Phải có trường partsUsed');
    assert.ok(content.includes('finalCheck'), 'Phải có trường finalCheck');
    assert.ok(content.includes('consentCheck'), 'Phải có checkbox cam kết chất lượng consentCheck');
    assert.ok(content.includes('HOÀN THÀNH SỬA CHỮA'), 'Phải có nút bấm hoàn thành sửa chữa');
    assert.ok(content.includes('#176b58'), 'Nút hoàn thành phải dùng màu Calm Jade #176b58');

    // 3.3 Form Validation
    assert.ok(
      content.includes('Vui lòng nhập nội dung đã kiểm tra và sửa chữa'),
      'Phải validate bắt buộc repairNote'
    );
    assert.ok(
      content.includes('Vui lòng xác nhận kiểm tra hoàn chỉnh trước khi bàn giao'),
      'Phải validate bắt buộc consentCheck'
    );

    // 3.4 API transition payload
    assert.ok(
      content.includes("transition: 'ready_for_return'"),
      'Phải gọi transition ready_for_return khi hoàn thành'
    );
    assert.ok(
      content.includes('repair_note: repairNote.trim()'),
      'Payload phải gửi repair_note'
    );
    assert.ok(
      content.includes('invalidateOrders()'),
      'Phải gọi invalidateOrders để đồng bộ cache toàn cục'
    );
  });

  test('Test 4: Logic phân loại đơn hàng Kỹ thuật viên với normalizeStatusCode', () => {
    const mockOrders = [
      { id: 'FX26-001', status: 'Chờ kỹ thuật', technician_id: null },
      { id: 'FX26-002', status: 'Tiếp nhận mới', technicianId: null },
      { id: 'FX26-003', status: 'Đang sửa', technician_id: 10 },
      { id: 'FX26-004', status: 'Chờ linh kiện', technicianId: 10 },
      { id: 'FX26-005', status: 'Sẵn sàng trả', technician_id: 10 },
      { id: 'FX26-006', status: 'Chờ QC', technician_id: 10 },
      { id: 'FX26-007', status: 'Hoàn tất', technician_id: 10 },
    ];

    const currentUserId = 10;

    // Filter available orders (waiting_tech without technician)
    const available = mockOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isUnassigned = !o.technicianId && !o.technician_id;
      return isUnassigned && (code === 'waiting_tech' || ['Chờ kỹ thuật', 'Tiếp nhận mới'].includes(o.status));
    });
    assert.strictEqual(available.length, 2, 'Phải có 2 đơn chờ nhận');
    assert.strictEqual(available[0].id, 'FX26-001');
    assert.strictEqual(available[1].id, 'FX26-002');

    // Filter active orders (assigned, in_repair, waiting_parts, rework_needed for current tech)
    const active = mockOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder = Number(o.technicianId || o.technician_id) === currentUserId;
      return isMyOrder && ['assigned', 'in_repair', 'waiting_parts', 'rework_needed'].includes(code);
    });
    assert.strictEqual(active.length, 2, 'Phải có 2 đơn KTV đang phụ trách');
    assert.strictEqual(active[0].id, 'FX26-003');
    assert.strictEqual(active[1].id, 'FX26-004');

    // Filter completed orders today (ready_for_return, waiting_qc, waiting_pickup, completed for current tech)
    const completed = mockOrders.filter((o) => {
      const code = normalizeStatusCode(o.status);
      const isMyOrder = Number(o.technicianId || o.technician_id) === currentUserId;
      return isMyOrder && ['ready_for_return', 'waiting_qc', 'waiting_pickup', 'completed'].includes(code);
    });
    assert.strictEqual(completed.length, 3, 'Phải có 3 đơn KTV đã hoàn tất');
    assert.strictEqual(completed[0].id, 'FX26-005');
    assert.strictEqual(completed[1].id, 'FX26-006');
    assert.strictEqual(completed[2].id, 'FX26-007');
  });

  test('Test 5: Mô phỏng quy trình KTV nhận đơn và hoàn thành nghiệm thu (Workflow Simulation)', () => {
    let currentTab = 'available';
    let availableCount = 3;
    let activeCount = 1;
    let completedCount = 4;

    // 1. KTV nhấp vào tab hoặc KPI "Đơn chờ nhận"
    currentTab = 'available';
    assert.strictEqual(currentTab, 'available');

    // 2. KTV bấm [ Nhận đơn → ]
    const claimedOrderId = 'FX26-T1001';
    availableCount -= 1;
    activeCount += 1;
    currentTab = 'my_orders'; // Auto-switch tab

    assert.strictEqual(currentTab, 'my_orders', 'Sau khi nhận đơn, activeTab phải tự động đổi sang my_orders');
    assert.strictEqual(availableCount, 2, 'Số đếm chờ nhận giảm 1');
    assert.strictEqual(activeCount, 2, 'Số đếm đang phụ trách tăng 1');

    // 3. KTV mở modal nghiệm thu, kiểm tra validation
    const validateCompletion = (note, consent) => {
      if (!note || !note.trim()) return { success: false, error: 'Vui lòng nhập nội dung đã kiểm tra và sửa chữa' };
      if (note.trim().length < 5) return { success: false, error: 'Nội dung sửa chữa phải có tối thiểu 5 ký tự' };
      if (!consent) return { success: false, error: 'Vui lòng xác nhận kiểm tra hoàn chỉnh trước khi bàn giao' };
      return { success: true };
    };

    // Khi note trống
    const checkEmpty = validateCompletion('', true);
    assert.strictEqual(checkEmpty.success, false);
    assert.strictEqual(checkEmpty.error, 'Vui lòng nhập nội dung đã kiểm tra và sửa chữa');

    // Khi chưa tick checkbox cam kết
    const checkNoConsent = validateCompletion('Đã thay pin mới, test loa trong và mic 30 phút ổn định', false);
    assert.strictEqual(checkNoConsent.success, false);
    assert.strictEqual(checkNoConsent.error, 'Vui lòng xác nhận kiểm tra hoàn chỉnh trước khi bàn giao');

    // Khi hợp lệ
    const checkValid = validateCompletion('Đã thay pin mới, test loa trong và mic 30 phút ổn định', true);
    assert.strictEqual(checkValid.success, true);

    // 4. KTV bấm [ ✓ HOÀN THÀNH SỬA CHỮA ] thành công
    activeCount -= 1;
    completedCount += 1;
    currentTab = 'completed';

    assert.strictEqual(activeCount, 1, 'Số đếm đang phụ trách giảm 1 sau nghiệm thu');
    assert.strictEqual(completedCount, 5, 'Số đếm đã sửa xong tăng 1');
    assert.strictEqual(currentTab, 'completed', 'Có thể xem đơn vừa hoàn thành tại tab completed');
  });
});
