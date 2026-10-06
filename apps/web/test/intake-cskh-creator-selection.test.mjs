import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const typesOrderPath = path.resolve(__dirname, '../../../packages/types/src/order.ts');
const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');

test('OpenSpec: intake-cskh-creator-selection Test Suite', async (t) => {
  await t.test('Task 2.1: packages/types/src/order.ts export CreateIntakeDTO có created_by_user_id', () => {
    assert.ok(fs.existsSync(typesOrderPath), 'packages/types/src/order.ts phải tồn tại');
    const content = fs.readFileSync(typesOrderPath, 'utf-8');

    // CreateIntakeDTO có trường created_by_user_id
    assert.ok(
      content.includes('created_by_user_id?: number | string;'),
      'CreateIntakeDTO phải chứa trường created_by_user_id?: number | string;'
    );

    // RepairOrder có quan hệ và ID creator
    assert.ok(
      content.includes('created_by_user_id?: number | string | null;'),
      'RepairOrder phải chứa created_by_user_id?: number | string | null;'
    );
    assert.ok(
      content.includes('created_by_user?: {'),
      'RepairOrder phải chứa quan hệ created_by_user?: {...}'
    );
  });

  await t.test('Task 2.2: IntakeWizardModal imports userService và quản lý danh sách CSKH', () => {
    assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx phải tồn tại');
    const content = fs.readFileSync(intakeWizardPath, 'utf-8');

    // Import userService từ @podscare/api-client
    assert.ok(
      content.includes('userService') && content.includes("from '@podscare/api-client'"),
      'IntakeWizardModal phải import userService từ @podscare/api-client'
    );

    // State cskhUsers và selectedCskhId
    assert.ok(
      content.includes('const [cskhUsers, setCskhUsers] = useState'),
      'IntakeWizardModal phải có state cskhUsers'
    );
    assert.ok(
      content.includes('const [selectedCskhId, setSelectedCskhId] = useState'),
      'IntakeWizardModal phải có state selectedCskhId'
    );

    // Gọi userService.getUsers nạp CSKH
    assert.ok(
      content.includes("userService\n      .getUsers({ role: 'cskh', is_active: true, per_page: 100 })") ||
      content.includes("role: 'cskh', is_active: true"),
      'IntakeWizardModal phải gọi userService.getUsers({ role: "cskh", is_active: true })'
    );
  });

  await t.test('Task 2.2: Auto-select thông minh và Fallback Option khi danh sách CSKH rỗng', () => {
    const content = fs.readFileSync(intakeWizardPath, 'utf-8');

    // Auto-select khi currentUser là CSKH
    assert.ok(
      content.includes("currentUser?.role === 'cskh'") && content.includes('setSelectedCskhId(String(currentUser.id))'),
      'Auto-select phải gán selectedCskhId = String(currentUser.id) khi currentUser là cskh'
    );

    // Fallback options khi cskhUsers rỗng
    assert.ok(
      content.includes('cskhUsers.length === 0') && content.includes('currentUser?.name || \'Tài khoản hiện tại\''),
      'cskhOptions phải cung cấp fallback option hiển thị tài khoản hiện tại khi cskhUsers rỗng'
    );
  });

  await t.test('Task 2.2: Dropdown CSKH hiển thị tại Bước 01 và có validation bắt buộc', () => {
    const content = fs.readFileSync(intakeWizardPath, 'utf-8');

    // Label của Select CSKH
    assert.ok(
      content.includes('label="Nhân viên tiếp nhận / tạo đơn (CSKH) *"'),
      'Bước 01 phải có Select với label "Nhân viên tiếp nhận / tạo đơn (CSKH) *"'
    );

    // Validation trong validateStep(0)
    assert.ok(
      content.includes('!selectedCskhId') && content.includes('errs.created_by_user_id'),
      'validateStep(0) phải kiểm tra !selectedCskhId và báo lỗi errs.created_by_user_id'
    );

    // Cleanup lỗi trong validateStep
    assert.ok(
      content.includes('delete updated.created_by_user_id;'),
      'validateStep phải xóa lỗi created_by_user_id khi hợp lệ'
    );
  });

  await t.test('Task 2.2: handleSave truyền created_by_user_id vào payload và lưu vào order metadata', () => {
    const content = fs.readFileSync(intakeWizardPath, 'utf-8');

    // Payload gửi lên API createIntake
    assert.ok(
      content.includes('created_by_user_id: selectedCskhId ? Number(selectedCskhId) : undefined'),
      'handleSave payload phải truyền created_by_user_id'
    );

    // Lưu creator name và quan hệ created_by_user vào newOrder
    assert.ok(
      content.includes('selectedCskhUser?.name'),
      'newOrder phải tra cứu tên nhân viên CSKH được chọn để gán createdBy'
    );
    assert.ok(
      content.includes('created_by_user: selectedCskhUser'),
      'newOrder phải gán object quan hệ created_by_user'
    );
  });
});
