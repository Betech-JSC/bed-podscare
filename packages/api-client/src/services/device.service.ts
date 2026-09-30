import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  DeviceProfile,
  SaveDeviceCategoryDTO,
  SaveDeviceProfileDTO,
} from '@podscare/types';

export class DeviceService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getDevices(): Promise<any> {
    return this.http.get('/api/v1/devices');
  }

  async getDeviceById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/devices/${id}`);
  }

  async getChecklistTemplate(): Promise<any> {
    return this.http.get('/api/v1/devices/checklist-template');
  }

  async getCategories(): Promise<string[]> {
    return this.http.get<string[]>('/api/v1/devices');
  }

  async getProfiles(): Promise<DeviceProfile[]> {
    return this.http.get<DeviceProfile[]>('/api/v1/devices');
  }

  async saveCategory(dto: SaveDeviceCategoryDTO): Promise<{ success: boolean; name: string }> {
    return this.http.post<{ success: boolean; name: string }>('/api/v1/devices/categories', dto);
  }

  async saveProfile(dto: SaveDeviceProfileDTO): Promise<DeviceProfile> {
    return this.http.post<DeviceProfile>('/api/v1/devices/profiles', dto);
  }
}

export const deviceService = new DeviceService();
