import { HttpClient, defaultHttpClient } from '../http-client';

export interface ShipmentItem {
  id: number | string;
  shipment_code: string;
  repair_order_id: number;
  partner_id?: number | null;
  delivery_method: 'store_pickup' | 'home_delivery' | string;
  carrier_name: string;
  tracking_code?: string;
  delivery_address?: string;
  scheduled_at?: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'cancelled' | string;
  notes?: string;
  delivered_at?: string;
  created_at?: string;
  repair_order?: {
    id: number;
    order_code: string;
    customer?: {
      id: number;
      name: string;
      phone: string;
    };
  };
  partner?: {
    id: number;
    name: string;
    code: string;
  };
  proofs?: ShipmentProofItem[];
}

export interface ShipmentProofItem {
  id: number;
  shipment_id: number;
  photo_url: string;
  caption?: string;
  created_at?: string;
}

export interface CreateShipmentDTO {
  repair_order_id: number | string;
  partner_id?: number | string | null;
  delivery_method: 'store_pickup' | 'home_delivery' | string;
  carrier_name: string;
  tracking_code?: string;
  delivery_address?: string;
  scheduled_at?: string;
  notes?: string;
}

export interface UpdateShipmentStatusDTO {
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | string;
  notes?: string;
  proof_photo_url?: string;
  proof_caption?: string;
}

export interface UploadProofDTO {
  photo_url: string;
  caption?: string;
}

export class ShipmentService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getShipments(params?: {
    status?: string;
    delivery_method?: string;
    per_page?: number;
    page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/shipments', { params });
  }

  async createShipment(dto: CreateShipmentDTO): Promise<any> {
    return this.http.post('/api/v1/shipments', dto);
  }

  async updateStatus(
    id: number | string,
    payload: string | UpdateShipmentStatusDTO
  ): Promise<any> {
    const body = typeof payload === 'string' ? { status: payload } : payload;
    return this.http.put(`/api/v1/shipments/${id}/status`, body);
  }

  async uploadProof(
    id: number | string,
    payload: UploadProofDTO | FormData
  ): Promise<any> {
    return this.http.post(`/api/v1/shipments/${id}/proofs`, payload);
  }
}

export const shipmentService = new ShipmentService();
