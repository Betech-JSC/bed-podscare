export interface DeviceRepairHistoryItem {
  id: number;
  order_code: string;
  status: string;
  order_type: 'in_store' | 'cod' | string;
  serial_number?: string | null;
  device_model_name?: string | null;
  device_model_id?: number | null;
  created_at?: string;
  handed_over_at?: string | null;
  total_price: number;
  total_price_formatted: string;
  issue_description?: string | null;
  appearance_notes?: string | null;
  repair_note?: string | null;
  technician_name: string;
  technician_id?: number | null;
  parts_used_summary?: string | null;
  additional_services: Array<{
    id?: string;
    name: string;
    price: number;
    service_id?: number | null;
    note?: string | null;
  }>;
  warranty_terms_days?: number | null;
  qc_result?: {
    result?: 'pass' | 'fail' | string | null;
    notes?: string | null;
    passed?: boolean;
    inspector?: string | null;
    checked_at?: string | null;
  } | null;
  branch_name?: string | null;
  warranties?: Array<{
    id: number;
    warranty_code: string;
    status: string;
    end_date?: string | null;
    duration_days?: number;
  }>;
}

export interface DeviceHistoryResponse {
  customer?: {
    id: number;
    name: string;
    phone: string;
    email?: string | null;
  } | null;
  total_repairs: number;
  orders: DeviceRepairHistoryItem[];
}

export interface WarrantyItem {
  id: number;
  warranty_code: string;
  repair_order_id: number;
  customer_id: number;
  device_model_id: number;
  serial_number?: string;
  warranty_period_days: number;
  duration_days?: number;
  starts_at: string;
  start_date?: string;
  expires_at: string;
  end_date?: string;
  status: 'active' | 'expired' | 'voided' | 'revoked' | string;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  terms?: string;
  notes?: string;
  created_at?: string;
  repair_order?: {
    id: number;
    order_code: string;
    customer?: {
      id: number;
      name: string;
      phone: string;
    };
    device_model?: {
      id: number;
      name: string;
    };
  };
  customer?: {
    id: number;
    name: string;
    phone: string;
  };
  device_model?: {
    id: number;
    name: string;
    category?: string;
  };
  claims?: WarrantyClaimItem[];
}

export interface WarrantyClaimItem {
  id: number;
  warranty_id: number;
  claim_code: string;
  issue_description: string;
  resolution_mode: 'store_check' | 'send_tech' | 'replace_part' | 'rejected' | string;
  status: 'received' | 'in_progress' | 'resolved' | 'rejected' | string;
  rework_order_id?: number | null;
  received_by_user_id?: number | null;
  notes?: string | null;
  created_at?: string;
  warranty?: WarrantyItem;
  rework_order?: {
    id: number;
    order_code: string;
    status: string;
  } | null;
  reworkOrder?: {
    id: number;
    order_code: string;
    status: string;
  } | null;
  received_by_user?: {
    id: number;
    name: string;
  } | null;
}

export interface CreateWarrantyClaimDTO {
  warranty_id: number | string;
  issue_description: string;
  resolution_mode?: 'store_check' | 'send_tech' | 'replace_part' | 'rejected' | string;
  notes?: string;
}
