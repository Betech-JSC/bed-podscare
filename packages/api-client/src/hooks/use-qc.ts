import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qcService } from '../services/qc.service';
import { REPAIRS_QUERY_KEY } from './use-repairs';
import type { QCInspectionDTO } from '@podscare/types';

export const QC_PENDING_KEY = ['qc_pending'];

export function useQCPendingOrders() {
  return useQuery({
    queryKey: QC_PENDING_KEY,
    queryFn: () => qcService.getPendingQCOrders(),
    staleTime: 1000 * 30,
  });
}

export function useSubmitQCMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: QCInspectionDTO) => qcService.submitQC(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QC_PENDING_KEY });
      queryClient.invalidateQueries({ queryKey: REPAIRS_QUERY_KEY });
    },
  });
}
