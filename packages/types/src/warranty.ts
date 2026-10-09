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
