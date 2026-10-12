'use client';

import React from 'react';
import { Modal, Button, Icon } from '@podscare/ui';
import type { AuditLogItem } from '@podscare/api-client';

export interface AuditDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: AuditLogItem | null;
}

const FIELD_LABEL_MAP: Record<string, string> = {
  total_price: 'Tổng giá đơn hàng',
  estimated_price: 'Giá ước tính',
  initial_price: 'Giá gốc tiếp nhận',
  status: 'Trạng thái',
  role: 'Vai trò / Phân quyền',
  is_active: 'Kích hoạt tài khoản',
  difference_amount: 'Chênh lệch tiền két',
  actual_cash: 'Tiền mặt kiểm đếm thực tế',
  expected_cash: 'Tiền mặt hệ thống tính',
  debt_amount: 'Số nợ nhà cung cấp',
  repay_amount: 'Số tiền thanh toán nợ',
  refund_amount: 'Số tiền hoàn trả',
  refund_method: 'Phương thức hoàn tiền',
  refund_reason: 'Lý do hoàn tiền',
  rework_order_id: 'Mã đơn sửa lại (Rework)',
  issue_description: 'Mô tả sự cố / Lỗi',
  resolution_mode: 'Hướng xử lý bảo hành',
};

export const AuditDiffModal: React.FC<AuditDiffModalProps> = ({
  isOpen,
  onClose,
  log,
}) => {
  if (!log) return null;

  const oldValues = log.old_values || {};
  const newValues = log.new_values || {};

  const allKeys = Array.from(
    new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  );

  const formatValue = (key: string, val: any): React.ReactNode => {
    if (val === null || val === undefined) {
      return <span className="text-[#9aa59f] italic">Trống (null)</span>;
    }
    if (typeof val === 'boolean') {
      return val ? (
        <span className="text-[#176b58] font-bold">Bật (true)</span>
      ) : (
        <span className="text-[#b91c1c] font-bold">Tắt (false)</span>
      );
    }
    if (typeof val === 'number') {
      // Check if price / money field
      if (
        key.includes('price') ||
        key.includes('amount') ||
        key.includes('cash') ||
        key.includes('debt') ||
        key.includes('fee')
      ) {
        return (
          <span className="font-mono font-bold">
            {new Intl.NumberFormat('vi-VN').format(val)} ₫
          </span>
        );
      }
      return <span className="font-mono font-bold">{val}</span>;
    }
    if (typeof val === 'object') {
      return (
        <pre className="text-[11px] font-mono bg-black/5 p-1.5 rounded overflow-x-auto m-0">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return String(val);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      eyebrow={`AUDIT LOG · ID #${log.id || 'N/A'}`}
      title={`Chi tiết so sánh thay đổi: ${log.action}`}
      subtitle={`Người thực hiện: ${log.user_name || log.user?.name || 'Hệ thống'} · Đối tượng: ${log.auditable_type || 'Bản ghi'} #${log.auditable_id || ''}`}
      footer={
        <div className="flex justify-end w-full">
          <Button variant="secondary" size="md" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Hộp tóm tắt hoạt động */}
        <div className="bg-[#f7faf8] border border-[#e2ede7] rounded-[10px] p-3 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-[#176b58] flex items-center gap-1.5">
              <Icon name="clock" size={13} />
              <span>Thời gian ghi log: {log.time || log.created_at}</span>
            </span>
            <span className="font-mono text-[#7a8a81]">IP: {log.ip_address || '127.0.0.1'}</span>
          </div>
          <div className="text-[#35463e]">
            <b>Nội dung tóm tắt:</b> {log.details || log.detail || '—'}
          </div>
        </div>

        {/* Bảng so sánh Old vs New values */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-[#35463e] uppercase tracking-wider m-0 flex items-center gap-1.5">
              <Icon name="refresh" size={13} className="text-[#176b58]" />
              <span>Bảng so sánh giá trị trước và sau khi thay đổi (Field-level Diffs)</span>
            </h4>
            <span className="text-[11px] font-bold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded-full">
              {allKeys.length} trường dữ liệu thay đổi
            </span>
          </div>

          {allKeys.length === 0 ? (
            <div className="p-4 bg-white border border-[#e5ece8] rounded-[8px] text-xs text-[#7a8a81] text-center">
              Bản ghi này không có cấu trúc JSON diffs (chỉ lưu vết dạng chuỗi chi tiết).
            </div>
          ) : (
            <div className="border border-[#e2ede7] rounded-[10px] overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f7f5] border-b border-[#e2ede7] text-[#556960] font-bold uppercase tracking-wider h-9">
                    <th className="px-3 py-2 w-1/3">Trường dữ liệu</th>
                    <th className="px-3 py-2 w-1/3 text-[#b91c1c] bg-[#fdf2f2]/60">
                      Giá trị cũ (Old Value)
                    </th>
                    <th className="px-3 py-2 w-1/3 text-[#15803d] bg-[#f0fdf4]/60">
                      Giá trị mới (New Value)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf3ef]">
                  {allKeys.map((key) => {
                    const oldVal = oldValues[key];
                    const newVal = newValues[key];

                    return (
                      <tr key={key} className="hover:bg-[#fafcfa] transition-colors">
                        <td className="px-3 py-2.5 font-medium text-[#1c302b]">
                          <span className="block font-semibold">
                            {FIELD_LABEL_MAP[key] || key}
                          </span>
                          <span className="font-mono text-[10px] text-[#85968d] block mt-0.5">
                            {key}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 bg-[#fdf2f2]/40 text-[#991b1b]">
                          {formatValue(key, oldVal)}
                        </td>
                        <td className="px-3 py-2.5 bg-[#f0fdf4]/40 text-[#166534]">
                          {formatValue(key, newVal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Khối Metadata nếu có */}
        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <div className="bg-[#f9faf9] border border-[#e5ece8] rounded-[8px] p-3 text-xs space-y-1">
            <span className="font-bold text-[#556960] block">Thông tin bổ sung (Metadata):</span>
            <pre className="text-[11px] font-mono bg-white p-2 rounded border border-[#e2ede7] overflow-x-auto m-0 text-[#2c3d35]">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
};
