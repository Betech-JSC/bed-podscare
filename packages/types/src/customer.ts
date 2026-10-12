export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  shipping_address?: string;
  source?: string;
  orders: number;
  spent: string | number;
  since: string;
  initials: string;
  note?: string;
}

export interface CreateCustomerDTO {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  shipping_address?: string;
  source?: string;
  note?: string;
}
