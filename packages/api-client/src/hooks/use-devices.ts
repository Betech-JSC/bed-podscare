import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deviceService } from '../services/device.service';
import type { SaveDeviceCategoryDTO, SaveDeviceProfileDTO } from '@podscare/types';

export const DEVICE_PROFILES_KEY = ['device_profiles'];
export const DEVICE_CATEGORIES_KEY = ['device_categories'];

export function useDeviceProfiles() {
  return useQuery({
    queryKey: DEVICE_PROFILES_KEY,
    queryFn: () => deviceService.getProfiles(),
    staleTime: 1000 * 60 * 5, // 5 mins
  });
}

export function useDeviceCategories() {
  return useQuery({
    queryKey: DEVICE_CATEGORIES_KEY,
    queryFn: () => deviceService.getCategories(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSaveDeviceProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveDeviceProfileDTO) => deviceService.saveProfile(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICE_PROFILES_KEY });
    },
  });
}

export function useSaveDeviceCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveDeviceCategoryDTO) => deviceService.saveCategory(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICE_CATEGORIES_KEY });
      queryClient.invalidateQueries({ queryKey: DEVICE_PROFILES_KEY });
    },
  });
}
