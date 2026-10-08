export type OrderStatusType = 'wait' | 'progress' | 'ready' | 'danger' | 'new' | 'gray';

export type OrderDateFilter = 'today' | 'yesterday' | '7_days' | '30_days' | 'all';

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
  order_type?: 'in_store' | 'cod';
  orderType?: 'in_store' | 'cod';
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
  testNote?: string;
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
  order_type?: 'in_store' | 'cod';
  orderType?: 'in_store' | 'cod';
  created_by_user_id?: number | string;
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
