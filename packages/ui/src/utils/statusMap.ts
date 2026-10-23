import type { OrderStatusType } from '@podscare/types';

export interface OrderStatusMeta {
  label: string;
  type: OrderStatusType;
  stepIndex: number;
}

/**
 * Bảng ánh xạ trạng thái đơn hàng chuẩn duy nhất (Single Source of Truth)
 * dùng chung cho toàn bộ hệ thống PodsCare Repair OS.
 */
export const ORDER_STATUS_MAP: Record<string, OrderStatusMeta> = {
  received: { label: 'Tiếp nhận mới', type: 'new', stepIndex: 0 },
  inspecting: { label: 'Đang kiểm tra', type: 'progress', stepIndex: 1 },
  waiting_approval: { label: 'Chờ khách duyệt', type: 'wait', stepIndex: 1 },
  quote_pending: { label: 'Chờ khách duyệt', type: 'wait', stepIndex: 1 },
  waiting_tech: { label: 'Chờ kỹ thuật', type: 'new', stepIndex: 1 },
  assigned: { label: 'Đã nhận đơn', type: 'wait', stepIndex: 2 },
  in_repair: { label: 'Đang sửa', type: 'progress', stepIndex: 2 },
  waiting_parts: { label: 'Chờ linh kiện', type: 'wait', stepIndex: 2 },
  rework_needed: { label: 'Cần sửa lại', type: 'danger', stepIndex: 2 },
  waiting_qc: { label: 'Chờ QC', type: 'ready', stepIndex: 3 },
  qc_pending: { label: 'Chờ QC', type: 'ready', stepIndex: 3 },
  qc_inspecting: { label: 'Chờ QC', type: 'ready', stepIndex: 3 },
  ready_for_return: { label: 'Sẵn sàng trả', type: 'ready', stepIndex: 4 },
  waiting_pickup: { label: 'Chờ khách nhận', type: 'ready', stepIndex: 4 },
  completed: { label: 'Hoàn tất', type: 'gray', stepIndex: 4 },
  rejected: { label: 'Từ chối sửa', type: 'danger', stepIndex: 4 },
  cancelled: { label: 'Đã hủy', type: 'gray', stepIndex: 4 },
  refunded: { label: 'Đã hoàn tiền', type: 'gray', stepIndex: 4 },
  // Hỗ trợ tra cứu ngược bằng nhãn tiếng Việt
  'Tiếp nhận mới': { label: 'Tiếp nhận mới', type: 'new', stepIndex: 0 },
  'Đang kiểm tra': { label: 'Đang kiểm tra', type: 'progress', stepIndex: 1 },
  'Chờ khách duyệt': { label: 'Chờ khách duyệt', type: 'wait', stepIndex: 1 },
  'Chờ kỹ thuật': { label: 'Chờ kỹ thuật', type: 'new', stepIndex: 1 },
  'Đã nhận đơn': { label: 'Đã nhận đơn', type: 'wait', stepIndex: 2 },
  'Đang sửa': { label: 'Đang sửa', type: 'progress', stepIndex: 2 },
  'Chờ linh kiện': { label: 'Chờ linh kiện', type: 'wait', stepIndex: 2 },
  'Cần sửa lại': { label: 'Cần sửa lại', type: 'danger', stepIndex: 2 },
  'Chờ QC': { label: 'Chờ QC', type: 'ready', stepIndex: 3 },
  'Sẵn sàng trả': { label: 'Sẵn sàng trả', type: 'ready', stepIndex: 4 },
  'Chờ khách nhận': { label: 'Chờ khách nhận', type: 'ready', stepIndex: 4 },
  'Hoàn tất': { label: 'Hoàn tất', type: 'gray', stepIndex: 4 },
  'Từ chối sửa': { label: 'Từ chối sửa', type: 'danger', stepIndex: 4 },
  'Khách từ chối': { label: 'Từ chối sửa', type: 'danger', stepIndex: 4 },
  'Đã hủy': { label: 'Đã hủy', type: 'gray', stepIndex: 4 },
  'Đã hoàn tiền': { label: 'Đã hoàn tiền', type: 'gray', stepIndex: 4 },
};

export const statusMap = ORDER_STATUS_MAP;

export function resolveOrderStatus(
  status?: string | null,
  fallbackLabel = 'Tiếp nhận mới'
): OrderStatusMeta {
  if (!status) {
    return { label: fallbackLabel, type: 'wait', stepIndex: 0 };
  }
  const clean = status.trim();
  const normalized = clean === 'qc_pending' || clean === 'qc_inspecting' ? 'waiting_qc' : clean;
  return (
    ORDER_STATUS_MAP[normalized] ||
    ORDER_STATUS_MAP[clean] || {
      label: clean || fallbackLabel,
      type: 'wait',
      stepIndex: 0,
    }
  );
}

export function getOrderStepIndex(status?: string | null): number {
  return resolveOrderStatus(status).stepIndex;
}
