import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Checkout Price Edit & Tech 3-Day Scope Test Suite', async (t) => {
  const checkoutModalPath = path.resolve(__dirname, '../app/components/CheckoutHandoverModal.tsx');
  assert.ok(fs.existsSync(checkoutModalPath), 'CheckoutHandoverModal.tsx phải tồn tại');
  const checkoutContent = fs.readFileSync(checkoutModalPath, 'utf-8');

  const intakeModalPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');
  assert.ok(fs.existsSync(intakeModalPath), 'IntakeWizardModal.tsx phải tồn tại');
  const intakeContent = fs.readFileSync(intakeModalPath, 'utf-8');

  const techPagePath = path.resolve(__dirname, '../app/tech/page.tsx');
  assert.ok(fs.existsSync(techPagePath), 'tech/page.tsx phải tồn tại');
  const techContent = fs.readFileSync(techPagePath, 'utf-8');

  const typesPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
  assert.ok(fs.existsSync(typesPath), 'packages/types/src/order.ts phải tồn tại');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');

  await t.test('1. CheckoutHandoverModal: Ô nhập và chỉnh sửa chi phí dịch vụ thực tế với mặc định 0đ cho đơn chưa báo giá', () => {
    // Khởi tạo giá dịch vụ 0đ khi đơn <= 1đ
    assert.ok(
      checkoutContent.includes('const [servicePrice, setServicePrice] = useState<number>(initialRawPrice <= 1 ? 0 : initialRawPrice)'),
      'Phải khởi tạo servicePrice về 0đ nếu đơn ban đầu <= 1đ'
    );

    // Kiểm tra render ô nhập tiền tệ CurrencyInput
    assert.ok(
      checkoutContent.includes('Chi phí sửa chữa / Dịch vụ thực tế'),
      'Phải có khối Chi phí sửa chữa / Dịch vụ thực tế'
    );
    assert.ok(
      checkoutContent.includes('CurrencyInput'),
      'Phải sử dụng CurrencyInput để nhập tiền dịch vụ chuẩn VNĐ'
    );

    // Kiểm tra các chip chọn giá nhanh: 0đ, 150k, 250k, 350k, 500k
    assert.ok(checkoutContent.includes('150000'), 'Phải có gợi ý 150.000 ₫');
    assert.ok(checkoutContent.includes('250000'), 'Phải có gợi ý 250.000 ₫');
    assert.ok(checkoutContent.includes('350000'), 'Phải có gợi ý 350.000 ₫');
    assert.ok(checkoutContent.includes('500000'), 'Phải có gợi ý 500.000 ₫');

    // Badge nhắc nhở đơn chưa báo giá
    assert.ok(
      checkoutContent.includes('Đơn chưa báo giá lúc tiếp nhận'),
      'Phải có thông báo nhẹ khi đơn chưa báo giá lúc tiếp nhận'
    );

    // Truyền service_price trong simpleCheckout
    assert.ok(
      checkoutContent.includes('service_price: servicePrice'),
      'Phải gửi service_price lên Backend API khi xác nhận thu tiền'
    );

    // Cập nhật optimistic đơn hàng
    assert.ok(
      checkoutContent.includes('order.total_price = servicePrice'),
      'Phải cập nhật optimistic total_price của order'
    );
  });

  await t.test('2. IntakeWizardModal: Cho phép tiếp nhận đơn với giá 0 ₫ hoặc để trống khi chưa chốt giá', () => {
    // Kiểm tra nhãn và placeholder chấp nhận 0đ khi chưa báo máy
    assert.ok(
      intakeContent.includes('để 0 ₫ nếu chưa báo máy') || intakeContent.includes('để 0đ nếu chưa báo giá'),
      'Giao diện tiếp nhận phải ghi chú cho phép để 0 ₫ khi chưa báo máy'
    );

    // Kiểm tra logic validation chấp nhận numPrice >= 0
    assert.ok(
      intakeContent.includes('numPrice < 0') || intakeContent.includes('numVal >= 0'),
      'Validation không được chặn đơn giá 0 ₫'
    );

    // Đảm bảo devPrice mặc định 0 nếu để trống
    assert.ok(
      intakeContent.includes('const devPrice = typeof dev.price === \'number\' ? dev.price : 0'),
      'devPrice phải tự động gán về 0 nếu chưa nhập số tiền'
    );
  });

  await t.test('3. TechPage: Bộ lọc thời gian tinh gọn ĐÚNG 2 NÚT BẤM (Hôm nay & 3 ngày qua)', () => {
    // State dateFilter chỉ hỗ trợ 'today' | '3_days'
    assert.ok(
      techContent.includes("useState<'today' | '3_days'>('today')"),
      'State dateFilter của KTV phải là today | 3_days'
    );

    // Nút 1: Hôm nay
    assert.ok(
      techContent.includes('data-testid="tech-date-filter-today"'),
      'Phải có nút bấm lọc Hôm nay (tech-date-filter-today)'
    );

    // Nút 2: 3 ngày qua (Tối đa 3 ngày)
    assert.ok(
      techContent.includes('data-testid="tech-date-filter-3_days"'),
      'Phải có nút bấm lọc 3 ngày qua (tech-date-filter-3_days)'
    );

    // Không còn nút 7 ngày qua
    assert.ok(
      !techContent.includes('data-testid="tech-date-filter-7_days"'),
      'Không được hiển thị nút 7_days trên giao diện KTV'
    );

    // Ghi chú trợ giúp hoàn tất sửa chữa các đơn hôm qua, hôm kia
    assert.ok(
      techContent.includes('3 ngày qua') && techContent.includes('hôm qua, hôm kia và bấm Hoàn thành sửa chữa'),
      'Phải có ghi chú hướng dẫn chọn 3 ngày qua để hoàn tất đơn hôm qua, hôm kia'
    );
  });

  await t.test('4. Shared Types & API Client: Đồng bộ kiểu dữ liệu 3_days và service_price', () => {
    assert.ok(
      typesContent.includes("'3_days'"),
      'OrderDateFilter trong @podscare/types phải chứa 3_days'
    );
    assert.ok(
      typesContent.includes('service_price?: number'),
      'SimpleCheckoutPayload trong @podscare/types phải chứa service_price'
    );
  });
});
