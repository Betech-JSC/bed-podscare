import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

test('1. Tenant Branding UI & Page Standards Verification', () => {
  const brandingPagePath = path.resolve(__dirname, '../app/branding/page.tsx');
  assert.ok(fs.existsSync(brandingPagePath), 'apps/web/app/branding/page.tsx phải tồn tại');

  const content = fs.readFileSync(brandingPagePath, 'utf-8');

  // Kiểm tra Client Component và AppShell
  assert.ok(content.includes("'use client'"), 'Branding page phải là client component');
  assert.ok(content.includes('<AppShell'), 'Phải bọc trong AppShell');
  assert.ok(content.includes('crumbName="Thương hiệu & Mẫu in"'), 'crumbName phải là Thương hiệu & Mẫu in');

  // Kiểm tra Role Gate (Store Admin)
  assert.ok(content.includes("role === 'admin'") || content.includes("currentUser?.role === 'admin'"), 'Phải kiểm tra quyền Store Admin');
  assert.ok(content.includes('Chỉ Quản trị viên'), 'Phải có thông báo giới hạn quyền cho vai trò khác');

  // Kiểm tra Logo Upload & Dropzone
  assert.ok(content.includes('onDrop={handleDrop}'), 'Hỗ trợ kéo thả dropzone');
  assert.ok(content.includes('tenantService.uploadLogo'), 'Gọi API upload logo');
  assert.ok(content.includes('tenantService.deleteLogo'), 'Gọi API gỡ logo');
  assert.ok(content.includes('2 * 1024 * 1024'), 'Khóa dung lượng ảnh tối đa 2MB');

  // Kiểm tra Store Info Form
  assert.ok(content.includes('tenantService.updateSettings'), 'Gọi API updateSettings');
  assert.ok(content.includes('receipt_footer_note'), 'Hỗ trợ cập nhật receipt_footer_note');
  assert.ok(content.includes('255'), 'Kiểm tra giới hạn 255 ký tự');

  // Kiểm tra Live Dual Preview (K80 & A4)
  assert.ok(content.includes('<ThermalK80Receipt'), 'Tích hợp component ThermalK80Receipt');
  assert.ok(content.includes('<A4ReceiptTemplate'), 'Tích hợp component A4ReceiptTemplate');
  assert.ok(content.includes('previewFormat'), 'Hỗ trợ chuyển đổi giữa K80 và A4');
  assert.ok(content.includes('liveBranding'), 'Truyền liveBranding reactive vào preview');

  // Kiểm tra Test Print Button
  assert.ok(content.includes('useSilentPrint'), 'Sử dụng useSilentPrint');
  assert.ok(content.includes('printReceipt(SAMPLE_DEMO_ORDER'), 'Kích hoạt lệnh in thử');

  // Co-branding footer reminder
  assert.ok(content.includes('Powered by FIXO Repair OS'), 'Có lưu ý co-branding Powered by FIXO Repair OS');
});

test('2. AppSidebar & Navigation Integration Verification', () => {
  const sidebarPath = path.resolve(rootDir, 'packages/ui/src/organisms/AppSidebar.tsx');
  assert.ok(fs.existsSync(sidebarPath), 'AppSidebar.tsx phải tồn tại');

  const content = fs.readFileSync(sidebarPath, 'utf-8');

  // Kiểm tra quyền role admin
  assert.ok(content.includes("'branding'"), 'rolePermissions.admin phải chứa branding');

  // Kiểm tra menu systemNav
  assert.ok(content.includes("href: '/branding'"), 'systemNav phải có link href: /branding');
  assert.ok(content.includes('Thương hiệu & Mẫu in'), 'Menu label phải là Thương hiệu & Mẫu in');
});

test('3. PrintFormatModal Quick Link Verification', () => {
  const modalPath = path.resolve(__dirname, '../app/components/print/PrintFormatModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'PrintFormatModal.tsx phải tồn tại');

  const content = fs.readFileSync(modalPath, 'utf-8');

  // Kiểm tra quick link tới /branding
  assert.ok(content.includes('href="/branding"'), 'PrintFormatModal phải có link tới /branding');
  assert.ok(content.includes('Thiết lập Logo cửa hàng ↗'), 'Phải có text nút chuyển nhanh tới thiết lập');
});

test('4. @podscare/api-client TenantService Verification', () => {
  const servicePath = path.resolve(rootDir, 'packages/api-client/src/services/tenant.service.ts');
  assert.ok(fs.existsSync(servicePath), 'tenant.service.ts phải tồn tại');

  const content = fs.readFileSync(servicePath, 'utf-8');

  assert.ok(content.includes('class TenantService'), 'Phải định nghĩa TenantService');
  assert.ok(content.includes('/api/v1/tenant/settings'), 'Gọi đúng endpoint /api/v1/tenant/settings');
  assert.ok(content.includes('/api/v1/tenant/logo'), 'Gọi đúng endpoint /api/v1/tenant/logo');
  assert.ok(content.includes('uploadLogo(file: File)'), 'Hỗ trợ uploadLogo');
  assert.ok(content.includes('deleteLogo()'), 'Hỗ trợ deleteLogo');

  // Kiểm tra index.ts export
  const indexPath = path.resolve(rootDir, 'packages/api-client/src/index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(indexContent.includes("export * from './services/tenant.service'"), 'index.ts phải export tenant.service');
});

test('5. @podscare/types TenantInfo Verification', () => {
  const typesPath = path.resolve(rootDir, 'packages/types/src/role.ts');
  assert.ok(fs.existsSync(typesPath), 'role.ts phải tồn tại');

  const content = fs.readFileSync(typesPath, 'utf-8');

  assert.ok(content.includes('logo_url?: string | null;'), 'TenantInfo phải có logo_url');
  assert.ok(content.includes('hotline?: string | null;'), 'TenantInfo phải có hotline');
  assert.ok(content.includes('receipt_footer_note?: string | null;'), 'TenantInfo phải có receipt_footer_note');
});
