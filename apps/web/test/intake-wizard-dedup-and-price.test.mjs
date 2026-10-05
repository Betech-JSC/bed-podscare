import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const intakeWizardPath = path.resolve(__dirname, '../app/components/IntakeWizardModal.tsx');

test('1. IntakeWizardModal: Common Issue Chips MUST NOT display price tags', () => {
  assert.ok(fs.existsSync(intakeWizardPath), 'IntakeWizardModal.tsx phải tồn tại');
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  // Verify that the common issue chips section does NOT contain any price formatting or currency symbols
  const chipSectionRegex = /\{commonIssues\.map\(\(chip, idx\) => \{([\s\S]*?)\}\)\}/;
  const match = content.match(chipSectionRegex);
  assert.ok(match, 'Phải tìm thấy khối render commonIssues.map');

  const chipRenderBody = match[1];
  assert.strictEqual(
    chipRenderBody.includes('₫'),
    false,
    'Chip Lỗi thường gặp tuyệt đối không được chứa ký tự đơn vị tiền tệ "₫"'
  );
  assert.strictEqual(
    chipRenderBody.includes('estimated_cost'),
    false,
    'Chip Lỗi thường gặp không được render estimated_cost'
  );
  assert.ok(
    chipRenderBody.includes('<span>{chip.issue_name}</span>'),
    'Chip phải hiển thị tên lỗi chip.issue_name'
  );
});

test('2. IntakeWizardModal: handleChipClick MUST NOT auto-populate price', () => {
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  const handleChipClickRegex = /const handleChipClick = \(chip: CommonIssueItem\) => \{([\s\S]*?)\};/;
  const match = content.match(handleChipClickRegex);
  assert.ok(match, 'Phải tìm thấy hàm handleChipClick');

  const functionBody = match[1];
  assert.strictEqual(
    functionBody.includes('setPrice'),
    false,
    'handleChipClick không được gọi setPrice khi nhân viên chọn chip lỗi'
  );
  assert.ok(
    functionBody.includes('setIssue'),
    'handleChipClick vẫn phải bổ sung tên lỗi vào trường issue'
  );
});

test('3. IntakeWizardModal: Checklist Deduplication and Model Binding', () => {
  const content = fs.readFileSync(intakeWizardPath, 'utf-8');

  // Kiểm tra gọi getChecklistTemplate có truyền device_model_id
  assert.ok(
    content.includes('device_model_id: modelId'),
    'deviceService.getChecklistTemplate phải truyền device_model_id khi có model đang chọn'
  );

  // Kiểm tra Set deduplication trong việc set checklistTemplate
  assert.ok(
    content.includes('Array.from(') && content.includes('new Set('),
    'Phải dùng Set deduplication để loại bỏ tiêu chí trùng lặp'
  );

  // Giả lập 77 checklist items lặp lại từ 11 models Apple Watch
  const mockDuplicatedRaw = [
    { item_name: 'Màn hình / hiển thị' },
    { item_name: 'Cảm ứng & Nút xoay Digital Crown' },
    { item_name: 'Nút sườn Side Button' },
    { item_name: 'Cảm biến nhịp tim & mặt lưng gốm' },
    { item_name: 'Loa & Còi báo động' },
    { item_name: 'Microphone đàm thoại' },
    { item_name: 'Pin & Sạc nam châm không dây' },
    // Model 2 duplicate
    { item_name: 'Màn hình / hiển thị' },
    { item_name: 'Cảm ứng & Nút xoay Digital Crown' },
    { item_name: 'Nút sườn Side Button' },
    { item_name: 'Cảm biến nhịp tim & mặt lưng gốm' },
    { item_name: 'Loa & Còi báo động' },
    { item_name: 'Microphone đàm thoại' },
    { item_name: 'Pin & Sạc nam châm không dây' },
  ];

  const deduplicated = Array.from(
    new Set(
      mockDuplicatedRaw
        .map((item) => (item.item_name || item.name || String(item)).trim())
        .filter(Boolean)
    )
  );

  assert.strictEqual(deduplicated.length, 7, 'Mảng 14 items trùng lặp phải được khử sạch về đúng 7 items duy nhất');
  assert.deepStrictEqual(deduplicated, [
    'Màn hình / hiển thị',
    'Cảm ứng & Nút xoay Digital Crown',
    'Nút sườn Side Button',
    'Cảm biến nhịp tim & mặt lưng gốm',
    'Loa & Còi báo động',
    'Microphone đàm thoại',
    'Pin & Sạc nam châm không dây',
  ]);
});
