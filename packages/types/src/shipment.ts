import type { OrderStatusType } from './order';

export interface Shipment {
  id: string;
  orderId: string;
  method: string;
  carrier: string;
  status: string;
  statusType: OrderStatusType;
  date: string;
  proof: string[];
}
