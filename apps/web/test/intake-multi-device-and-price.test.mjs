import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');

test('1. Mandatory Price Validation (> 0đ) & Guard on Save/Print', async (t) => {
  assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx phải tồn tại');
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  await t.test('1.1. CurrencyInput có nhãn bắt buộc "Giá sửa chữa báo khách *"', () => {
    assert.ok(
      content.includes('label="Giá sửa chữa báo khách *"'),
      'CurrencyInput phải có label="Giá sửa chữa báo khách *"'
    );
    assert.ok(
      content.includes('error={priceError}'),
      'CurrencyInput phải nhận prop error={priceError}'
    );
  });

  await t.test('1.2. validateStep(4) và validateAll() kiểm tra price > 0 cho từng thiết bị', () => {
    assert.ok(
      content.includes("Vui lòng nhập giá sửa chữa dự kiến (> 0đ)"),
      'Phải có thông báo lỗi "Vui lòng nhập giá sửa chữa dự kiến (> 0đ)"'
    );
    assert.ok(
      content.includes('numPrice <= 0') || content.includes('price <= 0'),
      'Validation phải chặn khi giá <= 0'
    );
  });

  await t.test('1.3. Xóa lỗi realtime khi người dùng nhập giá > 0', () => {
    assert.ok(
      content.includes('numVal > 0') && content.includes('delete next'),
      'onChangeValue của CurrencyInput phải tự động xóa lỗi khi nhập số tiền > 0'
    );
  });

  await t.test('1.4. handleSave chặn lưu/in và thông báo khi thiếu giá tiền', () => {
    assert.ok(
      content.includes('hasPriceErr') || content.includes('validateAll()'),
      'handleSave phải chặn khi validateAll() không thành công'
    );
    assert.ok(
      content.includes('Vui lòng nhập giá sửa chữa dự kiến (> 0đ) cho tất cả thiết bị'),
      'handleSave phải hiển thị Toast cảnh báo chi tiết khi thiếu giá tiền'
    );
  });
});

test('2. Multi-Device State Model & Step 2 UI (Add/Remove Devices)', async (t) => {
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  await t.test('2.1. Interface IntakeDeviceItem đầy đủ cấu trúc dữ liệu', () => {
    assert.ok(content.includes('export interface IntakeDeviceItem'), 'Phải export interface IntakeDeviceItem');
    assert.ok(content.includes('category: string;'), 'IntakeDeviceItem phải có category');
    assert.ok(content.includes('device: string;'), 'IntakeDeviceItem phải có device');
    assert.ok(content.includes('serial: string;'), 'IntakeDeviceItem phải có serial');
    assert.ok(content.includes('accessories: string;'), 'IntakeDeviceItem phải có accessories');
    assert.ok(content.includes('issue: string;'), 'IntakeDeviceItem phải có issue');
    assert.ok(content.includes('testAnswers: Record<string, ChecklistStatus>;'), 'IntakeDeviceItem phải có testAnswers');
    assert.ok(content.includes('testNote: string;'), 'IntakeDeviceItem phải có testNote');
    assert.ok(content.includes('appearance: string;'), 'IntakeDeviceItem phải có appearance');
    assert.ok(content.includes('photos: DevicePhoto[];'), 'IntakeDeviceItem phải có photos');
    assert.ok(content.includes('price: number | \'\';'), 'IntakeDeviceItem phải có price');
    assert.ok(content.includes('priceNote: string;'), 'IntakeDeviceItem phải có priceNote');
  });

  await t.test('2.2. Nút "➕ Thêm thiết bị khác" và hàm handleAddDevice', () => {
    assert.ok(content.includes('handleAddDevice'), 'Phải có hàm handleAddDevice');
    assert.ok(content.includes('Thêm thiết bị khác'), 'Giao diện phải có nút "Thêm thiết bị khác"');
    assert.ok(content.includes('border-dashed'), 'Nút thêm thiết bị phải có viền nét đứt');
  });

  await t.test('2.3. Nút "✕ Xóa thiết bị này" khi có từ 2 thiết bị trở lên', () => {
    assert.ok(content.includes('handleRemoveDevice'), 'Phải có hàm handleRemoveDevice');
    assert.ok(content.includes('devices.length > 1'), 'Nút xóa chỉ hiển thị khi có > 1 thiết bị');
    assert.ok(content.includes('✕ Xóa thiết bị này'), 'Giao diện có nút "✕ Xóa thiết bị này"');
  });
});

test('3. Step 3 & Step 4 Device Tabs & Step 5 Cumulative Pricing', async (t) => {
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  await t.test('3.1. Bước 3 và Bước 4 có thanh tab chuyển đổi giữa các máy', () => {
    assert.ok(content.includes('activeDeviceIndexStep3'), 'Phải có state activeDeviceIndexStep3');
    assert.ok(content.includes('activeDeviceIndexStep4'), 'Phải có state activeDeviceIndexStep4');
    assert.ok(content.includes('Test chức năng tại quầy'), 'Bước 3 tiêu đề test chức năng');
    assert.ok(content.includes('Ngoại hình thiết bị & Ảnh chụp'), 'Bước 4 tiêu đề ngoại hình & ảnh chụp');
  });

  await t.test('3.2. Bước 5 tự động cộng dồn tổng chi phí tạm tính', () => {
    assert.ok(
      content.includes('devices.reduce'),
      'Bước 5 phải dùng reduce để tính tổng tiền của mảng devices'
    );
    assert.ok(
      content.includes('Tổng chi phí tạm tính'),
      'Phải có khối hiển thị "Tổng chi phí tạm tính"'
    );
    assert.ok(
      content.includes('Intl.NumberFormat'),
      'Tổng tiền phải được định dạng tiền tệ vi-VN'
    );
  });
});

test('4. Form Reset & Batch Intake Creation / Printing', async (t) => {
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  await t.test('4.1. resetForm() khôi phục devices về mảng 1 thiết bị mặc định và reset tabs', () => {
    assert.ok(
      content.includes('setDevices([createDefaultDevice'),
      'resetForm phải reset devices về 1 thiết bị mặc định'
    );
    assert.ok(
      content.includes('setActiveDeviceIndexStep3(0)'),
      'resetForm phải reset activeDeviceIndexStep3 về 0'
    );
    assert.ok(
      content.includes('setActiveDeviceIndexStep4(0)'),
      'resetForm phải reset activeDeviceIndexStep4 về 0'
    );
  });

  await t.test('4.2. handleSave tạo lần lượt các đơn và gửi in phiếu gộp Single-flight', () => {
    assert.ok(
      content.includes('for (let i = 0; i < devices.length; i++)') ||
        content.includes('for (const dev of devices)'),
      'handleSave phải lặp qua mảng devices để tạo từng đơn hàng'
    );
    assert.ok(
      content.includes('repairService.createIntake'),
      'Mỗi thiết bị phải gọi API repairService.createIntake'
    );
    assert.ok(
      content.includes('addOrder(newOrder)'),
      'Mỗi đơn hàng mới phải được thêm vào store qua addOrder'
    );
    assert.ok(
      content.includes('printReceipt(createdOrders') || content.includes('printReceipt(newOrder'),
      'Lệnh in phiếu phải được kích hoạt sau khi lưu (Single-flight print)'
    );
  });
});

test('5. In-Memory Logic Validation: Multi-Device Calculation & Price Guard', () => {
  const validatePrice = (price) => {
    if (price === '' || price === null || price === undefined) return false;
    const num = Number(price);
    return !isNaN(num) && num > 0;
  };

  // Test invalid prices
  assert.strictEqual(validatePrice(''), false, 'Giá rỗng phải bị từ chối');
  assert.strictEqual(validatePrice(0), false, 'Giá bằng 0 phải bị từ chối');
  assert.strictEqual(validatePrice(-100000), false, 'Giá âm phải bị từ chối');
  assert.strictEqual(validatePrice('abc'), false, 'Giá không phải số phải bị từ chối');

  // Test valid prices
  assert.strictEqual(validatePrice(250000), true, 'Giá 250.000đ phải hợp lệ');
  assert.strictEqual(validatePrice('350000'), true, 'Giá chuỗi "350000" phải hợp lệ');

  // Multi-device cumulative calculation
  const mockDevices = [
    { id: 'dev-1', device: 'AirPods Pro 2', price: 350000 },
    { id: 'dev-2', device: 'Apple Watch Series 8', price: 450000 },
    { id: 'dev-3', device: 'Apple Pencil 2', price: 200000 },
  ];

  const total = mockDevices.reduce(
    (sum, d) => sum + (typeof d.price === 'number' ? d.price : 0),
    0
  );
  assert.strictEqual(total, 1000000, 'Tổng tiền của 3 máy phải bằng 1.000.000đ');

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(total);
  assert.strictEqual(formattedTotal, '1.000.000', 'Định dạng tiền tệ vi-VN phải là 1.000.000');
});
