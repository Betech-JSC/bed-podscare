'use client';

import React, { useEffect } from 'react';
import {
  Input,
  Select,
  Textarea,
  CurrencyInput,
  DynamicTestRow,
  HardwarePartSelector,
  parseHardwarePartsFromText,
  formatHardwarePartsToText,
  Icon,
  formatVND,
  sanitizeInputLive,
} from '@podscare/ui';
import type { ChecklistStatus } from '@podscare/types';
import type { CommonIssueItem } from '@podscare/api-client';
import type { IntakeDeviceItem } from './IntakeWizardModal';

export interface IntakeQuickConsoleProps {
  name: string;
  onNameChange: (val: string) => void;
  phone: string;
  onPhoneChange: (val: string) => void;
  orderType: 'in_store' | 'cod' | 'warranty';
  onOrderTypeChange: (type: 'in_store' | 'cod' | 'warranty') => void;
  shippingAddress: string;
  onShippingAddressChange: (val: string) => void;
  cskhOptions: { value: string; label: string }[];
  selectedCskhId: string;
  onCskhChange: (val: string) => void;
  categories: string[];
  availableModels: { name: string; model?: string }[];
  device: IntakeDeviceItem;
  onUpdateDevice: (updater: Partial<IntakeDeviceItem> | ((prev: IntakeDeviceItem) => IntakeDeviceItem)) => void;
  onCategoryChange: (cat: string) => void;
  commonIssues: CommonIssueItem[];
  onChipClick: (chip: CommonIssueItem) => void;
  effectiveChecks: string[];
  warrantyMonths: 3 | 6 | 9 | 12;
  onWarrantyMonthsChange: (m: 3 | 6 | 9 | 12) => void;
  errors: Record<string, string>;
  onSubmitAndPrint: () => void;
}

export const IntakeQuickConsole: React.FC<IntakeQuickConsoleProps> = ({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  orderType,
  onOrderTypeChange,
  shippingAddress,
  onShippingAddressChange,
  cskhOptions,
  selectedCskhId,
  onCskhChange,
  categories,
  availableModels,
  device,
  onUpdateDevice,
  onCategoryChange,
  commonIssues,
  onChipClick,
  effectiveChecks,
  warrantyMonths,
  onWarrantyMonthsChange,
  errors,
  onSubmitAndPrint,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmitAndPrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSubmitAndPrint]);

  const selectedParts = parseHardwarePartsFromText(device.accessories);

  return (
    <div
      data-testid="intake-quick-console"
      className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
    >
      {/* Left Column: Customer + Device + Hardware Part Selector (7 cols) */}
      <div className="lg:col-span-7 space-y-4">
        <section className="bg-white p-4 rounded-[10px] border border-[#e9eeeb] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#e9eeeb]">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[#17231f] flex items-center gap-1.5 m-0">
              <Icon name="user" size={14} className="text-[#176b51]" />
              <span>1. Khách hàng & Hình thức tiếp nhận</span>
            </h3>
            <div className="flex items-center gap-1.5">
              {(['in_store', 'cod', 'warranty'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onOrderTypeChange(t)}
                  className={`px-2.5 py-1 rounded-[6px] text-[11px] font-bold transition-colors cursor-pointer ${
                    orderType === t
                      ? 'bg-[#176b51] text-white'
                      : 'bg-[#f6f8f6] text-[#5c6964] hover:bg-[#e9f4ef] border border-[#e9eeeb]'
                  }`}
                >
                  {t === 'in_store' ? 'Tại quầy' : t === 'cod' ? 'Đơn COD' : 'Bảo hành'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Họ tên khách *"
              value={name}
              onChange={(e) => onNameChange(sanitizeInputLive(e.target.value))}
              placeholder="Nguyễn Minh Anh"
              error={errors.name}
            />
            <Input
              label="Số điện thoại *"
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(sanitizeInputLive(e.target.value))}
              placeholder="0903 482 716"
              error={errors.phone}
            />
            <Select
              label="CSKH tiếp nhận *"
              value={selectedCskhId}
              onChange={(e) => onCskhChange(e.target.value)}
              options={cskhOptions}
              error={errors.created_by_user_id}
            />
          </div>

          {(orderType === 'cod' || orderType === 'warranty') && (
            <Input
              label="Địa chỉ gửi trả máy (COD / Bưu cục)"
              value={shippingAddress}
              onChange={(e) => onShippingAddressChange(e.target.value)}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
            />
          )}
        </section>

        <section className="bg-white p-4 rounded-[10px] border border-[#e9eeeb] space-y-3">
          <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[#17231f] flex items-center gap-1.5 pb-2 border-b border-[#e9eeeb] m-0">
            <Icon name="headphones" size={14} className="text-[#176b51]" />
            <span>2. Thiết bị & Thành phần bàn giao (L / R / Case)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Danh mục *"
              value={device.category}
              onChange={(e) => onCategoryChange(e.target.value)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
            <Select
              label="Dòng máy *"
              value={device.device}
              onChange={(e) => onUpdateDevice({ device: e.target.value })}
              options={availableModels.map((m) => ({
                value: m.name,
                label: `${m.name}${m.model ? ` · ${m.model}` : ''}`,
              }))}
            />
            <Input
              label="Serial Number"
              value={device.serial}
              onChange={(e) => onUpdateDevice({ serial: e.target.value })}
              placeholder="SN trên thân/hộp"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#17231f] mb-1.5">
              Chọn nhanh linh kiện bàn giao (L / R / Case):
            </label>
            <HardwarePartSelector
              selectedParts={selectedParts}
              onChange={(parts) => {
                onUpdateDevice({ accessories: formatHardwarePartsToText(parts) });
              }}
            />
          </div>

          <div>
            <Textarea
              label="Mô tả lỗi khách báo *"
              value={device.issue}
              onChange={(e) => onUpdateDevice({ issue: e.target.value })}
              placeholder="Ví dụ: Tai trái mất nguồn, bật ANC rè..."
              error={errors.issue || errors[`issue_${device.id}`]}
            />
            {commonIssues.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {commonIssues.map((chip, idx) => {
                  const active = device.issue.includes(chip.issue_name);
                  return (
                    <button
                      key={chip.id || idx}
                      type="button"
                      onClick={() => onChipClick(chip)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#e9f4ef] border-[#176b51] text-[#176b51] font-bold'
                          : 'bg-[#f6f8f6] border-[#e9eeeb] text-[#5c6964] hover:border-[#176b51]'
                      }`}
                    >
                      + {chip.issue_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Right Column: Checklist Test + Pricing & Warranty (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        <section className="bg-white p-4 rounded-[10px] border border-[#e9eeeb] space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-[#e9eeeb]">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[#17231f] flex items-center gap-1.5 m-0">
              <Icon name="check" size={14} className="text-[#176b51]" />
              <span>3. Checklist Test Quầy (Phím 1 / 2 / 3)</span>
            </h3>
            <span className="text-[11px] font-mono text-[#176b51] bg-[#e9f4ef] px-2 py-0.5 rounded font-bold">
              {effectiveChecks.length} mục
            </span>
          </div>

          <div className="border border-[#e9eeeb] rounded-[8px] overflow-hidden max-h-[250px] overflow-y-auto">
            {effectiveChecks.map((item, idx) => (
              <DynamicTestRow
                key={`quick-${device.id}-${item}`}
                name={`quick-test-${device.id}-${idx}`}
                label={item}
                value={(device.testAnswers[item] as ChecklistStatus) || 'Không kiểm tra'}
                onChange={(status) => {
                  onUpdateDevice((prev) => ({
                    ...prev,
                    testAnswers: { ...prev.testAnswers, [item]: status },
                  }));
                }}
              />
            ))}
          </div>
        </section>

        <section className="bg-white p-4 rounded-[10px] border border-[#e9eeeb] space-y-3">
          <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[#17231f] flex items-center gap-1.5 pb-2 border-b border-[#e9eeeb] m-0">
            <Icon name="tag" size={14} className="text-[#176b51]" />
            <span>4. Báo giá dự kiến & Bảo hành</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CurrencyInput
              label="Chi phí dự kiến (VNĐ)"
              value={device.price}
              onChangeValue={(val, formatted) => {
                onUpdateDevice({ price: formatted ? val : '' });
              }}
              placeholder="0 (nếu chờ kiểm tra)"
            />
            <Input
              label="Ghi chú ngoại hình / báo giá"
              value={device.appearance}
              onChange={(e) => onUpdateDevice({ appearance: e.target.value })}
              placeholder="Trầy nhẹ vỏ sạc..."
            />
          </div>

          <div>
            <span className="block text-[11px] font-bold text-[#81908a] uppercase mb-1.5">
              Thời hạn bảo hành cam kết:
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {([3, 6, 9, 12] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onWarrantyMonthsChange(m)}
                  className={`py-1.5 px-2 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                    warrantyMonths === m
                      ? 'bg-[#176b51] text-white border-[#176b51]'
                      : 'bg-[#f6f8f6] text-[#17231f] border-[#e9eeeb] hover:bg-[#e9f4ef]'
                  }`}
                >
                  {m} tháng
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-[8px] bg-[#e9f4ef] border border-[#cce3d8] flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[#176b51] block">Tổng tạm tính</span>
              <span className="text-[11px] text-[#5c6964]">Phím tắt: Ctrl/Cmd + Enter để Lưu & In</span>
            </div>
            <strong className="font-mono text-base font-bold text-[#176b51] tabular-nums">
              {formatVND(typeof device.price === 'number' ? device.price : 0)}
            </strong>
          </div>
        </section>
      </div>
    </div>
  );
};
