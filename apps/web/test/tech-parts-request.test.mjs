import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const repairServicePath = path.resolve(__dirname, '../../../packages/api-client/src/services/repair.service.ts');
const techModalPath = path.resolve(__dirname, '../app/components/TechOrderDetailModal.tsx');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const fsmPath = path.resolve(__dirname, '../app/repairs/fsm.ts');

test('OpenSpec: tech-parts-request-and-admin-resume Test Suite', async (t) => {
  await t.test('Task 3.1 & 3.2: Shared Types và RepairService hỗ trợ parts_needed và updatePartsNote', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts phải tồn tại');
    const typesContent = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(
      typesContent.includes('parts_needed?: string | null;'),
      'RepairOrder interface phải chứa parts_needed?: string | null;'
    );
    assert.ok(
      typesContent.includes('paused_at?: string | null;'),
      'RepairOrder interface phải chứa paused_at?: string | null;'
    );

    assert.ok(fs.existsSync(repairServicePath), 'repair.service.ts phải tồn tại');
    const serviceContent = fs.readFileSync(repairServicePath, 'utf-8');
    assert.ok(
      serviceContent.includes('async updatePartsNote('),
      'RepairService phải có method updatePartsNote'
    );
    assert.ok(
      serviceContent.includes('/parts-note'),
      'updatePartsNote phải gọi API endpoint /parts-note'
    );
  });

  await t.test('Task 4.1 & 4.2: TechOrderDetailModal tích hợp Combobox kho linh kiện và khối Yêu cầu linh kiện', () => {
    assert.ok(fs.existsSync(techModalPath), 'TechOrderDetailModal.tsx phải tồn tại');
    const modalContent = fs.readFileSync(techModalPath, 'utf-8');

    // Import inventoryService
    assert.ok(
      modalContent.includes('inventoryService'),
      'TechOrderDetailModal phải import inventoryService từ @podscare/api-client'
    );

    // Tiêu đề khối chuyên dụng
    assert.ok(
      modalContent.includes('YÊU CẦU & GHI CHÚ LINH KIỆN'),
      'Khối 2 phải có tiêu đề YÊU CẦU & GHI CHÚ LINH KIỆN'
    );

    // Combobox và dropdown suggestions
    assert.ok(
      modalContent.includes('inventoryParts') && modalContent.includes('showSuggestions'),
      'Modal phải có state quản lý danh sách và hiển thị dropdown linh kiện kho'
    );
    assert.ok(
      modalContent.includes('inventoryService.getParts'),
      'Modal phải gọi inventoryService.getParts để tìm kiếm linh kiện trong kho'
    );
  });

  await t.test('Task 4.3: TechOrderDetailModal có 2 nút thao tác riêng biệt: Lưu ghi chú và Báo tạm dừng', () => {
    const modalContent = fs.readFileSync(techModalPath, 'utf-8');

    // Nút Lưu ghi chú linh kiện
    assert.ok(
      modalContent.includes('Lưu ghi chú linh kiện'),
      'Modal phải có nút Lưu ghi chú linh kiện'
    );
    assert.ok(
      modalContent.includes('handleSavePartsNote') && modalContent.includes('updatePartsNote'),
      'handleSavePartsNote phải gọi repairService.updatePartsNote'
    );

    // Nút Báo cần linh kiện & Tạm dừng
    assert.ok(
      modalContent.includes('Báo cần linh kiện & Tạm dừng'),
      'Modal phải có nút Báo cần linh kiện & Tạm dừng'
    );
    assert.ok(
      modalContent.includes('handleRequestPartsAndPause') && modalContent.includes("transition: 'waiting_parts'"),
      'handleRequestPartsAndPause phải gọi repairService.transition với transition: waiting_parts'
    );
  });

  await t.test('Task 4.4: Tự động điền dữ liệu gợi ý từ parts_needed sang partsUsed khi hoàn thành ca sửa', () => {
    const modalContent = fs.readFileSync(techModalPath, 'utf-8');

    assert.ok(
      modalContent.includes('order.parts_needed') || modalContent.includes('order.partsNeeded'),
      'Modal phải đọc dữ liệu parts_needed từ order'
    );
    assert.ok(
      modalContent.includes('effectivePartsUsed = partsUsed.trim() || partsNeeded.trim()'),
      'handleCompleteRepair phải tự động lấy partsNeeded điền vào partsUsed nếu partsUsed đang trống'
    );
  });

  await t.test('Task 5.1 & 5.2: repairs/page.tsx hiển thị Badge linh kiện và nút bấm tiếp tục sửa cho Admin/CSKH', () => {
    assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx phải tồn tại');
    const pageContent = fs.readFileSync(repairsPagePath, 'utf-8');

    // Mapping parts_needed và paused_at trong filteredOrders
    assert.ok(
      pageContent.includes('parts_needed: o.parts_needed') && pageContent.includes('paused_at: o.paused_at'),
      'filteredOrders phải map parts_needed và paused_at'
    );

    // Badge trên bảng danh sách
    assert.ok(
      pageContent.includes('Cần:') && pageContent.includes('o.parts_needed'),
      'Bảng danh sách đơn hàng phải hiển thị badge Cần: [linh kiện] khi có yêu cầu linh kiện'
    );

    // Nút Đã có linh kiện trên bảng danh sách
    assert.ok(
      pageContent.includes('▶ Đã có linh kiện') && pageContent.includes('handleResumeOrder(o)'),
      'Cột thao tác của bảng danh sách phải có nút Đã có linh kiện gọi handleResumeOrder'
    );

    // Khối cảnh báo màu cam nổi bật trong modal chi tiết
    assert.ok(
      pageContent.includes('YÊU CẦU LINH KIỆN TỪ PHÒNG KỸ THUẬT'),
      'Modal chi tiết CSKH phải có khung cảnh báo YÊU CẦU LINH KIỆN TỪ PHÒNG KỸ THUẬT'
    );
    assert.ok(
      pageContent.includes('▶ Đã có linh kiện - Báo KTV tiếp tục sửa'),
      'Modal chi tiết CSKH phải có nút ▶ Đã có linh kiện - Báo KTV tiếp tục sửa'
    );
  });

  await t.test('Task 5.2 & 5.3: FSM Workflow cho phép vai trò CSKH tiếp tục sửa chữa khi chờ linh kiện', () => {
    assert.ok(fs.existsSync(fsmPath), 'fsm.ts phải tồn tại');
    const fsmContent = fs.readFileSync(fsmPath, 'utf-8');

    assert.ok(
      fsmContent.includes("waiting_parts") && fsmContent.includes("targetStatus: 'in_repair'"),
      'FSM_QUICK_ACTIONS.waiting_parts phải cho phép chuyển sang in_repair'
    );
    assert.ok(
      fsmContent.includes("normalized === 'waiting_parts'") && fsmContent.includes("userRole === 'cskh'"),
      'getQuickActionsForStatus phải cho phép vai trò cskh kích hoạt mở lại đơn waiting_parts'
    );
  });
});
