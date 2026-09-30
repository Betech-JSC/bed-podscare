import { HttpClient, defaultHttpClient } from '../http-client';
import type { QCInspectionDTO } from '@podscare/types';

export class QCService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getPendingQCOrders(params?: Record<string, any>): Promise<any> {
    return this.http.get('/api/v1/qc', { params });
  }

  async submitQC(dto: QCInspectionDTO | Record<string, any>): Promise<any> {
    return this.http.post('/api/v1/qc', dto);
  }

  async createInspection(dto: QCInspectionDTO | Record<string, any>): Promise<any> {
    return this.submitQC(dto);
  }
}

export const qcService = new QCService();
