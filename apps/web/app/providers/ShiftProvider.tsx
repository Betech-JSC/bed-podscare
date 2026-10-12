'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { WorkShift, BranchCashBalance } from '@podscare/types';
import { shiftService, cashbookService } from '@podscare/api-client';
import { usePodsCare } from '../providers';

export interface ShiftContextType {
  currentShift: WorkShift | null;
  cashBalance: BranchCashBalance | null;
  isLoading: boolean;
  refreshShift: () => Promise<void>;
  openShiftModalOpen: boolean;
  setOpenShiftModalOpen: (open: boolean) => void;
  closeShiftModalOpen: boolean;
  setCloseShiftModalOpen: (open: boolean) => void;
  createExpenseModalOpen: boolean;
  setCreateExpenseModalOpen: (open: boolean) => void;
  printModalOpen: boolean;
  setPrintModalOpen: (open: boolean) => void;
  printShiftId: number | string | null;
  openPrintModal: (shiftId: number | string) => void;
  closePrintModal: () => void;
}

const ShiftContext = createContext<ShiftContextType | null>(null);

export const useShift = (): ShiftContextType => {
  const context = useContext(ShiftContext);
  if (!context) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
};

export const ShiftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { branchId, currentUser, isAuthenticated } = usePodsCare();

  const [currentShift, setCurrentShift] = useState<WorkShift | null>(null);
  const [cashBalance, setCashBalance] = useState<BranchCashBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal visibility states
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);
  const [createExpenseModalOpen, setCreateExpenseModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printShiftId, setPrintShiftId] = useState<number | string | null>(null);

  const effectiveBranchId = useMemo(() => {
    if (branchId && branchId !== 'all') {
      return branchId;
    }
    return currentUser?.branch_id || undefined;
  }, [branchId, currentUser?.branch_id]);

  const refreshShift = useCallback(async () => {
    if (!isAuthenticated || !effectiveBranchId) {
      setCurrentShift(null);
      setCashBalance(null);
      return;
    }

    setIsLoading(true);
    try {
      const [shiftRes, balanceRes] = await Promise.allSettled([
        shiftService.getCurrentShift(effectiveBranchId),
        cashbookService.getBranchBalance(effectiveBranchId),
      ]);

      if (shiftRes.status === 'fulfilled' && shiftRes.value?.success) {
        setCurrentShift(shiftRes.value.data || null);
      } else {
        setCurrentShift(null);
      }

      if (balanceRes.status === 'fulfilled' && balanceRes.value?.success) {
        setCashBalance(balanceRes.value.data || null);
      } else {
        setCashBalance(null);
      }
    } catch {
      // Fallback an toàn khi chưa nạp được dữ liệu ca
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, effectiveBranchId]);

  useEffect(() => {
    refreshShift();
  }, [refreshShift]);

  const openPrintModal = useCallback((shiftId: number | string) => {
    setPrintShiftId(shiftId);
    setPrintModalOpen(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setPrintModalOpen(false);
    setPrintShiftId(null);
  }, []);

  const value = useMemo(
    () => ({
      currentShift,
      cashBalance,
      isLoading,
      refreshShift,
      openShiftModalOpen,
      setOpenShiftModalOpen,
      closeShiftModalOpen,
      setCloseShiftModalOpen,
      createExpenseModalOpen,
      setCreateExpenseModalOpen,
      printModalOpen,
      setPrintModalOpen,
      printShiftId,
      openPrintModal,
      closePrintModal,
    }),
    [
      currentShift,
      cashBalance,
      isLoading,
      refreshShift,
      openShiftModalOpen,
      closeShiftModalOpen,
      createExpenseModalOpen,
      printModalOpen,
      printShiftId,
      openPrintModal,
      closePrintModal,
    ]
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
};
