'use client';

import React, { useEffect, useState } from 'react';
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
import {
  type IntakeDeviceItem,
  CATEGORY_HANDOVER_PARTS,
  parseCategoryHandoverPartsFromText,
  toggleCategoryHandoverPartInText,
  resolveCanonicalModelName,
} from './IntakeWizardModal';
import {
  POPULAR_APPLE_WATCH_SIZES,
  filterCommonIssues,
  enrichCommonIssueWithParts,
  mergeLinkedPartsFromIssues,
  formatLinkedPartsSummary,
  applyWatchSizeTagToText,
  inferLinkedPartsFromOrderText,
  type CommonIssueCatalogItem,
} from '../constants/commonIssueCatalog';

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
  const handoverPartDefs =
    CATEGORY_HANDOVER_PARTS[device.category] || CATEGORY_HANDOVER_PARTS.DEFAULT;
  const selectedCategoryParts = parseCategoryHandoverPartsFromText(
    device.accessories,
    device.category
  );
  const canonicalSelectedModel = resolveCanonicalModelName(device.device, availableModels);
  const selectModelOptions = (() => {
    const opts = availableModels.map((m) => ({
      value: m.name,
      label: `${m.name}${m.model ? ` · ${m.model}` : ''}`,
    }));
    if (canonicalSelectedModel && !opts.some((o) => o.value === canonicalSelectedModel)) {
      opts.unshift({
        value: canonicalSelectedModel,
        label: canonicalSelectedModel,
      });
    }
    return opts;
  })();
  const [quickIssueFilter, setQuickIssueFilter] = useState('');

  const filteredIssues = filterCommonIssues(
    commonIssues,
    quickIssueFilter,
    device.category,
    device.watchSize,
    device.device
  );

  const activeIssueObjects: CommonIssueCatalogItem[] = filteredIssues.filter((item) =>
    device.issue.toLowerCase().includes(item.issue_name.toLowerCase())
  );
  const inferredFromFreeText = device.issue.trim()
    ? inferLinkedPartsFromOrderText(
        device.issue,
        device.category,
        device.watchSize,
        device.device
      ).matchedIssues
    : [];
  const previewIssueObjects: CommonIssueCatalogItem[] =
    activeIssueObjects.length > 0
      ? activeIssueObjects
      : inferredFromFreeText.length > 0
      ? inferredFromFreeText
      : filteredIssues.length > 0
      ? [filteredIssues[0]]
      : [];

  const handleSelectWatchSize = (size: string) => {
    const nextAccessories = applyWatchSizeTagToText(device.accessories, size);
    const enrichedSelected = (device.selectedIssues && device.selectedIssues.length > 0
      ? device.selectedIssues
      : activeIssueObjects
    ).map((iss) => enrichCommonIssueWithParts(iss, 'Apple Watch', size, device.device));
    const mergedParts = mergeLinkedPartsFromIssues(
      enrichedSelected,
      'Apple Watch',
      size,
      device.device
    );
    const nextPartsNeeded = formatLinkedPartsSummary(mergedParts, size);
    onUpdateDevice({
      watchSize: size,
      accessories: nextAccessories,
      selectedIssues: enrichedSelected,
      partsNeeded: nextPartsNeeded || device.partsNeeded,
    });
  };

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
            <Icon
              name={
                device.category === 'Apple Watch'
                  ? 'watch'
                  : device.category === 'Apple Pencil'
                  ? 'edit'
                  : 'headphones'
              }
              size={14}
              className="text-[#176b51]"
            />
            <span>
              2. Thiết bị & Thành phần bàn giao (
              {device.category === 'AirPods' ? 'L / R / Case' : device.category})
            </span>
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
              value={canonicalSelectedModel}
              onChange={(e) => onUpdateDevice({ device: e.target.value })}
              options={selectModelOptions}
            />
            <Input
              label="Serial Number"
              value={device.serial}
              onChange={(e) => onUpdateDevice({ serial: e.target.value })}
              placeholder="SN trên thân/hộp"
            />
          </div>

          {device.category === 'Apple Watch' && (
            <div
              data-testid="quick-apple-watch-size-selector"
              className="p-3 rounded-[8px] bg-[#f4faf7] border border-[#cde4d8] space-y-2"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#176b51]">
                  Chọn nhanh Size Apple Watch phổ biến *
                </label>
                {device.watchSize && (
                  <span className="text-[11px] font-mono font-bold text-[#176b51] bg-white px-2 py-0.5 rounded border border-[#b8d9cb]">
                    Đang chọn: {device.watchSize}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_APPLE_WATCH_SIZES.map((size) => {
                  const isActive = device.watchSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      data-testid={`quick-watch-size-chip-${size.replace(/[^a-zA-Z0-9]/g, '')}`}
                      onClick={() => handleSelectWatchSize(size)}
                      className={`px-2.5 py-1 rounded-[6px] text-xs font-bold border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#176b51] text-white border-[#176b51] shadow-2xs'
                          : 'bg-white text-[#17231f] border-[#d6e4dc] hover:bg-[#e9f4ef] hover:border-[#176b51]'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {device.category === 'AirPods' ? (
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
          ) : (
            <div data-testid="quick-category-handover-parts-selector">
              <label className="block text-xs font-bold text-[#17231f] mb-1.5">
                Chọn nhanh thành phần bàn giao ({device.category}):
              </label>
              <div
                className={`grid grid-cols-2 ${
                  handoverPartDefs.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                } gap-2`}
              >
                {handoverPartDefs.map((part, pIdx) => {
                  const isPartSelected = selectedCategoryParts.includes(part.label);
                  return (
                    <button
                      key={part.label}
                      type="button"
                      data-testid={`quick-handover-part-btn-${pIdx}`}
                      aria-pressed={isPartSelected}
                      onClick={() => {
                        const nextAcc = toggleCategoryHandoverPartInText(
                          device.accessories,
                          part.label,
                          device.category,
                          device.watchSize
                        );
                        onUpdateDevice({ accessories: nextAcc });
                      }}
                      className={`flex items-center justify-between gap-2 rounded-[8px] border px-2.5 py-2 transition-colors text-left cursor-pointer ${
                        isPartSelected
                          ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                          : 'bg-white border-[#e9eeeb] text-[#81908a] hover:border-[#176b51]/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-[6px] grid place-items-center flex-none border ${
                            isPartSelected
                              ? 'bg-[#176b51] text-white border-[#176b51]'
                              : 'bg-[#f6f8f6] text-[#81908a] border-[#e9eeeb]'
                          }`}
                        >
                          <Icon name={part.icon} size={13} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-tight truncate">
                            {part.label}
                          </div>
                          <div className="text-[10px] font-medium text-[#81908a] leading-tight mt-0.5">
                            {isPartSelected ? 'Có nhận' : 'Không kèm'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full flex-none ${
                          isPartSelected ? 'bg-[#176b51]' : 'bg-[#d6e0db]'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <Textarea
              label="Mô tả lỗi khách báo *"
              value={device.issue}
              onChange={(e) => {
                const val = e.target.value;
                const inferred = inferLinkedPartsFromOrderText(
                  val,
                  device.category,
                  device.watchSize,
                  device.device
                );
                const nextPartsSummary = formatLinkedPartsSummary(
                  inferred.linkedParts,
                  device.watchSize
                );
                onUpdateDevice({
                  issue: val,
                  selectedIssues: inferred.matchedIssues,
                  partsNeeded: nextPartsSummary,
                });
              }}
              placeholder="Ví dụ: Tai trái mất nguồn, bật ANC rè..."
              error={errors.issue || errors[`issue_${device.id}`]}
            />

            {/* Filter nhanh lỗi hoặc linh kiện */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#176b51] uppercase tracking-wide">
                  Lỗi thường gặp ({device.category}) & Linh kiện đi kèm:
                </span>
                <span className="text-[11px] text-[#81908a]">
                  ({filteredIssues.length} mẫu lỗi)
                </span>
              </div>

              <Input
                data-testid="quick-intake-issue-filter-input"
                value={quickIssueFilter}
                onChange={(e) => setQuickIssueFilter(e.target.value)}
                placeholder="🔍 Gõ lọc nhanh lỗi hoặc mã SKU linh kiện kho (VD: BAT-APP2-01, MESH-APP-02, pin, rè ANC...)"
              />

              {filteredIssues.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {filteredIssues.map((chip, idx) => {
                    const active = device.issue.includes(chip.issue_name);
                    const firstPart = chip.linked_parts?.[0];
                    return (
                      <button
                        key={chip.id || idx}
                        type="button"
                        onClick={() => onChipClick(chip)}
                        className={`text-[11px] px-2.5 py-1.5 rounded-[12px] border transition-colors cursor-pointer flex items-center gap-1.5 text-left ${
                          active
                            ? 'bg-[#e9f4ef] border-[#176b51] text-[#176b51] font-bold shadow-2xs'
                            : 'bg-[#f6f8f6] border-[#e9eeeb] text-[#5c6964] hover:border-[#176b51]'
                        }`}
                      >
                        <span>{active ? '✓' : '+'} {chip.issue_name}</span>
                        {firstPart && (
                          <span className="px-1.5 py-0.5 rounded bg-white/90 border border-[#cde4d8] text-[10px] font-mono text-[#176b51]">
                            🔧 {firstPart.part_sku} (-{firstPart.quantity})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-[#81908a] italic py-1">
                  Không tìm thấy mẫu lỗi khớp từ khóa &ldquo;{quickIssueFilter}&rdquo;.
                </div>
              )}

              {/* Khu vực trực quan: Linh kiện Kho gắn liền với lỗi */}
              {previewIssueObjects.length > 0 && (
                <div
                  data-testid="quick-intake-issue-object-preview"
                  className="p-3 rounded-[8px] bg-[#f8fbf9] border border-[#cde4d8] space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#dcebe3]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#176b51] text-white text-[10px] font-bold uppercase">
                        Trừ Kho Tự Động
                      </span>
                      <strong className="text-[#17231f]">
                        Linh kiện Kho gắn liền với lỗi (Tự động trừ tồn kho tại Kho &amp; Mua hàng ngay khi Tạo đơn)
                      </strong>
                    </div>
                  </div>

                  {previewIssueObjects.map((obj) => (
                    <div
                      key={obj.issue_code}
                      className="p-2.5 rounded-[6px] bg-white border border-[#e3ece7] space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-[#176b51] bg-[#e9f4ef] px-1.5 py-0.5 rounded">
                            {obj.issue_code}
                          </span>
                          <b className="text-[#17231f]">{obj.issue_name}</b>
                        </div>
                        <span className="text-[11px] text-[#5c6964]">
                          Danh mục: <b>{obj.category}</b>
                          {device.watchSize ? ` · Size: ${device.watchSize}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-[#176b51] font-bold">
                          Linh kiện trừ kho ({obj.linked_parts.length}):
                        </span>
                        {obj.linked_parts.map((pt) => (
                          <span
                            key={`${obj.issue_code}-${pt.part_sku}`}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#e9f4ef] text-[#176b51] border border-[#cde4d8] text-[11px] font-semibold"
                          >
                            <span>🔧 {pt.part_name}</span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-white border border-[#b8d9cb]">
                              SKU: {pt.part_sku}
                            </span>
                            <span className="font-mono font-bold text-[#bc5b52]">
                              -{pt.quantity} {pt.unit || 'cái'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="pt-1.5 border-t border-[#dcebe3] space-y-1">
                    <label className="block text-[11px] font-bold text-[#176b51]">
                      Linh kiện xuất trừ Kho &amp; Mua hàng khi bấm Lưu đơn (parts_needed):
                    </label>
                    <Input
                      data-testid="quick-intake-linked-parts-needed-input"
                      value={device.partsNeeded || ''}
                      onChange={(e) => onUpdateDevice({ partsNeeded: e.target.value })}
                      placeholder="Tên linh kiện (SKU) x1 — tự động điền khi chọn lỗi..."
                    />
                  </div>
                </div>
              )}
            </div>
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
