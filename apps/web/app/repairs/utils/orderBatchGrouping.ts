import type { RepairOrder } from '@podscare/types';

export interface GroupedOrderRow {
  rowKey: string;
  primaryOrder: RepairOrder;
  orders: RepairOrder[];
  isBatch: boolean;
  batchCode?: string;
  totalPrice: number;
}

/**
 * Gom các đơn có cùng `intake_batch_code` (>= 2 đơn) thành 1 dòng hiển thị gộp,
 * giữ nguyên thứ tự xuất hiện đầu tiên trong danh sách.
 */
export function groupOrdersForDisplay(orders: RepairOrder[]): GroupedOrderRow[] {
  if (!Array.isArray(orders) || orders.length === 0) return [];

  const batchBuckets = new Map<string, RepairOrder[]>();
  for (const order of orders) {
    const code = (order.intake_batch_code || '').trim();
    if (!code) continue;
    const bucket = batchBuckets.get(code);
    if (bucket) {
      bucket.push(order);
    } else {
      batchBuckets.set(code, [order]);
    }
  }

  const emittedBatchCodes = new Set<string>();
  const rows: GroupedOrderRow[] = [];

  for (const order of orders) {
    const code = (order.intake_batch_code || '').trim();
    if (code) {
      const bucket = batchBuckets.get(code) || [order];
      if (bucket.length >= 2) {
        if (emittedBatchCodes.has(code)) continue;
        emittedBatchCodes.add(code);
        const totalPrice = bucket.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
        const primaryWithBatch: RepairOrder = {
          ...bucket[0],
          batchOrders: bucket,
        };
        rows.push({
          rowKey: `batch:${code}`,
          primaryOrder: primaryWithBatch,
          orders: bucket,
          isBatch: true,
          batchCode: code,
          totalPrice,
        });
        continue;
      }
    }

    rows.push({
      rowKey: `order:${order.id}`,
      primaryOrder: order,
      orders: [order],
      isBatch: false,
      batchCode: code || undefined,
      totalPrice: Number(order.price) || 0,
    });
  }

  return rows;
}

export function normalizePhoneForGrouping(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function validateOrdersForBatchGrouping(
  orders: RepairOrder[]
): { valid: boolean; reason?: string } {
  if (!Array.isArray(orders) || orders.length < 2) {
    return {
      valid: false,
      reason: 'Vui lòng chọn ít nhất 2 đơn để gộp nhóm.',
    };
  }

  const normalizedPhones = orders.map((o) => normalizePhoneForGrouping(o.phone));
  const nonEmptyPhones = normalizedPhones.filter(Boolean);

  if (nonEmptyPhones.length === orders.length) {
    const firstPhone = nonEmptyPhones[0];
    if (nonEmptyPhones.some((p) => p !== firstPhone)) {
      return {
        valid: false,
        reason: 'Chỉ có thể gộp nhóm các đơn của cùng một khách hàng (cùng SĐT).',
      };
    }
  } else {
    const firstPhone = nonEmptyPhones[0];
    if (firstPhone && nonEmptyPhones.some((p) => p !== firstPhone)) {
      return {
        valid: false,
        reason: 'Chỉ có thể gộp nhóm các đơn của cùng một khách hàng (cùng SĐT).',
      };
    }
    const normalizedNames = orders.map((o) => (o.name || '').trim().toLowerCase());
    const firstName = normalizedNames[0];
    if (!firstName || normalizedNames.some((n) => n !== firstName)) {
      return {
        valid: false,
        reason: 'Chỉ có thể gộp nhóm các đơn của cùng một khách hàng.',
      };
    }
  }

  const firstOrder = orders[0];
  const firstBranchId =
    firstOrder.branchId !== undefined && firstOrder.branchId !== null && firstOrder.branchId !== ''
      ? String(firstOrder.branchId)
      : '';
  const firstBranchName = (firstOrder.branchName || firstOrder.branch || '').trim().toLowerCase();

  for (let i = 1; i < orders.length; i++) {
    const item = orders[i];
    const itemBranchId =
      item.branchId !== undefined && item.branchId !== null && item.branchId !== ''
        ? String(item.branchId)
        : '';
    const itemBranchName = (item.branchName || item.branch || '').trim().toLowerCase();

    if (firstBranchId && itemBranchId) {
      if (firstBranchId !== itemBranchId) {
        return {
          valid: false,
          reason: 'Chỉ có thể gộp nhóm các đơn thuộc cùng một chi nhánh.',
        };
      }
    } else if (firstBranchName && itemBranchName && firstBranchName !== itemBranchName) {
      return {
        valid: false,
        reason: 'Chỉ có thể gộp nhóm các đơn thuộc cùng một chi nhánh.',
      };
    }
  }

  return { valid: true };
}
