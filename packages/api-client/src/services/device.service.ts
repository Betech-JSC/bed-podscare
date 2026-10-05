import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  ApiResponse,
  DeviceProfile,
  SaveDeviceCategoryDTO,
  SaveDeviceProfileDTO,
  DeviceModelRecord,
  CreateDeviceDTO,
  UpdateDeviceDTO,
} from '@podscare/types';

export class DeviceService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getDevices(params?: { category?: string; include_inactive?: boolean }): Promise<ApiResponse<DeviceModelRecord[]>> {
    return this.http.get<ApiResponse<DeviceModelRecord[]>>('/api/v1/devices', { params });
  }

  async getDeviceById(id: string | number): Promise<ApiResponse<DeviceModelRecord>> {
    return this.http.get<ApiResponse<DeviceModelRecord>>(`/api/v1/devices/${id}`);
  }

  async getChecklistTemplate(
    params?: { category?: string; device_model_id?: string | number } | string
  ): Promise<any> {
    const queryParams = typeof params === 'string' ? { category: params } : params;
    return this.http.get('/api/v1/devices/checklist-template', { params: queryParams });
  }

  async getCategories(): Promise<ApiResponse<string[]>> {
    return this.http.get<ApiResponse<string[]>>('/api/v1/devices/categories');
  }

  async createCategory(payload: string | SaveDeviceCategoryDTO): Promise<ApiResponse<{ name: string }>> {
    const dto: SaveDeviceCategoryDTO = typeof payload === 'string' ? { name: payload } : payload;
    return this.http.post<ApiResponse<{ name: string }>>('/api/v1/devices/categories', dto);
  }

  async saveCategory(dto: SaveDeviceCategoryDTO): Promise<ApiResponse<{ name: string }>> {
    return this.createCategory(dto);
  }

  async createDevice(payload: CreateDeviceDTO): Promise<ApiResponse<DeviceModelRecord>> {
    return this.http.post<ApiResponse<DeviceModelRecord>>('/api/v1/devices', payload);
  }

  async updateDevice(
    id: number | string,
    payload: UpdateDeviceDTO
  ): Promise<ApiResponse<DeviceModelRecord>> {
    return this.http.put<ApiResponse<DeviceModelRecord>>(`/api/v1/devices/${id}`, payload);
  }

  async deleteDevice(id: number | string): Promise<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`/api/v1/devices/${id}`);
  }

  // Backward compatibility
  async getProfiles(): Promise<DeviceProfile[]> {
    const res = await this.getDevices();
    const list = res?.data || (Array.isArray(res) ? res : []);
    return (list as any[]).map((d: any) => ({
      id: d.id,
      name: d.name,
      category: d.category || 'AirPods',
      maker: d.manufacturer || 'Apple',
      model: d.model_code || '',
      icon:
        d.category === 'Apple Watch'
          ? 'watch'
          : d.category === 'Apple Pencil'
          ? 'pencil'
          : d.category === 'MacBook' || d.category === 'iPad'
          ? 'device'
          : 'headphones',
      checks: Array.isArray(d.checklist_templates)
        ? d.checklist_templates.map((c: any) => c.item_name)
        : [],
    }));
  }

  async saveProfile(dto: SaveDeviceProfileDTO): Promise<DeviceProfile> {
    const payload: CreateDeviceDTO = {
      name: dto.name,
      category: dto.category,
      model_code: dto.model,
      manufacturer: dto.maker || 'Apple',
      checks: dto.checks,
    };
    if (dto.id) {
      await this.updateDevice(dto.id, payload);
    } else {
      await this.createDevice(payload);
    }
    return {
      id: dto.id,
      name: dto.name,
      category: dto.category,
      maker: dto.maker || 'Apple',
      model: dto.model,
      checks: dto.checks,
    };
  }
}

export const deviceService = new DeviceService();
