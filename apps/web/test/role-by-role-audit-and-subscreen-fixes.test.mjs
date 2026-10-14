import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCombinedCustomerCopyHtml } from '../app/components/print/thermalK80HtmlBuilder.ts';
import { getQuickActionsForStatus } from '../app/repairs/fsm.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

test('OpenSpec: role-by-role-audit-and-subscreen-fixes Test Suite', async (t) => {
  await t.test('Task 1.1: CheckoutHandoverModal & Dashboard CSKH - VietQR, refreshShift() & nút Thu tiền & Trả máy trực tiếp', () => {
    const checkoutPath = path.join(webRoot, 'app/components/CheckoutHandoverModal.tsx');
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const checkoutContent = fs.readFileSync(checkoutPath, 'utf-8');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

    // CheckoutHandoverModal imports useShift and calls refreshShift() + renders checkout-vietqr-box
    assert.ok(checkoutContent.includes('useShift'), 'CheckoutHandoverModal phải import useShift');
    assert.ok(checkoutContent.includes('refreshShift'), 'CheckoutHandoverModal phải gọi refreshShift() sau khi thu tiền');
    assert.ok(
      checkoutContent.includes('data-testid="checkout-vietqr-box"'),
      'CheckoutHandoverModal phải hiển thị khối VietQR có data-testid="checkout-vietqr-box" khi chọn bank_transfer'
    );
    assert.ok(
      checkoutContent.includes('PODSCARE ${order.id}'),
      'CheckoutHandoverModal phải hiển thị nội dung chuyển khoản PODSCARE ${order.id}'
    );

    // Dashboard CSKH has cskh-ready-orders-panel and direct cskh-btn-checkout-${o.id} buttons
    assert.ok(
      dashboardContent.includes('data-testid="cskh-ready-orders-panel"'),
      'Dashboard CSKH phải có khối Máy sẵn sàng trả (data-testid="cskh-ready-orders-panel")'
    );
    assert.ok(
      dashboardContent.includes('data-testid={`cskh-btn-checkout-${o.id}`}'),
      'Dashboard CSKH phải có nút Thu tiền & Trả máy trực tiếp (data-testid="cskh-btn-checkout-${o.id}")'
    );
    assert.ok(
      dashboardContent.includes('refreshShift'),
      'Dashboard CSKH phải gọi refreshShift() sau khi hoàn tất thu tiền trả máy'
    );
  });

  await t.test('Task 1.2: Dọn dẹp triệt để tàn dư Chờ khách duyệt / báo giá trên Dashboard, FSM, Repairs và IntakeWizardModal', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const repairsPath = path.join(webRoot, 'app/repairs/page.tsx');
    const intakePath = path.join(webRoot, 'app/components/IntakeWizardModal.tsx');

    const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    const repairsContent = fs.readFileSync(repairsPath, 'utf-8');
    const intakeContent = fs.readFileSync(intakePath, 'utf-8');

    assert.ok(
      !dashboardContent.includes('Nhắc khách xác nhận báo giá'),
      'Dashboard CSKH không được còn câu Nhắc khách xác nhận báo giá'
    );
    assert.ok(
      !dashboardContent.includes('Chờ duyệt báo giá'),
      'Dashboard không được còn KPI Chờ duyệt báo giá'
    );

    // FSM inspecting quick actions no longer include Chờ khách duyệt
    const inspectingActions = getQuickActionsForStatus('inspecting').map((a) => a.label);
    assert.ok(
      !inspectingActions.includes('Chờ khách duyệt'),
      'FSM inspecting không được còn nút nhanh Chờ khách duyệt'
    );

    // repairs/page.tsx statusOptions no longer includes Chờ khách duyệt
    assert.ok(
      !repairsContent.includes("{ value: 'Chờ khách duyệt', label: 'Chờ khách duyệt' }"),
      'Bộ lọc trạng thái tại /repairs không được còn tùy chọn Chờ khách duyệt'
    );

    // IntakeWizardModal uses Ghi chú tiếp nhận and fallback Chờ kỹ thuật
    assert.ok(
      intakeContent.includes('Ghi chú tiếp nhận'),
      'IntakeWizardModal phải đổi nhãn thành Ghi chú tiếp nhận'
    );
    assert.ok(
      !intakeContent.includes('Ghi chú báo giá'),
      'IntakeWizardModal không được còn nhãn Ghi chú báo giá'
    );
  });

  await t.test('Task 1.3: Chọn nhanh thời hạn bảo hành (3 / 6 / 9 / 12 tháng) tại bước 5 Tiếp nhận & hiển thị trên phiếu in K80', () => {
    const intakePath = path.join(webRoot, 'app/components/IntakeWizardModal.tsx');
    const intakeContent = fs.readFileSync(intakePath, 'utf-8');

    assert.ok(
      intakeContent.includes('data-testid="intake-warranty-months-selector"'),
      'IntakeWizardModal phải có bộ nút chọn nhanh thời hạn bảo hành (data-testid="intake-warranty-months-selector")'
    );
    assert.ok(
      intakeContent.includes('data-testid={`intake-warranty-btn-${m}`}'),
      'IntakeWizardModal phải có các nút pill 3 / 6 / 9 / 12 tháng'
    );
    assert.ok(
      intakeContent.includes('warranty_months: warrantyMonths') &&
        intakeContent.includes('warranty_terms_days: warrantyMonths * 30'),
      'IntakeWizardModal phải gửi warranty_months và warranty_terms_days trong payload'
    );

    // Verify K80 thermal builder outputs prominent warranty block with months & expiry date
    const html = buildCombinedCustomerCopyHtml([
      {
        id: 'TK14102601',
        name: 'Nguyễn Văn A',
        phone: '0909123456',
        device: 'AirPods Pro 2',
        serial: 'SN12345',
        issue: 'Thay pin 2 tai',
        status: 'Chờ kỹ thuật',
        statusType: 'new',
        price: 500000,
        tech: 'KTV',
        date: '14/10/2026',
        warranty_months: 6,
        warranty_terms_days: 180,
      },
    ]);

    assert.ok(
      html.includes('ĐIỀU KHOẢN VÀ CHÍNH SÁCH BẢO HÀNH TIÊU CHUẨN'),
      'Phiếu in K80 phải có tiêu đề ĐIỀU KHOẢN VÀ CHÍNH SÁCH BẢO HÀNH TIÊU CHUẨN'
    );
    assert.ok(
      html.includes('Thời hạn bảo hành: 6 tháng (Đến ngày '),
      'Phiếu in K80 phải in rõ Thời hạn bảo hành: 6 tháng kèm ngày hết hạn'
    );
  });

  await t.test('Task 1.4: Làm sạch trang Ca làm việc (/shifts) cho CSKH và bổ sung cột Thu tiền mặt & Doanh thu CK (VietQR)', () => {
    const shiftsPath = path.join(webRoot, 'app/shifts/page.tsx');
    const shiftsContent = fs.readFileSync(shiftsPath, 'utf-8');

    assert.ok(
      shiftsContent.includes("currentUser?.role !== 'cskh'"),
      'Trang /shifts phải ẩn link Sang Quản lý Thanh toán đơn hàng đối với vai trò cskh'
    );
    assert.ok(
      shiftsContent.includes('Thu tiền mặt') && shiftsContent.includes('Doanh thu CK (VietQR)'),
      'Bảng Lịch sử ca làm việc phải có đủ 2 cột Thu tiền mặt và Doanh thu CK (VietQR)'
    );
  });

  await t.test('Task 2.1: Dọn dẹp tàn dư Kho (/inventory) trên ActionableTasksCenter và TechOrderDetailModal', () => {
    const actionablePath = path.join(webRoot, 'app/dashboard/components/ActionableTasksCenter.tsx');
    const techModalPath = path.join(webRoot, 'app/components/TechOrderDetailModal.tsx');

    const actionableContent = fs.readFileSync(actionablePath, 'utf-8');
    const techModalContent = fs.readFileSync(techModalPath, 'utf-8');

    assert.ok(
      !actionableContent.includes('/inventory') && !actionableContent.includes('Linh kiện sắp hết'),
      'ActionableTasksCenter không được còn tab Linh kiện sắp hết hoặc link tới /inventory'
    );
    assert.ok(
      !actionableContent.includes('Chờ duyệt giá'),
      'ActionableTasksCenter không được còn tab Chờ duyệt giá'
    );
    assert.ok(
      !techModalContent.includes('inventoryService.getParts'),
      'TechOrderDetailModal không được gọi API inventoryService.getParts của module Kho đã ẩn'
    );
  });

  await t.test('Task 2.2: Đồng bộ mở Drawer chi tiết đơn tại bảng Đơn sửa chữa gần đây trên Dashboard', () => {
    const dashboardPath = path.join(webRoot, 'app/dashboard/page.tsx');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

    assert.ok(
      dashboardContent.includes('onClick={() => handleOpenOrderDetail(o.id)}'),
      'Bảng Đơn sửa chữa gần đây trên Dashboard phải gọi handleOpenOrderDetail(o.id) để mở Drawer chi tiết ngay tại chỗ'
    );
    assert.ok(
      dashboardContent.includes('warranty_terms_days') && dashboardContent.includes('special_parts_needed'),
      'handleOpenOrderDetail phải map đầy đủ thông tin kỹ thuật, linh kiện đặc biệt và bảo hành'
    );
  });

  await t.test('Task 2.3: Sửa 2 nút bị lỗi trong Drawer Hồ sơ bệnh án tại trang Bảo hành (/warranty) & hỗ trợ ?intake=warranty tại /repairs', () => {
    const warrantyPath = path.join(webRoot, 'app/warranty/page.tsx');
    const repairsPath = path.join(webRoot, 'app/repairs/page.tsx');

    const warrantyContent = fs.readFileSync(warrantyPath, 'utf-8');
    const repairsContent = fs.readFileSync(repairsPath, 'utf-8');

    assert.ok(
      warrantyContent.includes('router.push(`/print/${encodeURIComponent(selectedWarranty.orderCode)}`)'),
      'Nút In lại phiếu bảo hành phải điều hướng tới /print/[orderCode]'
    );
    assert.ok(
      warrantyContent.includes("router.push('/repairs?intake=warranty')"),
      'Nút Tạo đơn bảo hành / Sửa lại phải điều hướng tới /repairs?intake=warranty'
    );
    assert.ok(
      repairsContent.includes("searchParams.get('intake')") &&
        repairsContent.includes("setInitialIntakeType('warranty')"),
      'Trang /repairs phải tự động mở IntakeWizardModal ở chế độ warranty khi có ?intake=warranty'
    );
  });

  await t.test('Task 3.1 & 3.2: Bảo toàn special_parts_status trong providers.tsx & Cảnh báo đỏ nổi bật tại /tech và /repairs', () => {
    const providersPath = path.join(webRoot, 'app/providers.tsx');
    const techPath = path.join(webRoot, 'app/tech/page.tsx');
    const repairsPath = path.join(webRoot, 'app/repairs/page.tsx');

    const providersContent = fs.readFileSync(providersPath, 'utf-8');
    const techContent = fs.readFileSync(techPath, 'utf-8');
    const repairsContent = fs.readFileSync(repairsPath, 'utf-8');

    assert.ok(
      providersContent.includes('special_parts_needed: o.special_parts_needed') &&
        providersContent.includes('special_parts_status: o.special_parts_status'),
      'fetchOrders trong providers.tsx phải giữ nguyên special_parts_needed và special_parts_status'
    );

    assert.ok(
      techContent.includes('data-testid="tech-special-parts-red-alert-banner"'),
      'Trang /tech phải có Top Red Alert Banner (data-testid="tech-special-parts-red-alert-banner") khi có linh kiện đặc biệt chờ mua'
    );
    assert.ok(
      techContent.includes("'Đã sửa xong (3 ngày)'") && techContent.includes("'Đã sửa xong (7 ngày)'"),
      'Trang /tech phải cập nhật nhãn động Đã sửa xong theo bộ lọc ngày (today / 3_days / 7_days)'
    );
    assert.ok(
      repairsContent.includes("bg-red-50 text-red-700 border border-red-300 font-bold"),
      'Nút tab Cần mua linh kiện ngoài tại /repairs phải có style cảnh báo đỏ nổi bật'
    );
  });
});
