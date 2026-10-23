'use client';

import React from 'react';
import {
  Button,
  Icon,
  Input,
  Textarea,
  CurrencyInput,
} from '@podscare/ui';
import type { RepairOrder, AdditionalServiceItem } from '@podscare/types';
import { normalizeStatusCode } from '../fsm';

export interface BomInspectorProps {
  order: RepairOrder;
  isTechRole: boolean;
  canManageAdditionalServices: boolean;
  isTransitioning: boolean;
  isFulfillingSpecialPart: boolean;
  onFulfillSpecialPart: (order: RepairOrder) => void;
  onResumeOrder: (order: RepairOrder) => void;
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
  moneyFormatted: (n: number) => string;
  normalizeVndPrice: (raw: unknown) => number;
}

export const BomInspector: React.FC<BomInspectorProps> = ({
  order,
  isTechRole,
  canManageAdditionalServices,
  isTransitioning,
  isFulfillingSpecialPart,
  onFulfillSpecialPart,
  onResumeOrder,
  showAddServiceForm,
  setShowAddServiceForm,
  newServiceName,
  setNewServiceName,
  newServicePrice,
  setNewServicePrice,
  setNewServiceId,
  newServiceNote,
  setNewServiceNote,
  serviceError,
  setServiceError,
  isSubmittingService,
  availableServices,
  onAddAdditionalService,
  onRequestDeleteService,
  moneyFormatted,
  normalizeVndPrice,
}) => {
  const isSpecialPartPurchased =
    order.special_parts_status === 'purchased' || order.specialPartsStatus === 'purchased';
  const isSpecialPartPending =
    order.special_parts_status === 'pending' || order.specialPartsStatus === 'pending';

  return (
    <div className="space-y-4">
      {/* Khối thông tin nổi bật cảnh báo: Yêu cầu mua linh kiện ngoài */}
      {Boolean(order.special_parts_needed || order.specialPartsNeeded || order.special_parts_status) && (
        <div
          data-testid="drawer-special-parts-warning"
          className={`p-4 rounded-[10px] border-2 space-y-3 shadow-xs ${
            isSpecialPartPurchased
              ? 'bg-[#e9f4ef] border-[#176b51]'
              : 'bg-red-50/60 border-red-400 ring-1 ring-red-400/20'
          }`}
        >
          <div
            className={`flex items-center justify-between pb-2 border-b ${
              isSpecialPartPurchased ? 'border-[#cde4d8]' : 'border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                name={isSpecialPartPurchased ? 'cart' : 'bell'}
                size={16}
                className={isSpecialPartPurchased ? 'text-[#176b51]' : 'text-red-600'}
              />
              <h4
                className={`text-xs font-bold uppercase tracking-wide m-0 ${
                  isSpecialPartPurchased ? 'text-[#176b51]' : 'text-red-700'
                }`}
              >
                YÊU CẦU MUA LINH KIỆN NGOÀI (KTV BÁO QUẦY)
              </h4>
            </div>
            <span
              data-testid="drawer-special-parts-status"
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isSpecialPartPurchased
                  ? 'bg-[#e9f4ef] text-[#176b51] border border-[#cde4d8]'
                  : 'bg-red-50 text-red-700 border border-red-300 font-bold'
              }`}
            >
              {isSpecialPartPurchased ? 'Quầy đã mua linh kiện' : 'Chờ Quầy tìm mua ngoài'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#92400e] font-semibold block mb-0.5">Linh kiện cần mua ngoài:</span>
              <b className="text-[#78350f] text-sm block">
                {order.special_parts_needed || order.specialPartsNeeded || 'Chưa ghi rõ'}
              </b>
            </div>
            <div>
              <span className="text-[#92400e] font-semibold block mb-0.5">KTV yêu cầu:</span>
              <b className="text-[#78350f] text-sm block">{order.tech || 'Kỹ thuật viên'}</b>
            </div>
          </div>

          {order.special_parts_requested_at && (
            <div className="text-xs text-[#92400e]">
              <span>Thời gian yêu cầu: </span>
              <b className="text-[#78350f]">
                {new Date(order.special_parts_requested_at).toLocaleString('vi-VN')}
              </b>
            </div>
          )}

          {order.special_parts_fulfilled_at && (
            <div className="text-xs text-[#176b51] bg-[#e9f4ef] p-2 rounded border border-[#cde4d8]">
              <span>Đã mua lúc: </span>
              <b>{new Date(order.special_parts_fulfilled_at).toLocaleString('vi-VN')}</b>
            </div>
          )}

          {isSpecialPartPending && (
            <div className="pt-2 border-t border-[#fde68a] flex items-center justify-between">
              <span className="text-xs text-[#92400e] italic font-medium">
                Bấm xác nhận sau khi đã mua để chuyển đơn về bàn sửa KTV.
              </span>
              <Button
                variant="primary"
                size="md"
                data-testid="fulfill-special-part-btn"
                disabled={isFulfillingSpecialPart}
                onClick={() => onFulfillSpecialPart(order)}
                className="bg-[#b77a21] hover:bg-[#92400e] text-white font-bold text-xs sm:text-sm px-4 py-2 shadow-sm cursor-pointer"
              >
                {isFulfillingSpecialPart ? 'Đang xử lý...' : 'Đã mua linh kiện'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Khối cảnh báo màu cam nổi bật khi đơn chờ linh kiện */}
      {(normalizeStatusCode(order.status) === 'waiting_parts' ||
        Boolean(order.parts_needed) ||
        Boolean(order.partsNeeded)) && (
        <div className="p-4 bg-[#faf1df] rounded-[10px] border border-[#f2deba] space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#b77a21] uppercase tracking-wide m-0 flex items-center gap-1.5">
              <Icon name="alert" size={14} className="text-[#b77a21]" /> YÊU CẦU LINH KIỆN TỪ PHÒNG KỸ THUẬT
            </h4>
            {order.paused_at && (
              <span className="text-[11px] text-[#92400e] font-medium">
                Tạm dừng: {new Date(order.paused_at).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#92400e] font-semibold block mb-0.5">Linh kiện cần:</span>
              <b className="text-[#78350f] text-sm block">
                {order.parts_needed || order.partsNeeded || 'Chưa ghi rõ'}
              </b>
            </div>
            <div>
              <span className="text-[#92400e] font-semibold block mb-0.5">KTV phụ trách:</span>
              <b className="text-[#78350f] text-sm block">{order.tech || 'Kỹ thuật viên'}</b>
            </div>
          </div>

          {order.repairNote && (
            <div className="text-xs">
              <span className="text-[#92400e] font-semibold block mb-0.5">Ghi chú KTV:</span>
              <p className="text-[#78350f] bg-white/70 p-2 rounded border border-[#f2deba] m-0">
                {order.repairNote}
              </p>
            </div>
          )}

          {normalizeStatusCode(order.status) === 'waiting_parts' && (
            <div className="pt-1 flex items-center justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={isTransitioning}
                onClick={() => onResumeOrder(order)}
                className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-xs"
              >
                Đã có linh kiện - Báo KTV tiếp tục sửa
              </Button>
            </div>
          )}
        </div>
      )}

      {/* BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ (Bảo toàn ẩn giá tuyệt đối với role tech/technician) */}
      <div className="p-4 bg-[#fbfdfc] rounded-[10px] border border-[#e9eeeb] space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-[#e9eeeb]">
          <h4 className="text-xs font-bold text-[#176b51] uppercase tracking-[0.8px] m-0 flex items-center gap-1.5">
            <Icon name="receipt" size={14} className="text-[#176b51]" />{' '}
            {isTechRole ? 'BẢNG KÊ DỊCH VỤ SỬA CHỮA' : 'BẢNG KÊ DỊCH VỤ SỬA CHỮA & CHI PHÍ'}
          </h4>
          {canManageAdditionalServices &&
            !['completed', 'cancelled'].includes(normalizeStatusCode(order.status)) &&
            !showAddServiceForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddServiceForm(true);
                  setServiceError('');
                  setNewServiceName('');
                  setNewServicePrice('');
                  setNewServiceId(null);
                  setNewServiceNote('');
                }}
                className="text-xs text-[#176b51] border-[#b8d0c5] hover:bg-[#e9f4ef] font-semibold py-1 px-2.5 h-auto flex items-center gap-1"
              >
                <Icon name="plus" size={12} />
                <span>Thêm dịch vụ sửa thêm</span>
              </Button>
            )}
        </div>

        {/* Form thêm dịch vụ bổ sung */}
        {showAddServiceForm && (
          <div className="p-3.5 bg-[#e9f4ef] rounded-[8px] border border-[#b8d9cb] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#176b51] uppercase tracking-wide">
                Thêm dịch vụ khách yêu cầu làm thêm
              </span>
              <button
                type="button"
                onClick={() => setShowAddServiceForm(false)}
                className="text-[#81908a] hover:text-[#17231f] text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>

            {serviceError && (
              <div className="p-2 rounded bg-[#fbeaea] border border-[#f5c2c2] text-[#bc5b52] text-xs font-medium flex items-center gap-1.5">
                <Icon name="alert" size={14} />
                <span>{serviceError}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-bold text-[#17231f] mb-1">
                  Tên dịch vụ làm thêm <span className="text-red-500">*</span>:
                </label>
                <div className="space-y-1.5">
                  <Input
                    placeholder="Gõ tên dịch vụ hoặc chọn gợi ý bên dưới..."
                    value={newServiceName}
                    onChange={(e) => {
                      setNewServiceName(e.target.value);
                      setServiceError('');
                    }}
                  />
                  {availableServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <span className="text-[11px] text-[#81908a] self-center">Gợi ý nhanh:</span>
                      {availableServices.slice(0, 5).map((srv) => (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => {
                            setNewServiceName(srv.name);
                            setNewServiceId(srv.id);
                            setServiceError('');
                          }}
                          className="text-[11px] px-2 py-0.5 rounded bg-white hover:bg-[#d8ece1] border border-[#c5ddd1] text-[#176b51] transition-colors cursor-pointer"
                        >
                          {srv.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <CurrencyInput
                  label="Đơn giá dịch vụ thỏa thuận (VNĐ) *"
                  placeholder="Nhập số tiền đã báo khách (bắt buộc > 0)..."
                  value={newServicePrice}
                  onChangeValue={(val) => {
                    setNewServicePrice(val);
                    setServiceError('');
                  }}
                />
                <span className="text-[11px] text-[#81908a] italic block mt-0.5">
                  * Bắt buộc nhập tay theo giá đã chốt với khách hàng.
                </span>
              </div>

              <div>
                <Textarea
                  label="Ghi chú dặn dò của khách (nếu có):"
                  placeholder="Ví dụ: Khách dặn lấy pin dung lượng chuẩn, dùng keo viền chống nước..."
                  rows={2}
                  value={newServiceNote}
                  onChange={(e) => setNewServiceNote(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isSubmittingService}
                  onClick={() => setShowAddServiceForm(false)}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingService}
                  onClick={onAddAdditionalService}
                  className="bg-[#176b51] hover:bg-[#10583f] text-white font-bold"
                >
                  {isSubmittingService ? 'Đang lưu...' : 'Xác nhận thêm dịch vụ'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bảng kê chi tiết phân rã */}
        <div className="space-y-2 text-xs">
          {/* 1. Dịch vụ tiếp nhận ban đầu */}
          <div className="p-2.5 rounded-[8px] bg-white border border-[#e9eeeb] flex items-center justify-between">
            <div>
              <span className="font-bold text-[#17231f] block text-[13px]">
                1. Tiếp nhận ban đầu: {order.device}
              </span>
              <span className="text-[#81908a] block mt-0.5">Lỗi ghi nhận: {order.issue}</span>
            </div>
            {!isTechRole && (
              <div className="text-right">
                <span className="font-bold text-sm text-[#17231f] font-mono tabular-nums">
                  {moneyFormatted(
                    normalizeVndPrice(
                      order.initial_price !== undefined && order.initial_price !== null
                        ? order.initial_price
                        : order.initialPrice !== undefined && order.initialPrice !== null
                        ? order.initialPrice
                        : order.price
                    )
                  )}
                </span>
                <span className="block text-[10px] text-[#81908a]">Giá ban đầu</span>
              </div>
            )}
          </div>

          {/* 2. Dịch vụ sửa thêm */}
          {(order.additional_services && order.additional_services.length > 0) ||
          (order.additionalServices && order.additionalServices.length > 0) ? (
            <div className="space-y-1.5">
              <span className="font-bold text-[#176b51] uppercase tracking-wide block pt-1 text-[11px]">
                Dịch vụ khách yêu cầu làm thêm (
                {(order.additional_services || order.additionalServices || []).length} mục):
              </span>
              {(order.additional_services || order.additionalServices || []).map((srv, idx) => (
                <div
                  key={srv.id || idx}
                  className="p-2.5 rounded-[8px] bg-[#f6f8f6] border border-[#cde4d8] flex items-start justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#17231f] text-sm">
                        #{idx + 2}. {srv.name}
                      </span>
                      {!isTechRole && (
                        <span className="text-xs font-bold text-[#176b51] font-mono tabular-nums bg-white px-2 py-0.5 rounded border border-[#b8d9cb]">
                          +{moneyFormatted(srv.price)}
                        </span>
                      )}
                    </div>
                    {srv.note && (
                      <p className="text-[#4a5c54] italic m-0 text-xs flex items-center gap-1">
                        <Icon name="comment" size={12} />
                        <span>Dặn dò: {srv.note}</span>
                      </p>
                    )}
                    <div className="text-[11px] text-[#81908a]">
                      Tạo bởi: <b className="text-[#17231f]">{srv.created_by_name || 'CSKH'}</b>
                      {srv.created_at && (
                        <span className="ml-1">({new Date(srv.created_at).toLocaleString('vi-VN')})</span>
                      )}
                    </div>
                  </div>

                  {canManageAdditionalServices &&
                    !['completed', 'cancelled'].includes(normalizeStatusCode(order.status)) && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteService(srv)}
                        className="text-[#bc5b52] hover:bg-[#fbeaea] px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 flex-none cursor-pointer"
                        title="Hủy dịch vụ này"
                      >
                        <Icon name="trash" size={12} />
                        <span>Xóa</span>
                      </button>
                    )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2.5 rounded-[8px] bg-[#f6f8f6] border border-dashed border-[#d2dfd8] text-center text-[#81908a] text-xs">
              Chưa phát sinh dịch vụ sửa thêm. Khách có thể yêu cầu bổ sung bất cứ lúc nào trước khi hoàn tất sửa chữa.
            </div>
          )}

          {/* 3. Dòng Tổng cộng thanh toán */}
          {!isTechRole && (
            <div className="p-3 bg-[#e9f4ef] rounded-[8px] border-2 border-[#176b51] flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wide text-[#176b51]">
                TỔNG CỘNG THANH TOÁN:
              </span>
              <b className="text-lg font-bold text-[#176b51] font-heading tabular-nums">
                {moneyFormatted(
                  normalizeVndPrice(
                    order.total_price !== undefined ? order.total_price : order.price
                  )
                )}
              </b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
