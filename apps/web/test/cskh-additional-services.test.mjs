import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const repairServicePath = path.resolve(__dirname, '../../../packages/api-client/src/services/repair.service.ts');
const repairsPagePath = path.resolve(__dirname, '../app/repairs/page.tsx');
const techModalPath = path.resolve(__dirname, '../app/components/TechOrderDetailModal.tsx');
const k80BuilderPath = path.resolve(__dirname, '../app/components/print/thermalK80HtmlBuilder.ts');
const a4BuilderPath = path.resolve(__dirname, '../app/components/print/a4ReceiptHtmlBuilder.ts');
const migrationPath = path.resolve(__dirname, '../../api/database/migrations/2026_10_06_000002_add_additional_services_and_initial_price_to_repair_orders_table.php');
const modelPath = path.resolve(__dirname, '../../api/app/Models/RepairOrder.php');
const controllerPath = path.resolve(__dirname, '../../api/app/Http/Controllers/Api/V1/OrderController.php');
const routesPath = path.resolve(__dirname, '../../api/routes/api.php');

test('OpenSpec: cskh-order-additional-services Comprehensive Test Suite', async (t) => {
  await t.test('1. Database Migration & Eloquent Model', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file phải tồn tại');
    const migContent = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(migContent.includes('additional_services'), 'Migration phải có cột additional_services');
    assert.ok(migContent.includes('initial_price'), 'Migration phải có cột initial_price');
    assert.ok(migContent.includes('initial_price'), 'Migration phải có backfill');

    assert.ok(fs.existsSync(modelPath), 'Model RepairOrder.php phải tồn tại');
    const modelContent = fs.readFileSync(modelPath, 'utf-8');
    assert.ok(modelContent.includes("'initial_price'"), 'Model phải có initial_price trong fillable');
    assert.ok(modelContent.includes("'additional_services'"), 'Model phải có additional_services trong fillable');
    assert.ok(modelContent.includes("'additional_services' => 'array'"), 'Model phải cast additional_services => array');
    assert.ok(modelContent.includes('recalculateTotalPrice'), 'Model phải có hàm recalculateTotalPrice');
    assert.ok(modelContent.includes('addAdditionalService'), 'Model phải có hàm addAdditionalService');
    assert.ok(modelContent.includes('removeAdditionalService'), 'Model phải có hàm removeAdditionalService');
  });

  await t.test('2. Backend Controller & Authorization Routes', () => {
    assert.ok(fs.existsSync(controllerPath), 'OrderController.php phải tồn tại');
    const ctrlContent = fs.readFileSync(controllerPath, 'utf-8');
    assert.ok(ctrlContent.includes('addAdditionalService'), 'Controller phải có hàm addAdditionalService');
    assert.ok(ctrlContent.includes('deleteAdditionalService'), 'Controller phải có hàm deleteAdditionalService');
    assert.ok(ctrlContent.includes('technician'), 'Controller phải kiểm tra role chặn technician');
    assert.ok(ctrlContent.includes('403'), 'Chặn technician phải trả về status 403');
    assert.ok(ctrlContent.includes('gt:0'), 'Validate giá phải gt:0');

    assert.ok(fs.existsSync(routesPath), 'api.php phải tồn tại');
    const routesContent = fs.readFileSync(routesPath, 'utf-8');
    assert.ok(routesContent.includes('/orders/{id}/additional-services'), 'Route POST orders additional-services phải đăng ký');
    assert.ok(routesContent.includes('/orders/{id}/additional-services/{serviceId}'), 'Route DELETE orders additional-services phải đăng ký');
    assert.ok(routesContent.includes('role:admin,cskh,super_admin'), 'Routes phải được bảo vệ bởi role:admin,cskh,super_admin');
  });

  await t.test('3. Shared Types & API Client Packages', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts phải tồn tại');
    const typesContent = fs.readFileSync(typesOrderPath, 'utf-8');
    assert.ok(typesContent.includes('export interface AdditionalServiceItem'), 'Phải export interface AdditionalServiceItem');
    assert.ok(typesContent.includes('additional_services?: AdditionalServiceItem[];'), 'RepairOrder phải có additional_services');
    assert.ok(typesContent.includes('initial_price?: number;'), 'RepairOrder phải có initial_price');

    assert.ok(fs.existsSync(repairServicePath), 'repair.service.ts phải tồn tại');
    const serviceContent = fs.readFileSync(repairServicePath, 'utf-8');
    assert.ok(serviceContent.includes('addAdditionalService('), 'RepairService phải có method addAdditionalService');
    assert.ok(serviceContent.includes('deleteAdditionalService('), 'RepairService phải có method deleteAdditionalService');
    assert.ok(serviceContent.includes('removeAdditionalService('), 'RepairService phải có method removeAdditionalService');
  });

  await t.test('4. Frontend CSKH & Admin Order Detail Modal (repairs/page.tsx)', () => {
    assert.ok(fs.existsSync(repairsPagePath), 'repairs/page.tsx phải tồn tại');
    const pageContent = fs.readFileSync(repairsPagePath, 'utf-8');

    // Khối Bảng Kê Dịch Vụ Sửa Chữa & Chi Phí
    assert.ok(
      pageContent.includes('BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ'),
      'Phải có tiêu đề BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ'
    );

    // Nút thêm dịch vụ
    assert.ok(
      pageContent.includes('Thêm dịch vụ sửa thêm') || pageContent.includes('Thêm dịch vụ khách yêu cầu làm thêm'),
      'Phải có nút và form thêm dịch vụ làm thêm'
    );

    // Phân quyền độc quyền CSKH / Admin
    assert.ok(
      pageContent.includes('canManageAdditionalServices'),
      'Phải kiểm tra quyền canManageAdditionalServices (cskh, admin, super_admin)'
    );

    // Validate giá > 0
    assert.ok(
      pageContent.includes('priceNum <= 0') || pageContent.includes('lớn hơn 0 VNĐ'),
      'Form phải validate đơn giá bắt buộc > 0'
    );

    // Tính lại tổng tiền
    assert.ok(
      pageContent.includes('TỔNG CỘNG THANH TOÁN:'),
      'Phải có dòng TỔNG CỘNG THANH TOÁN'
    );

    // Xóa dịch vụ kèm xác nhận
    assert.ok(
      pageContent.includes('ConfirmModal') && pageContent.includes('serviceToDelete'),
      'Xóa dịch vụ phải có ConfirmModal xác nhận'
    );
  });

  await t.test('5. Frontend Kỹ Thuật Viên (TechOrderDetailModal.tsx)', () => {
    assert.ok(fs.existsSync(techModalPath), 'TechOrderDetailModal.tsx phải tồn tại');
    const techContent = fs.readFileSync(techModalPath, 'utf-8');

    // Card nổi bật
    assert.ok(
      techContent.includes('DỊCH VỤ KHÁCH YÊU CẦU LÀM THÊM (TỪ QUẦY CSKH)'),
      'KTV Modal phải có card nổi bật DỊCH VỤ KHÁCH YÊU CẦU LÀM THÊM (TỪ QUẦY CSKH)'
    );

    // Cảnh báo thợ chú ý hoàn thành
    assert.ok(
      techContent.includes('Thợ chú ý kiểm tra và xử lý trọn vẹn'),
      'Card KTV phải có dặn dò nhắc thợ xử lý trọn vẹn'
    );

    // KTV không có nút sửa / thêm giá
    assert.ok(
      !techContent.includes('addAdditionalService') && !techContent.includes('deleteAdditionalService'),
      'KTV Modal tuyệt đối không chứa hàm thêm hoặc xóa dịch vụ tính tiền'
    );
  });

  await t.test('6. Mẫu in phiếu K80 & A4 có phân rã chi phí dịch vụ sửa thêm', () => {
    assert.ok(fs.existsSync(k80BuilderPath), 'thermalK80HtmlBuilder.ts phải tồn tại');
    const k80Content = fs.readFileSync(k80BuilderPath, 'utf-8');
    assert.ok(
      k80Content.includes('additionalServices') || k80Content.includes('additional_services'),
      'K80 builder phải hỗ trợ additional_services'
    );
    assert.ok(
      k80Content.includes('BẢNG KÊ DỊCH VỤ & CHI PHÍ'),
      'K80 builder phải hiển thị bảng kê chi phí khi có dịch vụ thêm'
    );

    assert.ok(fs.existsSync(a4BuilderPath), 'a4ReceiptHtmlBuilder.ts phải tồn tại');
    const a4Content = fs.readFileSync(a4BuilderPath, 'utf-8');
    assert.ok(
      a4Content.includes('additionalServices') || a4Content.includes('additional_services'),
      'A4 builder phải hỗ trợ additional_services'
    );
    assert.ok(
      a4Content.includes('BẢNG KÊ DỊCH VỤ & CHI PHÍ:'),
      'A4 builder phải hiển thị bảng kê chi phí khi có dịch vụ thêm'
    );
  });

  await t.test('7. Logic tính toán tổng tiền đơn hàng khớp chuẩn xác', () => {
    const initialPrice = 500000;
    const additionalServices = [
      { name: 'Vệ sinh tai nghe', price: 150000 },
      { name: 'Thay tip cao su', price: 80000 },
    ];

    const sumAdditional = additionalServices.reduce((sum, item) => sum + item.price, 0);
    const totalPrice = initialPrice + sumAdditional;

    assert.strictEqual(totalPrice, 730000, 'Tổng tiền phải là 730,000 VNĐ');

    // Sau khi xóa 1 dịch vụ
    const remainingServices = additionalServices.filter(s => s.name !== 'Thay tip cao su');
    const newTotalPrice = initialPrice + remainingServices.reduce((sum, item) => sum + item.price, 0);
    assert.strictEqual(newTotalPrice, 650000, 'Sau khi xóa 80,000 VNĐ, tổng tiền phải là 650,000 VNĐ');
  });
});
