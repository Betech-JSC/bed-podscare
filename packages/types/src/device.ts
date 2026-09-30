export type DeviceCategory = 'AirPods' | 'Apple Watch' | 'Apple Pencil' | 'MacBook' | 'iPad' | string;

export interface DeviceProfile {
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
  originalName?: string;
  name: string;
  category: string;
  maker?: string;
  model?: string;
  checks: string[];
}
