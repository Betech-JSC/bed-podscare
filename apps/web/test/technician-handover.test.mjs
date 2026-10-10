import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Technician Order Handover and Reassignment Test Suite', async (t) => {
  const handoverModalPath = path.resolve(__dirname, '../app/components/HandoverTechModal.tsx');
  assert.ok(fs.existsSync(handoverModalPath), 'HandoverTechModal.tsx phải tồn tại');
  const handoverContent = fs.readFileSync(handoverModalPath, 'utf-8');

  const techDetailModalPath = path.resolve(__dirname, '../app/components/TechOrderDetailModal.tsx');
  assert.ok(fs.existsSync(techDetailModalPath), 'TechOrderDetailModal.tsx phải tồn tại');
  const techDetailContent = fs.readFileSync(techDetailModalPath, 'utf-8');

  const techPagePath = path.resolve(__dirname, '../app/tech/page.tsx');
  assert.ok(fs.existsSync(techPagePath), 'tech/page.tsx phải tồn tại');
  const techPageContent = fs.readFileSync(techPagePath, 'utf-8');

  const typesPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
  assert.ok(fs.existsSync(typesPath), 'packages/types/src/order.ts phải tồn tại');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');

  const apiClientPath = path.resolve(__dirname, '../../../packages/api-client/src/services/repair.service.ts');
  assert.ok(fs.existsSync(apiClientPath), 'packages/api-client/src/services/repair.service.ts phải tồn tại');
  const apiClientContent = fs.readFileSync(apiClientPath, 'utf-8');

  await t.test('1. TypeScript Types & API Client Service', () => {
    // Check HandoverReasonTag & HandoverPayload in @podscare/types
    assert.ok(
      typesContent.includes('export type HandoverReasonTag'),
      'Phải định nghĩa type HandoverReasonTag'
    );
    assert.ok(
      typesContent.includes('wrong_order') &&
      typesContent.includes('complex_repair') &&
      typesContent.includes('shift_change') &&
      typesContent.includes('missing_parts_tools'),
      'HandoverReasonTag phải chứa 4 tag chuẩn'
    );
    assert.ok(
      typesContent.includes('export interface HandoverPayload'),
      'Phải định nghĩa interface HandoverPayload'
    );
    assert.ok(
      typesContent.includes("target: 'queue' | 'technician'"),
      'HandoverPayload target phải gồm queue hoặc technician'
    );

    // Check handoverOrder in repair.service.ts
    assert.ok(
      apiClientContent.includes('handoverOrder('),
      'RepairService phải có phương thức handoverOrder'
    );
    assert.ok(
      apiClientContent.includes('/api/v1/orders/${id}/handover') ||
      apiClientContent.includes('/api/v1/orders/') && apiClientContent.includes('/handover'),
      'handoverOrder phải gọi đúng endpoint POST /api/v1/orders/{id}/handover'
    );
  });

  await t.test('2. HandoverTechModal: Giao diện bàn giao KTV & hoàn trả hàng đợi chung', () => {
    // Tải danh sách KTV chi nhánh qua userService
    assert.ok(
      handoverContent.includes('userService.getUsers({ role: \'technician\'') ||
      handoverContent.includes('userService') && handoverContent.includes('getUsers'),
      'Modal phải nạp danh sách KTV cùng chi nhánh qua userService.getUsers'
    );

    // Tự động lọc bỏ chính KTV đang đăng nhập
    assert.ok(
      handoverContent.includes('peerTechnicians') ||
      handoverContent.includes('currentUser?.id') ||
      handoverContent.includes('currentId'),
      'Phải loại trừ KTV hiện tại khỏi danh bạ người nhận'
    );

    // Dropdown có tùy chọn trả về hàng đợi chung
    assert.ok(
      handoverContent.includes('Trả về hàng đợi chung') ||
      handoverContent.includes('queue'),
      'Phải có lựa chọn Trả về hàng đợi chung (queue)'
    );

    // 4 Thẻ lý do chuẩn hóa
    assert.ok(handoverContent.includes('wrong_order') && handoverContent.includes('Nhận nhầm đơn'), 'Có thẻ Nhận nhầm đơn');
    assert.ok(handoverContent.includes('complex_repair') && handoverContent.includes('Máy khó'), 'Có thẻ Máy khó / Cần thợ chuyên');
    assert.ok(handoverContent.includes('shift_change') && handoverContent.includes('Đổi ca'), 'Có thẻ Đổi ca / Hết giờ làm');
    assert.ok(handoverContent.includes('missing_parts_tools') && handoverContent.includes('Thiếu linh kiện'), 'Có thẻ Thiếu linh kiện / Dụng cụ');

    // Ràng buộc kiểm tra độ dài tối thiểu 3 ký tự cho ca máy khó
    assert.ok(
      handoverContent.includes('notesLength < 3') ||
      handoverContent.includes('notesLength >= 3') ||
      handoverContent.includes('3 ký tự'),
      'Phải kiểm tra độ dài tối thiểu 3 ký tự khi chọn ca máy khó'
    );

    // Gọi repairService.handoverOrder khi submit
    assert.ok(
      handoverContent.includes('repairService.handoverOrder'),
      'Phải gọi repairService.handoverOrder'
    );

    // Sử dụng màu Calm Jade chuẩn PodsCare Design System
    assert.ok(
      handoverContent.includes('#176b58') || handoverContent.includes('#125848'),
      'Phải tuân thủ mã màu Calm Jade chuẩn'
    );
  });

  await t.test('3. TechOrderDetailModal: Tích hợp nút Bàn giao KTV khác khi đơn active', () => {
    // Import HandoverTechModal
    assert.ok(
      techDetailContent.includes('HandoverTechModal'),
      'TechOrderDetailModal phải import HandoverTechModal'
    );

    // Nút Bàn giao KTV khác hiển thị khi isActive
    assert.ok(
      techDetailContent.includes('isActive') && techDetailContent.includes('Bàn giao KTV khác'),
      'Phải có nút [Bàn giao KTV khác] khi đơn ở trạng thái isActive'
    );

    // Render HandoverTechModal và truyền callbacks
    assert.ok(
      techDetailContent.includes('<HandoverTechModal'),
      'Phải render component HandoverTechModal'
    );
    assert.ok(
      techDetailContent.includes('isHandoverOpen'),
      'Phải quản lý state mở/đóng modal bàn giao qua isHandoverOpen'
    );
  });

  await t.test('4. TechPage: Tích hợp nút thao tác nhanh [🔄 Bàn giao] trên từng thẻ đơn của tôi', () => {
    // Import HandoverTechModal
    assert.ok(
      techPageContent.includes('HandoverTechModal'),
      'tech/page.tsx phải import HandoverTechModal'
    );

    // Thêm nút Bàn giao trên thẻ đơn
    assert.ok(
      techPageContent.includes('🔄 Bàn giao') || techPageContent.includes('Bàn giao'),
      'Thẻ đơn myActiveOrders phải có nút [🔄 Bàn giao]'
    );
    assert.ok(
      techPageContent.includes('handleOpenHandoverModal'),
      'Bấm nút bàn giao phải gọi handleOpenHandoverModal'
    );

    // Quản lý modal bàn giao và refetch sau khi bàn giao
    assert.ok(
      techPageContent.includes('handoverModalOpen'),
      'tech/page.tsx phải quản lý state handoverModalOpen'
    );
    assert.ok(
      techPageContent.includes('<HandoverTechModal'),
      'tech/page.tsx phải render HandoverTechModal'
    );
  });
});
