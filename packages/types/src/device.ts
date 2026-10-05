export type DeviceCategory = 'AirPods' | 'Apple Watch' | 'Apple Pencil' | 'MacBook' | 'iPad' | string;

export interface DeviceProfile {
  id?: number;
  name: string;
  category: DeviceCategory;
  maker?: string;
  model?: string;
  icon?: string;
  checks: string[];
}

export interface SaveDeviceCategoryDTO {
  name: string;
}

export interface SaveDeviceProfileDTO {
  id?: number;
  originalName?: string;
  name: string;
  category: string;
  maker?: string;
  model?: string;
  checks: string[];
}

export interface ChecklistTemplateRecord {
  id: number;
  device_model_id?: number | null;
  category: string;
  item_name: string;
  description?: string | null;
  type: string;
  order_index: number;
  is_active: boolean;
}

export interface DeviceModelRecord {
  id: number;
  name: string;
  category: string;
  model_code?: string;
  release_year?: number;
  manufacturer?: string;
  has_anc?: boolean;
  image_url?: string;
  is_active?: boolean;
  checklist_templates?: ChecklistTemplateRecord[];
}

export interface CreateDeviceDTO {
  name: string;
  category: string;
  model_code?: string;
  manufacturer?: string;
  release_year?: number;
  has_anc?: boolean;
  image_url?: string;
  checks: string[];
}

export interface UpdateDeviceDTO {
  name?: string;
  category?: string;
  model_code?: string;
  manufacturer?: string;
  release_year?: number;
  has_anc?: boolean;
  image_url?: string;
  is_active?: boolean;
  checks?: string[];
}
