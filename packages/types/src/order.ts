export type OrderStatusType = 'wait' | 'progress' | 'ready' | 'danger' | 'new' | 'gray';

export type SpecialPartsStatus = 'pending' | 'purchased';

export type OrderDateFilter = 'today' | 'yesterday' | 'day_before' | '3_days' | '7_days' | '30_days' | 'all';

export interface OrderFilterDTO {
  search?: string;
  status?: string;
  role?: string;
  branch_id?: string | number;
  order_type?: 'in_store' | 'cod' | 'all' | string;
  date_filter?: OrderDateFilter;
  date?: string;
  date_type?: 'created_at' | 'completed_at' | 'handed_over_at';
  q?: string;
  page?: number;
  per_page?: number;
  technician_id?: string | number;
  intake_batch_code?: string;
  special_parts?: boolean | string;
  special_parts_status?: SpecialPartsStatus | 'all' | string;
  [key: string]: any;
}

export type HandoverReasonTag = 'wrong_order' | 'complex_repair' | 'shift_change' | 'missing_parts_tools';

export interface HandoverPayload {
  target: 'queue' | 'technician';
  technician_id?: number | null;
  reason_tag: HandoverReasonTag;
  handover_notes?: string;
  expected_updated_at?: string;
}

export type StandardOrderStatus =
  | 'Tiếp nhận mới'
  | 'Chờ kỹ thuật'
  | 'Đã nhận đơn'
  | 'Đang kiểm tra'
  | 'Chờ khách duyệt'
  | 'Đã duyệt'
  | 'Đang sửa'
  | 'Chờ linh kiện'
  | 'Hoàn tất kỹ thuật'
  | 'Chờ QC'
  | 'Cần sửa lại'
  | 'Sẵn sàng trả'
  | 'Chờ khách nhận'
  | 'Hoàn tất'
  | 'Đã hủy';

export type ChecklistStatus = 'Hoạt động' | 'Lỗi' | 'Không kiểm tra';

export interface IntakeCheckItem {
  label: string;
  status: ChecklistStatus;
}

export interface DevicePhoto {
  name: string;
  url: string;
}

export interface AdditionalServiceItem {
  id: string;
  name: string;
  price: number;
  service_id?: number | null;
  note?: string | null;
  created_at: string;
  created_by_user_id?: number | null;
  created_by_name?: string | null;
}

export interface AddAdditionalServiceDTO {
  name: string;
  price: number;
  service_id?: number | null;
  note?: string | null;
}

export interface RepairOrder {
  id: string;
  name: string;
  phone: string;
  deviceCategory?: string;
  device: string;
  device_id?: number | string | null;
  device_model_id?: number | string | null;
  serial?: string;
  issue: string;
  status: string;
  statusType: OrderStatusType;
  order_type?: 'in_store' | 'cod' | 'warranty';
  orderType?: 'in_store' | 'cod' | 'warranty';
  shipping_address?: string | null;
  shippingAddress?: string | null;
  address?: string | null;
  price: number;
  total_price?: number;
  initial_price?: number;
  initialPrice?: number;
  additional_services?: AdditionalServiceItem[];
  additionalServices?: AdditionalServiceItem[];
  tech: string;
  technicianId?: number | null;
  technician_id?: number | null;
  date: string;
  branch: string;
  branchId?: number | string;
  branchName?: string;
  accessories?: string;
  appearance?: string;
  checks?: IntakeCheckItem[];
  photos?: DevicePhoto[];
  testNote?: string | null;
  test_note?: string | null;
  priceNote?: string;
  warrantyTerm?: string;
  warranty_terms_days?: number;
  discount_type?: 'none' | 'percent' | 'fixed';
  discount_value?: number;
  discount_amount?: number;
  warranty_months?: 3 | 6 | 9 | 12;
  repairNote?: string;
  partsUsed?: string;
  parts_needed?: string | null;
  partsNeeded?: string | null;
  special_parts_needed?: string | null;
  specialPartsNeeded?: string | null;
  special_parts_status?: SpecialPartsStatus | null;
  specialPartsStatus?: SpecialPartsStatus | null;
  special_parts_requested_at?: string | null;
  specialPartsRequestedAt?: string | null;
  special_parts_fulfilled_at?: string | null;
  specialPartsFulfilledAt?: string | null;
  paused_at?: string | null;
  pausedAt?: string | null;
  finalCheck?: string;
  qcIssue?: string;
  qcApprovedBy?: string;
  qcCheckedAt?: string;
  customerApprovedAt?: string | null;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  handedAt?: string;
  createdBy?: string;
  created_by_user_id?: number | string | null;
  created_by_user?: {
    id: number;
    name: string;
    role: string;
    email?: string;
  } | null;
  createdAt?: string;
  intake_batch_code?: string;
  batchOrders?: RepairOrder[];
}

export interface SimpleCheckoutPayload {
  payment_method: 'cash' | 'bank_transfer' | string;
  amount?: number;
  service_price?: number;
  notes?: string;
  transaction_ref?: string;
  auto_confirm?: boolean;
  discount_type?: 'none' | 'percent' | 'fixed';
  discount_value?: number;
  discount_amount?: number;
  warranty_months?: 3 | 6 | 9 | 12;
  warranty_terms_days?: number;
}

export interface CreateIntakeDTO {
  name: string;
  phone: string;
  category: string;
  device: string;
  serial?: string;
  issue: string;
  accessories?: string;
  branch: string;
  branchId?: number | string;
  branchName?: string;
  checks: IntakeCheckItem[];
  photos?: DevicePhoto[];
  appearance?: string;
  testNote?: string;
  price?: number;
  priceNote?: string;
  consent?: boolean;
  intake_batch_code?: string;
  order_type?: 'in_store' | 'cod' | 'warranty';
  orderType?: 'in_store' | 'cod' | 'warranty';
  shipping_address?: string | null;
  shippingAddress?: string | null;
  created_by_user_id?: number | string;
}

export interface UpdateOrderDTO {
  customer_name?: string;
  customer_phone?: string;
  device_model_id?: number;
  serial_number?: string | null;
  issue_description?: string;
  accessories?: string | null;
  appearance_notes?: string | null;
  test_note?: string | null;
  price_note?: string | null;
  repair_note?: string | null;
  parts_used_summary?: string | null;
  estimated_price?: number;
  total_price?: number;
  initial_price?: number;
  order_type?: 'in_store' | 'cod' | 'warranty';
  shipping_address?: string | null;
  status?: string;
  branch_id?: number | string;
  technician_id?: number | null;
  warranty_terms_days?: number;
  [key: string]: any;
}

export interface UpdateOrderQuoteDTO {
  orderId: string;
  amount: number;
  warranty?: string;
  note: string;
}

export interface CompleteTechOrderDTO {
  orderId: string;
  repairNote: string;
  partsUsed?: string;
  finalCheck?: string;
}
