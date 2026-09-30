export interface QuickTransitionAction {
  label: string;
  targetStatus: string;
  statusType: 'new' | 'wait' | 'progress' | 'ready' | 'danger' | 'gray';
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  icon?: string;
}

/**
 * Chuẩn hóa 2 chiều trạng thái đơn hàng (từ tiếng Việt hoặc alias sang mã snake_case chuẩn).
 */
export function normalizeStatusCode(status?: string | null): string {
  if (!status) return 'inspecting';
  const clean = status.trim();
  const map: Record<string, string> = {
    // Nhãn tiếng Việt hiển thị
    'Tiếp nhận mới': 'inspecting',
    'Đang tiếp nhận & kiểm tra': 'inspecting',
    'Đang kiểm tra': 'inspecting',
    'Chờ khách duyệt': 'waiting_approval',
    'Chờ khách duyệt báo giá': 'waiting_approval',
    'Khách từ chối': 'rejected',
    'Khách từ chối sửa chữa': 'rejected',
    'Từ chối sửa': 'rejected',
    'Chờ kỹ thuật': 'waiting_tech',
    'Chờ kỹ thuật tiếp nhận': 'waiting_tech',
    'Đã nhận đơn': 'assigned',
    'Kỹ thuật đã nhận đơn': 'assigned',
    'Đang sửa': 'in_repair',
    'Đang sửa chữa': 'in_repair',
    'Chờ linh kiện': 'waiting_parts',
    'Tạm dừng chờ linh kiện': 'waiting_parts',
    'Cần sửa lại': 'rework_needed',
    'QC yêu cầu làm lại': 'rework_needed',
    'Chờ QC': 'waiting_qc',
    'Chờ kiểm định chất lượng (QC)': 'waiting_qc',
    'Chờ kiểm định chất lượng': 'waiting_qc',
    'Sẵn sàng trả': 'ready_for_return',
    'Sẵn sàng giao trả khách': 'ready_for_return',
    'Chờ khách nhận': 'waiting_pickup',
    'Chờ khách đến nhận máy': 'waiting_pickup',
    'Hoàn tất': 'completed',
    'Hoàn tất đơn hàng': 'completed',
    'Đã hủy': 'cancelled',
    'Đã hủy đơn': 'cancelled',

    // snake_case codes & aliases
    inspecting: 'inspecting',
    waiting_approval: 'waiting_approval',
    quote_pending: 'waiting_approval',
    rejected: 'rejected',
    waiting_tech: 'waiting_tech',
    assigned: 'assigned',
    in_repair: 'in_repair',
    waiting_parts: 'waiting_parts',
    rework_needed: 'rework_needed',
    waiting_qc: 'waiting_qc',
    qc_pending: 'waiting_qc',
    qc_inspecting: 'waiting_qc',
    ready_for_return: 'ready_for_return',
    waiting_pickup: 'waiting_pickup',
    completed: 'completed',
    cancelled: 'cancelled',
  };

  return map[clean] || clean;
}

/**
 * Lấy nhãn tiếng Việt chuẩn tương ứng với mã trạng thái snake_case hoặc alias.
 */
export function getStatusCodeLabel(codeOrLabel?: string | null): string {
  if (!codeOrLabel) return 'Tiếp nhận mới';
  const code = normalizeStatusCode(codeOrLabel);
  const labels: Record<string, string> = {
    inspecting: 'Tiếp nhận mới',
    waiting_approval: 'Chờ khách duyệt',
    rejected: 'Khách từ chối',
    waiting_tech: 'Chờ kỹ thuật',
    assigned: 'Đã nhận đơn',
    in_repair: 'Đang sửa',
    waiting_parts: 'Chờ linh kiện',
    rework_needed: 'Cần sửa lại',
    waiting_qc: 'Chờ QC',
    ready_for_return: 'Sẵn sàng trả',
    waiting_pickup: 'Chờ khách nhận',
    completed: 'Hoàn tất',
    cancelled: 'Đã hủy',
  };
  return labels[code] || codeOrLabel;
}

/**
 * Ma trận hành động chuyển trạng thái nhanh FSM_QUICK_ACTIONS theo quy trình chuẩn PodsCare:
 * - inspecting: ['Chờ khách duyệt', 'Chờ kỹ thuật', 'Đã hủy']
 * - waiting_approval: ['Chờ kỹ thuật', 'Khách từ chối', 'Đã hủy']
 * - waiting_tech: ['Đang sửa']
 * - in_repair: ['Chờ linh kiện', 'Chờ QC']
 * - waiting_parts: ['Đang sửa']
 * - rework_needed: ['Đang sửa']
 * - waiting_qc: ['Sẵn sàng trả'] (tuyệt đối KHÔNG có nút 'Hoàn tất')
 * - ready_for_return: ['Chờ khách nhận', 'Hoàn tất']
 * - waiting_pickup: ['Hoàn tất']
 * - completed: []
 */
export const FSM_QUICK_ACTIONS: Record<string, QuickTransitionAction[]> = {
  inspecting: [
    { label: 'Chờ khách duyệt', targetStatus: 'waiting_approval', statusType: 'wait', variant: 'secondary' },
    { label: 'Chờ kỹ thuật', targetStatus: 'waiting_tech', statusType: 'new', variant: 'secondary' },
    { label: 'Đã hủy', targetStatus: 'cancelled', statusType: 'gray', variant: 'danger' },
  ],
  waiting_approval: [
    { label: 'Chờ kỹ thuật', targetStatus: 'waiting_tech', statusType: 'new', variant: 'secondary' },
    { label: 'Khách từ chối', targetStatus: 'rejected', statusType: 'danger', variant: 'danger' },
    { label: 'Đã hủy', targetStatus: 'cancelled', statusType: 'gray', variant: 'danger' },
  ],
  waiting_tech: [
    { label: 'Đang sửa', targetStatus: 'in_repair', statusType: 'progress', variant: 'primary' },
  ],
  assigned: [
    { label: 'Đang sửa', targetStatus: 'in_repair', statusType: 'progress', variant: 'primary' },
  ],
  in_repair: [
    { label: 'Chờ linh kiện', targetStatus: 'waiting_parts', statusType: 'wait', variant: 'secondary' },
    { label: 'Chờ QC', targetStatus: 'waiting_qc', statusType: 'ready', variant: 'secondary' },
  ],
  waiting_parts: [
    { label: 'Đang sửa', targetStatus: 'in_repair', statusType: 'progress', variant: 'secondary' },
  ],
  rework_needed: [
    { label: 'Đang sửa', targetStatus: 'in_repair', statusType: 'progress', variant: 'secondary' },
  ],
  waiting_qc: [
    { label: 'Sẵn sàng trả', targetStatus: 'ready_for_return', statusType: 'ready', variant: 'secondary' },
  ],
  ready_for_return: [
    { label: 'Chờ khách nhận', targetStatus: 'waiting_pickup', statusType: 'wait', variant: 'secondary' },
    { label: 'Hoàn tất', targetStatus: 'completed', statusType: 'gray', variant: 'secondary' },
  ],
  waiting_pickup: [
    { label: 'Hoàn tất', targetStatus: 'completed', statusType: 'gray', variant: 'secondary' },
  ],
  completed: [],
  rejected: [
    { label: 'Đã hủy', targetStatus: 'cancelled', statusType: 'gray', variant: 'danger' },
  ],
  cancelled: [],
};

// Aliases cho các nhãn tiếng Việt để hỗ trợ tra cứu trực tiếp
FSM_QUICK_ACTIONS['Tiếp nhận mới'] = FSM_QUICK_ACTIONS.inspecting;
FSM_QUICK_ACTIONS['Đang tiếp nhận & kiểm tra'] = FSM_QUICK_ACTIONS.inspecting;
FSM_QUICK_ACTIONS['Đang kiểm tra'] = FSM_QUICK_ACTIONS.inspecting;
FSM_QUICK_ACTIONS['Chờ khách duyệt'] = FSM_QUICK_ACTIONS.waiting_approval;
FSM_QUICK_ACTIONS['Khách từ chối'] = FSM_QUICK_ACTIONS.rejected;
FSM_QUICK_ACTIONS['Từ chối sửa'] = FSM_QUICK_ACTIONS.rejected;
FSM_QUICK_ACTIONS['Chờ kỹ thuật'] = FSM_QUICK_ACTIONS.waiting_tech;
FSM_QUICK_ACTIONS['Đã nhận đơn'] = FSM_QUICK_ACTIONS.assigned;
FSM_QUICK_ACTIONS['Đang sửa'] = FSM_QUICK_ACTIONS.in_repair;
FSM_QUICK_ACTIONS['Chờ linh kiện'] = FSM_QUICK_ACTIONS.waiting_parts;
FSM_QUICK_ACTIONS['Cần sửa lại'] = FSM_QUICK_ACTIONS.rework_needed;
FSM_QUICK_ACTIONS['Chờ QC'] = FSM_QUICK_ACTIONS.waiting_qc;
FSM_QUICK_ACTIONS['Sẵn sàng trả'] = FSM_QUICK_ACTIONS.ready_for_return;
FSM_QUICK_ACTIONS['Chờ khách nhận'] = FSM_QUICK_ACTIONS.waiting_pickup;
FSM_QUICK_ACTIONS['Hoàn tất'] = FSM_QUICK_ACTIONS.completed;
FSM_QUICK_ACTIONS['Đã hủy'] = FSM_QUICK_ACTIONS.cancelled;

/**
 * Trả về danh sách hành động hợp lệ cho trạng thái chỉ định.
 */
export function getQuickActionsForStatus(status?: string | null): QuickTransitionAction[] {
  if (!status) return [];
  const normalized = normalizeStatusCode(status);
  return FSM_QUICK_ACTIONS[normalized] || FSM_QUICK_ACTIONS[status] || [];
}
