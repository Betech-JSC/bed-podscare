export interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  stock: number;
  min: number;
  price: string;
  location: string;
  branchId?: number | string;
  branchName?: string;
}

