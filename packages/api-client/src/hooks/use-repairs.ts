import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairService } from '../services/repair.service';
import type {
  CreateIntakeDTO,
  UpdateOrderQuoteDTO,
  CompleteTechOrderDTO,
} from '@podscare/types';

export const REPAIRS_QUERY_KEY = ['repairs'];

export function useRepairs(filters?: { search?: string; status?: string; role?: string }) {
  return useQuery({
    queryKey: [...REPAIRS_QUERY_KEY, filters],
    queryFn: () => repairService.getRepairs(filters),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useRepairDetail(id?: string) {
  return useQuery({
    queryKey: ['repair', id],
    queryFn: () => (id ? repairService.getRepairById(id) : null),
    enabled: Boolean(id),
  });
}

export function useTrackOrder(id?: string, phone?: string) {
  return useQuery({
    queryKey: ['track', id, phone],
    queryFn: () => (id ? repairService.trackOrder(id, phone) : null),
    enabled: Boolean(id),
    retry: 1,
  });
}

export function useCreateIntakeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIntakeDTO) => repairService.createIntake(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPAIRS_QUERY_KEY });
    },
  });
}

export function useUpdateRepairStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, statusType }: { id: string; status: string; statusType?: string }) =>
      repairService.updateStatus(id, status, statusType),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: REPAIRS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['repair', vars.id] });
    },
  });
}

export function useSaveQuoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateOrderQuoteDTO) => repairService.updateQuote(dto),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: REPAIRS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['repair', vars.orderId] });
    },
  });
}

export function useCompleteTechMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CompleteTechOrderDTO) => repairService.completeTechOrder(dto),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: REPAIRS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['repair', vars.orderId] });
    },
  });
}
