import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  WorkShift,
  CurrentShiftSnapshot,
  CurrentShiftResponse,
  AggregatedShiftSummaryItem,
  ShiftFilterParams,
  OpenShiftDTO,
  CloseShiftDTO,
  ShiftReconciliationSummary,
  ShiftPrintData,
  ApiResponse,
  PaginatedResponse,
} from '@podscare/types';

export type { CurrentShiftSnapshot, CurrentShiftResponse, AggregatedShiftSummaryItem };

export class ShiftService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy danh sách ca làm việc theo bộ lọc (chi nhánh, trạng thái, ngày).
   */
  async getShifts(
    params?: ShiftFilterParams
  ): Promise<ApiResponse<PaginatedResponse<WorkShift>>> {
    return this.http.get('/api/v1/shifts', { params: params as Record<string, string | number | boolean | undefined> });
  }

  /**
   * Lấy ca đang mở của chi nhánh hiện tại (hoặc gộp toàn hệ thống khi branchId = 'all') kèm snapshot vận hành và két tiền.
   */
  async getCurrentShift(branchId: number | string = 'all'): Promise<CurrentShiftResponse> {
    return this.http.get('/api/v1/shifts/current', {
      params: branchId !== undefined ? { branch_id: branchId } : { branch_id: 'all' },
    });
  }

  /**
   * Mở ca làm việc mới.
   */
  async openShift(dto: OpenShiftDTO): Promise<ApiResponse<WorkShift>> {
    return this.http.post('/api/v1/shifts/open', dto);
  }

  /**
   * Đóng ca làm việc và đối soát tiền két thực tế.
   */
  async closeShift(
    shiftId: number | string,
    dto: CloseShiftDTO
  ): Promise<ApiResponse<WorkShift>> {
    return this.http.post(`/api/v1/shifts/${shiftId}/close`, dto);
  }

  /**
   * Xem chi tiết một ca làm việc.
   */
  async getShift(shiftId: number | string): Promise<ApiResponse<WorkShift>> {
    return this.http.get(`/api/v1/shifts/${shiftId}`);
  }

  /**
   * Lấy dữ liệu biên bản đối soát ca.
   */
  async getShiftSummary(
    shiftId: number | string
  ): Promise<ApiResponse<ShiftReconciliationSummary>> {
    return this.http.get(`/api/v1/shifts/${shiftId}/summary`);
  }

  /**
   * Lấy dữ liệu in phiếu chốt ca K80 / A4.
   */
  async getShiftPrintData(
    shiftId: number | string
  ): Promise<ApiResponse<ShiftPrintData>> {
    return this.http.get(`/api/v1/shifts/${shiftId}/print`);
  }
}

export const shiftService = new ShiftService();
