import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

test('1. Devices & Checklist Page REST API Wiring Verification', () => {
  const devicesPagePath = path.resolve(__dirname, '../app/devices/page.tsx');
  assert.ok(fs.existsSync(devicesPagePath), 'apps/web/app/devices/page.tsx phải tồn tại');

  const content = fs.readFileSync(devicesPagePath, 'utf-8');

  // Kiểm tra Client Component và AppShell
  assert.ok(content.includes("'use client'"), 'Devices page phải là client component');
  assert.ok(content.includes('<AppShell'), 'Phải bọc trong AppShell');
  assert.ok(content.includes('crumbName="Thiết bị & Checklist"'), 'crumbName phải là Thiết bị & Checklist');

  // Kiểm tra API Service Integration
  assert.ok(content.includes("from '@podscare/api-client'"), 'Phải import từ @podscare/api-client');
  assert.ok(content.includes('deviceService.getDevices()'), 'Gọi API lấy danh sách thiết bị');
  assert.ok(content.includes('deviceService.getCategories()'), 'Gọi API lấy danh sách danh mục');
  assert.ok(content.includes('deviceService.createDevice('), 'Gọi API tạo mới thiết bị');
  assert.ok(content.includes('deviceService.updateDevice('), 'Gọi API cập nhật thiết bị');
  assert.ok(content.includes('deviceService.deleteDevice('), 'Gọi API xóa thiết bị');
  assert.ok(content.includes('deviceService.createCategory('), 'Gọi API tạo mới danh mục');

  // Kiểm tra ConfirmModal & Skeleton Loader
  assert.ok(content.includes('<ConfirmModal'), 'Tích hợp ConfirmModal xác nhận xóa');
  assert.ok(content.includes('animate-pulse'), 'Có loading skeleton khi tải dữ liệu');
  assert.ok(content.includes('variant="danger"'), 'ConfirmModal dùng variant danger');
});

test('2. DeviceService SDK Client Methods Verification', () => {
  const servicePath = path.resolve(rootDir, 'packages/api-client/src/services/device.service.ts');
  assert.ok(fs.existsSync(servicePath), 'device.service.ts phải tồn tại');

  const content = fs.readFileSync(servicePath, 'utf-8');

  assert.ok(content.includes('getDevices('), 'Có method getDevices');
  assert.ok(content.includes('createDevice('), 'Có method createDevice');
  assert.ok(content.includes('updateDevice('), 'Có method updateDevice');
  assert.ok(content.includes('deleteDevice('), 'Có method deleteDevice');
  assert.ok(content.includes('getCategories('), 'Có method getCategories');
  assert.ok(content.includes('createCategory('), 'Có method createCategory');
});

test('3. Providers Sync & Dynamic Checklist Templates Verification', () => {
  const providersPath = path.resolve(__dirname, '../app/providers.tsx');
  assert.ok(fs.existsSync(providersPath), 'providers.tsx phải tồn tại');

  const content = fs.readFileSync(providersPath, 'utf-8');

  // Kiểm tra đồng bộ checklist của từng model
  assert.ok(content.includes('d.checklist_templates'), 'providers phải nạp checklist_templates riêng của từng model');
  assert.ok(content.includes('deviceService.getCategories()'), 'providers phải nạp dynamic categories từ backend');
  assert.ok(content.includes('podscare_categories'), 'providers phải lưu và nạp cached categories từ localStorage');
});

test('4. Icons Suite Enhancement Verification', () => {
  const iconsPath = path.resolve(rootDir, 'packages/ui/src/atoms/Icons.tsx');
  const content = fs.readFileSync(iconsPath, 'utf-8');

  assert.ok(content.includes('trash:'), 'Icons.tsx phải hỗ trợ icon trash');
  assert.ok(content.includes('edit:'), 'Icons.tsx phải hỗ trợ icon edit');
});
