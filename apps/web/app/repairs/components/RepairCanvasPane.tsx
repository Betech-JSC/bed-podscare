'use client';

import React from 'react';
import {
  Button,
  StatusTag,
  Icon,
  Input,
  HardwarePartSelector,
} from '@podscare/ui';
import type { HardwarePartKey } from '@podscare/ui';
import type { RepairOrder, AdditionalServiceItem } from '@podscare/types';
import { BomInspector } from './BomInspector';
import { FsmActionBar } from './FsmActionBar';

export interface RepairCanvasPaneProps {
  order: RepairOrder;
  batchOrders?: RepairOrder[];
  onSelectOrder: (order: RepairOrder) => void;
  role?: string;
  isTechRole: boolean;
  canManageAdditionalServices: boolean;
  canManageShippingAddress: boolean;
  isTransitioning: boolean;
  isFulfillingSpecialPart: boolean;
  onFulfillSpecialPart: (order: RepairOrder) => void;
  onResumeOrder: (order: RepairOrder) => void;
  onUpdateStatus: (nextStatus: string, nextType: any, targetStatus?: string) => void;
  onQuickTechComplete: (order: RepairOrder) => void;
  onQuickCheckout: () => void;
  onOpenQc: (orderId: string) => void;
  showAddServiceForm: boolean;
  setShowAddServiceForm: (val: boolean) => void;
  newServiceName: string;
  setNewServiceName: (val: string) => void;
  newServicePrice: number | string;
  setNewServicePrice: (val: number | string) => void;
  newServiceId: number | null;
  setNewServiceId: (val: number | null) => void;
  newServiceNote: string;
  setNewServiceNote: (val: string) => void;
  serviceError: string;
  setServiceError: (val: string) => void;
  isSubmittingService: boolean;
  availableServices: any[];
  onAddAdditionalService: () => void;
  onRequestDeleteService: (srv: AdditionalServiceItem) => void;
  isEditingShippingAddress: boolean;
  setIsEditingShippingAddress: (val: boolean) => void;
  shippingAddressInput: string;
  setShippingAddressInput: (val: string) => void;
  isSavingShippingAddress: boolean;
  onSaveShippingAddress: () => void;
  moneyFormatted: (n: number) => string;
  normalizeVndPrice: (raw: unknown) => number;
}

function parseSelectedPartsFromAccessories(accessories?: string | null): HardwarePartKey[] {
  if (!accessories) return ['L', 'R', 'Case'];
  const lower = accessories.toLowerCase();
  const parts: HardwarePartKey[] = [];
  if (lower.includes('tai trái') || lower.includes('(l)') || lower.includes('đủ bộ')) {
    parts.push('L');
  }
  if (lower.includes('tai phải') || lower.includes('(r)') || lower.includes('đủ bộ')) {
    parts.push('R');
  }
  if (lower.includes('hộp sạc') || lower.includes('dock') || lower.includes('case') || lower.includes('đủ bộ')) {
    parts.push('Case');
  }
  return parts.length > 0 ? parts : ['L', 'R', 'Case'];
}

export const RepairCanvasPane: React.FC<RepairCanvasPaneProps> = ({
  order,
  batchOrders,
  onSelectOrder,
  role,
  isTechRole,
  canManageAdditionalServices,
  canManageShippingAddress,
  isTransitioning,
  isFulfillingSpecialPart,
  onFulfillSpecialPart,
  onResumeOrder,
  onUpdateStatus,
  onQuickTechComplete,
  onQuickCheckout,
  onOpenQc,
  showAddServiceForm,
  setShowAddServiceForm,
  newServiceName,
  setNewServiceName,
  newServicePrice,
  setNewServicePrice,
  newServiceId,
  setNewServiceId,
  newServiceNote,
  setNewServiceNote,
  serviceError,
  setServiceError,
  isSubmittingService,
  availableServices,
  onAddAdditionalService,
  onRequestDeleteService,
  isEditingShippingAddress,
  setIsEditingShippingAddress,
  shippingAddressInput,
  setShippingAddressInput,
  isSavingShippingAddress,
  onSaveShippingAddress,
  moneyFormatted,
  normalizeVndPrice,
}) => {
  const isWarrantyOrder = order.order_type === 'warranty' || order.orderType === 'warranty';
  const isCodOrder = order.order_type === 'cod' || order.orderType === 'cod';
  const hasShippingAddress = Boolean(order.shipping_address || (order as any).shippingAddress);
  const shouldShowShippingCard = isCodOrder || isWarrantyOrder || hasShippingAddress;
  const selectedParts = parseSelectedPartsFromAccessories(order.accessories);

  return (
    <div className="space-y-4 text-sm">
      {/* Đợt tiếp nhận liên kết đa thiết bị */}
      {order.intake_batch_code && batchOrders && batchOrders.length > 1 && (
        <div className="p-3 bg-[#e9f4ef] rounded-[10px] border border-[#cde4d8] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="package" size={16} className="text-[#176b51]" />
            <div className="text-xs">
              <span className="text-[#4a5c54]">Đợt tiếp nhận: </span>
              <strong className="font-mono text-[#176b51] font-bold">{order.intake_batch_code}</strong>
              <span className="text-[#4a5c54] ml-1.5">({batchOrders.length} thiết bị cùng đợt)</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {batchOrders.map((bo: RepairOrder) => (
              <button
                key={bo.id}
                type="button"
                onClick={() => onSelectOrder(bo)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                  bo.id === order.id
                    ? 'bg-[#176b51] text-white font-bold'
                    : 'bg-white text-[#176b51] border border-[#c3d7cb] hover:bg-[#e9f4ef]'
                }`}
              >
                {bo.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status overview strip */}
      <div
        className={`grid ${
          isTechRole ? 'grid-cols-2' : 'grid-cols-3'
        } gap-3 p-4 bg-[#f6f8f6] rounded-[10px] border border-[#e9eeeb]`}
      >
        <div>
          <span className="text-[#81908a] block text-xs mb-1">Trạng thái</span>
          <StatusTag label={order.status} type={order.statusType} />
        </div>
        {!isTechRole && (
          <div>
            <span className="text-[#81908a] block text-xs mb-0.5">Chi phí sửa chữa</span>
            <b className="text-base text-[#176b51] font-heading font-bold tabular-nums">
              {moneyFormatted(order.price)}
            </b>
          </div>
        )}
        <div>
          <span className="text-[#81908a] block text-xs mb-0.5">Kỹ thuật viên</span>
          <b className="text-sm text-[#17231f]">{order.tech}</b>
        </div>
      </div>

      {/* BOM Inspector (Special Parts, Waiting Parts & Additional Services) */}
      <BomInspector
        order={order}
        isTechRole={isTechRole}
        canManageAdditionalServices={canManageAdditionalServices}
        isTransitioning={isTransitioning}
        isFulfillingSpecialPart={isFulfillingSpecialPart}
        onFulfillSpecialPart={onFulfillSpecialPart}
        onResumeOrder={onResumeOrder}
        showAddServiceForm={showAddServiceForm}
        setShowAddServiceForm={setShowAddServiceForm}
        newServiceName={newServiceName}
        setNewServiceName={setNewServiceName}
        newServicePrice={newServicePrice}
        setNewServicePrice={setNewServicePrice}
        newServiceId={newServiceId}
        setNewServiceId={setNewServiceId}
        newServiceNote={newServiceNote}
        setNewServiceNote={setNewServiceNote}
        serviceError={serviceError}
        setServiceError={setServiceError}
        isSubmittingService={isSubmittingService}
        availableServices={availableServices}
        onAddAdditionalService={onAddAdditionalService}
        onRequestDeleteService={onRequestDeleteService}
        moneyFormatted={moneyFormatted}
        normalizeVndPrice={normalizeVndPrice}
      />

      {/* Quick State Transitions & Dynamic FSM UI Guard */}
      <FsmActionBar
        order={order}
        role={role}
        isTransitioning={isTransitioning}
        onUpdateStatus={onUpdateStatus}
        onQuickTechComplete={onQuickTechComplete}
        onQuickCheckout={onQuickCheckout}
        onOpenQc={onOpenQc}
      />

      {/* Khối Thông tin & Cập nhật nhanh Địa chỉ Giao hàng / Gửi trả máy (COD & Bảo hành) */}
      {shouldShowShippingCard && (
        <div
          data-testid="cod-shipping-address-card"
          className={`p-4 rounded-[10px] border transition-all ${
            hasShippingAddress
              ? 'bg-[#f6f8f6] border-[#e9eeeb]'
              : isWarrantyOrder
              ? 'bg-[#e9f4ef] border-[#cde4d8]'
              : 'bg-[#faf1df] border-[#f2deba]'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#e9eeeb]">
            <h4
              className={`text-xs font-bold uppercase tracking-[0.8px] m-0 ${
                isWarrantyOrder ? 'text-[#176b51]' : 'text-[#b77a21]'
              }`}
            >
              <span>
                {isWarrantyOrder
                  ? 'ĐỊA CHỈ GỬI TRẢ MÁY BẢO HÀNH (KHÁCH TỈNH)'
                  : 'ĐỊA CHỈ GIAO HÀNG COD (KHÁCH TỈNH)'}
              </span>
            </h4>
            {canManageShippingAddress && !isEditingShippingAddress && (
              <button
                type="button"
                data-testid="edit-cod-shipping-address-btn"
                onClick={() => {
                  setShippingAddressInput(
                    order.shipping_address || (order as any).shippingAddress || ''
                  );
                  setIsEditingShippingAddress(true);
                }}
                className="text-xs font-bold text-[#176b51] hover:text-[#10583f] bg-[#e9f4ef] hover:bg-[#d8ece1] px-2.5 py-1 rounded-[6px] border border-[#b8d9cb] transition-colors cursor-pointer"
              >
                {hasShippingAddress ? 'Sửa địa chỉ' : '+ Thêm địa chỉ'}
              </button>
            )}
          </div>

          <div className="pt-2.5">
            {isEditingShippingAddress ? (
              <div className="space-y-2.5">
                <Input
                  value={shippingAddressInput}
                  onChange={(e) => setShippingAddressInput(e.target.value)}
                  placeholder="Nhập số nhà, ngõ/đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                  data-testid="inline-shipping-address-input"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSavingShippingAddress}
                    onClick={() => {
                      setIsEditingShippingAddress(false);
                      setShippingAddressInput(
                        order.shipping_address || (order as any).shippingAddress || ''
                      );
                    }}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="save-cod-shipping-address-btn"
                    disabled={isSavingShippingAddress}
                    onClick={onSaveShippingAddress}
                    className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold"
                  >
                    {isSavingShippingAddress ? 'Đang lưu...' : 'Lưu địa chỉ'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {hasShippingAddress ? (
                  <p className="text-sm text-[#17231f] font-medium m-0 bg-white p-2.5 rounded-[6px] border border-[#e9eeeb]">
                    {order.shipping_address || (order as any).shippingAddress}
                  </p>
                ) : (
                  <div
                    className={`p-2.5 rounded-[6px] border border-dashed text-xs flex items-center justify-between gap-2 ${
                      isWarrantyOrder
                        ? 'bg-[#e9f4ef] border-[#cde4d8] text-[#176b51]'
                        : 'bg-[#faf1df] border-[#f2deba] text-[#b77a21]'
                    }`}
                  >
                    <span>
                      {isWarrantyOrder
                        ? 'Chưa cập nhật địa chỉ gửi trả (CSKH ghi chú sau khi liên hệ khách)'
                        : 'Chưa cập nhật địa chỉ giao hàng (CSKH ghi chú sau khi liên hệ khách)'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sơ đồ linh kiện tiếp nhận (L/R/Case readOnly) */}
      {(!order.deviceCategory || order.deviceCategory === 'AirPods') && (
        <div className="p-3.5 bg-[#f6f8f6] rounded-[10px] border border-[#e9eeeb]">
          <HardwarePartSelector
            value={selectedParts}
            readOnly
            label="Sơ đồ linh kiện bàn giao (L / R / Case)"
          />
        </div>
      )}

      {/* Specs & info */}
      <div className="space-y-2.5">
        <div className="flex justify-between py-1.5 border-b border-[#e9eeeb]">
          <span className="text-[#81908a]">Mã serial / model:</span>
          <b className="font-mono text-[#17231f]">{order.serial || 'Chưa cập nhật'}</b>
        </div>
        <div className="flex justify-between py-1.5 border-b border-[#e9eeeb]">
          <span className="text-[#81908a]">Phụ kiện kèm theo:</span>
          <b className="text-[#17231f]">{order.accessories || 'Không gửi kèm'}</b>
        </div>
        <div className="flex justify-between py-1.5 border-b border-[#e9eeeb]">
          <span className="text-[#81908a]">Chi nhánh tiếp nhận:</span>
          <b className="text-[#17231f]">{order.branch}</b>
        </div>
        <div className="py-1.5">
          <span className="text-[#81908a] block mb-1">Mô tả lỗi tiếp nhận:</span>
          <p className="bg-[#f6f8f6] p-3 rounded-[8px] border border-[#e9eeeb] m-0 text-sm text-[#17231f]">
            {order.issue}
          </p>
        </div>

        {/* Ghi chú kết quả test tại quầy */}
        {(order.testNote || (order as any).test_note) && (
          <div className="py-1.5" data-testid="order-detail-test-note-box">
            <span className="text-[#176b51] font-bold block mb-1 text-xs uppercase tracking-wide">
              Ghi chú kết quả test tại quầy:
            </span>
            <p className="bg-[#e9f4ef] p-3 rounded-[8px] border border-[#cde4d8] text-[#176b51] m-0 text-sm whitespace-pre-wrap font-medium">
              {order.testNote || (order as any).test_note}
            </p>
          </div>
        )}

        {/* Checklist at counter */}
        {order.checks && order.checks.length > 0 && (
          <div className="pt-2">
            <span className="text-[#81908a] font-bold block mb-1.5 text-xs uppercase tracking-wide">
              Kết quả test tại quầy CSKH:
            </span>
            <div className="border border-[#e9eeeb] rounded-[8px] overflow-hidden divide-y divide-[#e9eeeb]">
              {order.checks.map((chk, i) => (
                <div key={i} className="flex justify-between p-2.5 text-sm">
                  <span>{chk.label}</span>
                  <b
                    className={
                      chk.status === 'Hoạt động'
                        ? 'text-[#176b51]'
                        : chk.status === 'Lỗi'
                        ? 'text-[#bc5b52]'
                        : 'text-[#81908a]'
                    }
                  >
                    {chk.status}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
