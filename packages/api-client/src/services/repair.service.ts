import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  CreateIntakeDTO,
  UpdateOrderQuoteDTO,
  CompleteTechOrderDTO,
  AddAdditionalServiceDTO,
  SimpleCheckoutPayload,
  OrderDateFilter,
  HandoverPayload,
} from '@podscare/types';

export class RepairService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getRepairs(params?: {
    search?: string;
    status?: string;
    role?: string;
    branch_id?: string | number;
    order_type?: 'in_store' | 'cod' | 'all' | string;
    date_filter?: OrderDateFilter;
    q?: string;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/orders', {
      params: {
        ...params,
        q: params?.q || params?.search,
      },
    });
  }

  async getOrders(params?: any): Promise<any> {
    return this.getRepairs(params);
  }

  async getRepairById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/orders/${id}`);
  }

  async createIntake(dto: CreateIntakeDTO | Record<string, any>): Promise<any> {
    return this.http.post('/api/v1/orders', dto);
  }

  async update(id: string | number, payload: Record<string, any>): Promise<any> {
    return this.http.put(`/api/v1/orders/${id}`, payload);
  }

  async adminUpdate(id: string | number, payload: Record<string, any>): Promise<any> {
    return this.update(id, payload);
  }

  async adminUpdateOrder(id: string | number, payload: Record<string, any>): Promise<any> {
    return this.update(id, payload);
  }

  async delete(id: string | number): Promise<any> {
    return this.http.delete(`/api/v1/orders/${id}`);
  }

  async deleteOrder(id: string | number): Promise<any> {
    return this.delete(id);
  }

  async simpleCheckout(
    id: string | number,
    payload: SimpleCheckoutPayload | {
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
  ): Promise<any> {
    return this.http.post('/api/v1/payments', {
      repair_order_id: id,
      auto_confirm: true,
      ...payload,
    });
  }

  async transition(
    id: string | number,
    payload: { transition: string; [key: string]: any }
  ): Promise<any> {
    return this.http.post(`/api/v1/orders/${id}/transition`, payload);
  }

  async updatePartsNote(
    id: string | number,
    data: { parts_needed?: string; repair_note?: string; parts_note?: string }
  ): Promise<any> {
    return this.http.patch(`/api/v1/orders/${id}/parts-note`, data);
  }

  async updateStatus(
    id: string | number,
    status: string,
    extraOrType?: string | Record<string, any>
  ): Promise<any> {
    const payload =
      typeof extraOrType === 'object' && extraOrType !== null
        ? { transition: status, ...extraOrType }
        : { transition: status, statusType: extraOrType };
    return this.transition(id, payload);
  }

  async updateQuote(
    dto: UpdateOrderQuoteDTO | { orderId: string | number; amount: number; warranty?: string; note: string }
  ): Promise<any> {
    return this.http.post('/api/v1/quotes', dto);
  }

  async acceptOrder(id: string | number, techName?: string): Promise<any> {
    return this.transition(id, { transition: 'assigned', techName });
  }

  async startRepair(id: string | number): Promise<any> {
    return this.transition(id, { transition: 'in_repair' });
  }

  async completeTechOrder(
    dto: CompleteTechOrderDTO | { orderId: string | number; repairNote: string; partsUsed?: string; finalCheck?: string }
  ): Promise<any> {
    return this.transition(dto.orderId, {
      transition: 'waiting_qc',
      repair_note: dto.repairNote,
      parts_used: dto.partsUsed,
      final_check: dto.finalCheck,
    });
  }

  async approveByCustomer(id: string | number): Promise<any> {
    return this.transition(id, { transition: 'waiting_tech' });
  }

  async handover(id: string | number): Promise<any> {
    return this.transition(id, { transition: 'completed' });
  }

  async handoverOrder(id: string | number, payload: HandoverPayload): Promise<any> {
    return this.http.post(`/api/v1/orders/${id}/handover`, payload);
  }

  async trackOrder(code: string | number, phone?: string): Promise<any> {
    return this.http.get(`/api/v1/tracking/${encodeURIComponent(String(code))}`, {
      params: phone ? { phone } : undefined,
    });
  }

  async storeChecklist(id: string | number, payload: Record<string, any>): Promise<any> {
    return this.http.post(`/api/v1/orders/${id}/checklists`, payload);
  }

  async uploadPhoto(
    id: string | number,
    payload: FormData | { photo_url: string; photo_type?: string; caption?: string }
  ): Promise<any> {
    return this.http.post(`/api/v1/orders/${id}/photos`, payload);
  }

  async addAdditionalService(
    orderId: string | number,
    data: AddAdditionalServiceDTO | { name: string; price: number; service_id?: number | null; note?: string | null }
  ): Promise<any> {
    return this.http.post(`/api/v1/orders/${orderId}/additional-services`, data);
  }

  async deleteAdditionalService(
    orderId: string | number,
    serviceId: string
  ): Promise<any> {
    return this.http.delete(`/api/v1/orders/${orderId}/additional-services/${serviceId}`);
  }

  async removeAdditionalService(
    orderId: string | number,
    serviceId: string
  ): Promise<any> {
    return this.deleteAdditionalService(orderId, serviceId);
  }
}

export const repairService = new RepairService();
