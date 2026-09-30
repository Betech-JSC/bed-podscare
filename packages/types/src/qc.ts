export interface QCCheckItem {
  item: string;
  passed: boolean;
  note?: string;
}

export interface QCInspectionDTO {
  orderId: string;
  inspector: string;
  passed: boolean;
  checks: QCCheckItem[];
  qcIssue?: string;
  notes?: string;
}

export interface QCInspectionResult {
  id: string;
  orderId: string;
  inspector: string;
  passed: boolean;
  checks: QCCheckItem[];
  qcIssue?: string;
  notes?: string;
  createdAt: string;
}
