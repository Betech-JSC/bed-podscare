'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@podscare/ui';
import type { UserRole, UserProfile, RepairOrder, DeviceProfile } from '@podscare/types';
import { repairService, branchService, deviceService } from '@podscare/api-client';
import { NotificationProvider } from './providers/NotificationProvider';

export * from './providers/NotificationProvider';

export interface BranchItem {
  id: string | number;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
}

interface PodsCareContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentUser: UserProfile;
  branch: string;
  branchId: string | number;
  setBranch: (branch: string, branchId?: string | number) => void;
  branches: BranchItem[];
  fetchBranches: () => Promise<void>;
  orders: RepairOrder[];
  addOrder: (order: RepairOrder) => void;
  updateOrder: (order: RepairOrder) => void;
  refreshOrders: (targetBranchId?: string | number) => Promise<void>;
  invalidateOrders: () => Promise<void>;
  queryClient: QueryClient;
  deviceProfiles: DeviceProfile[];
  fetchDeviceProfiles: () => Promise<void>;
  categories: string[];
  addCategory: (name: string) => void;
  addOrUpdateProfile: (profile: DeviceProfile) => void;
  token: string | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (data: { token: string; user: any }) => void;
  logout: () => void;
}

const PodsCareContext = createContext<PodsCareContextType | null>(null);

export const usePodsCare = () => {
  const context = useContext(PodsCareContext);
  if (!context) {
    throw new Error('usePodsCare must be used within PodsCareProvider');
  }
  return context;
};

export const useInvalidateOrders = () => {
  const { invalidateOrders } = usePodsCare();
  return invalidateOrders;
};

export const invalidateOrdersQuery = async (client: QueryClient) => {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['orders'] }),
    client.invalidateQueries({ queryKey: ['repairs'] }),
  ]);
};

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 2, // 2 phút
            gcTime: 1000 * 60 * 10, // 10 phút
            retry: 1, // thử lại 1 lần nếu gặp lỗi kết nối
            refetchOnWindowFocus: false, // tránh refetch đột ngột khi chuyển tab trình duyệt
          },
        },
      })
  );

  const [role, setRoleState] = useState<UserRole>('admin');
  const [branch, setBranchState] = useState('PodsCare · Quận 1');
  const [branchId, setBranchIdState] = useState<string | number>(1);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [categories, setCategories] = useState<string[]>([
    'AirPods',
    'Apple Watch',
    'Apple Pencil',
    'MacBook',
    'iPad',
  ]);
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfile[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Nạp danh sách chi nhánh từ API và đồng bộ localStorage
  const fetchBranches = useCallback(async () => {
    try {
      const res = await branchService.getBranches();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list) && list.length > 0) {
        const allBranch: BranchItem = {
          id: 'all',
          name: 'Tất cả chi nhánh',
          code: 'ALL',
          address: 'Toàn hệ thống PodsCare',
        };
        const mapped: BranchItem[] = [
          allBranch,
          ...list.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code || '',
            address: b.address,
            phone: b.phone,
            is_active: b.is_active,
          })),
        ];
        setBranches(mapped);
        try {
          localStorage.setItem('podscare_branches', JSON.stringify(mapped));
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('Could not fetch branches from API:', e);
    }
  }, []);

  // Nạp danh mục thiết bị từ API và đồng bộ localStorage
  const fetchDeviceProfiles = useCallback(async () => {
    try {
      const res = await deviceService.getDevices();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list) && list.length > 0) {
        const mapped: DeviceProfile[] = list.map((d: any) => ({
          name: d.name,
          category: d.category || 'AirPods',
          maker: 'Apple',
          model: d.model_code || '',
          icon:
            d.category === 'Apple Watch'
              ? 'watch'
              : d.category === 'Apple Pencil'
              ? 'pencil'
              : d.category === 'MacBook' || d.category === 'iPad'
              ? 'device'
              : 'headphones',
          checks: [
            'Kết nối Bluetooth',
            'Âm thanh tai trái',
            'Âm thanh tai phải',
            'Microphone',
            'Pin & thời lượng sử dụng',
            'Hộp sạc / nhận sạc',
            'Chống ồn ANC',
            'Xuyên âm',
            'Cảm ứng / thao tác',
          ],
        }));
        setDeviceProfiles(mapped);
        try {
          localStorage.setItem('podscare_device_profiles', JSON.stringify(mapped));
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('Could not fetch device profiles from API:', e);
    }
  }, []);

  // Sync auth, role, branch and cached data from localStorage on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('podscare_token');
      const savedUserStr = localStorage.getItem('podscare_user');
      const savedRole = localStorage.getItem('podscare_role') as UserRole;
      const savedBranch = localStorage.getItem('podscare_branch');
      const savedBranchId = localStorage.getItem('podscare_branch_id');
      const cachedBranches = localStorage.getItem('podscare_branches');
      const cachedProfiles = localStorage.getItem('podscare_device_profiles');

      if (cachedBranches) {
        try {
          const parsed = JSON.parse(cachedBranches);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBranches(parsed);
          }
        } catch {
          // ignore
        }
      }

      if (cachedProfiles) {
        try {
          const parsed = JSON.parse(cachedProfiles);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDeviceProfiles(parsed);
          }
        } catch {
          // ignore
        }
      }

      if (savedBranch) {
        setBranchState(savedBranch);
      }
      if (savedBranchId) {
        setBranchIdState(savedBranchId === 'all' ? 'all' : Number(savedBranchId) || savedBranchId);
      }

      if (savedToken && savedUserStr) {
        const parsedUser = JSON.parse(savedUserStr);
        setToken(savedToken);
        setUserProfile(parsedUser);
        setRoleState(parsedUser.role || savedRole || 'admin');
        setIsAuthenticated(true);
      } else {
        setToken(null);
        setIsAuthenticated(false);
      }
    } catch {
      setToken(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // Kích hoạt nạp chi nhánh và danh mục thiết bị từ API
  useEffect(() => {
    fetchBranches();
    fetchDeviceProfiles();
  }, [fetchBranches, fetchDeviceProfiles]);

  const fetchOrders = useCallback(async (targetBranchId?: string | number) => {
    try {
      const activeBranchId = targetBranchId !== undefined ? targetBranchId : branchId;
      const params: Record<string, any> = { per_page: 50 };
      if (activeBranchId && activeBranchId !== 'all') {
        params.branch_id = activeBranchId;
      }
      const res = await repairService.getRepairs(params);
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list)) {
        const statusMap: Record<string, { label: string; type: any }> = {
          inspecting: { label: 'Đang kiểm tra', type: 'progress' },
          waiting_approval: { label: 'Chờ khách duyệt', type: 'wait' },
          waiting_tech: { label: 'Chờ kỹ thuật', type: 'new' },
          assigned: { label: 'Đã nhận đơn', type: 'wait' },
          in_repair: { label: 'Đang sửa', type: 'progress' },
          waiting_parts: { label: 'Chờ linh kiện', type: 'wait' },
          rework_needed: { label: 'Cần sửa lại', type: 'danger' },
          waiting_qc: { label: 'Chờ QC', type: 'ready' },
          qc_pending: { label: 'Chờ QC', type: 'ready' },
          ready_for_return: { label: 'Sẵn sàng trả', type: 'ready' },
          waiting_pickup: { label: 'Chờ khách nhận', type: 'ready' },
          completed: { label: 'Hoàn tất', type: 'gray' },
          rejected: { label: 'Từ chối sửa', type: 'danger' },
          cancelled: { label: 'Đã hủy', type: 'gray' },
        };
        const mapped: RepairOrder[] = list.map((o: any) => {
          const rawStatus = o.status === 'qc_pending' ? 'waiting_qc' : o.status;
          const mappedStatus = statusMap[rawStatus] || statusMap[o.status] || {
            label: o.status || 'Tiếp nhận mới',
            type: 'wait',
          };
          return {
            id: o.order_code || String(o.id),
            name: o.customer?.name || 'Khách lẻ',
            phone: o.customer?.phone || '',
            deviceCategory: o.device_model?.category || 'AirPods',
            device: o.device_model?.name || 'AirPods',
            serial: o.serial_number || 'Chưa cập nhật',
            issue: o.issue_description || 'Kiểm tra',
            status: mappedStatus.label,
            statusType: mappedStatus.type,
            price: Number(o.total_price) || Number(o.estimated_price) || 0,
            tech: o.technician?.name || 'Chưa phân công',
            date: o.created_at
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
              : 'Hôm nay',
            branch: o.branch?.name || 'Chi nhánh PodsCare',
            branchId: o.branch_id || o.branch?.id || 1,
            branchName: o.branch?.name || 'Chi nhánh PodsCare',
            accessories: o.accessories,
            appearance: o.appearance_notes,
            repairNote: o.repair_note,
            partsUsed: o.parts_used_summary,
            finalCheck: o.final_check_result,
            qcIssue: o.qc_note,
            acceptedAt: o.tech_accepted_at,
            startedAt: o.repair_started_at,
            completedAt: o.repair_completed_at,
            customerApprovedAt: o.customer_approved_at,
            createdAt: o.created_at,
          };
        });

        setOrders(mapped);
      } else {
        setOrders([]);
      }
    } catch (e) {
      console.warn('Could not fetch orders from API:', e);
      setOrders([]);
    }
  }, [branchId]);

  useEffect(() => {
    fetchOrders(branchId);
  }, [branchId, fetchOrders]);

  // Helper tập trung để invalidate React Query cache và làm mới danh sách đơn hàng
  const invalidateOrders = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['repairs'] }),
      ]);
    } catch {
      // ignore
    }
    await fetchOrders(branchId);
  }, [queryClient, fetchOrders, branchId]);

  const setBranch = (newBranchName: string, newBranchId?: string | number) => {
    setBranchState(newBranchName);
    let resolvedId = newBranchId;
    if (resolvedId === undefined || resolvedId === null) {
      const found = branches.find((b) => b.name === newBranchName);
      resolvedId = found ? found.id : 'all';
    }
    setBranchIdState(resolvedId);
    try {
      localStorage.setItem('podscare_branch', newBranchName);
      localStorage.setItem('podscare_branch_id', String(resolvedId));
    } catch {
      // ignore
    }
    fetchOrders(resolvedId);
  };

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('podscare_role', newRole);
    if (userProfile) {
      const updatedProfile = {
        ...userProfile,
        role: newRole,
        roleLabel:
          newRole === 'admin'
            ? 'Quản trị viên'
            : newRole === 'cskh'
            ? 'CSKH Tiếp nhận'
            : 'Kỹ thuật viên',
      };
      setUserProfile(updatedProfile);
      localStorage.setItem('podscare_user', JSON.stringify(updatedProfile));
    }
  };

  const login = (data: { token: string; user: any }) => {
    const rawRole = (data.user.role || 'admin') as string;
    const normRole = (rawRole === 'technician' ? 'tech' : rawRole) as UserRole;
    const branchName = data.user.branch?.name || data.user.branch || 'Quận 1';
    const branchIdVal = data.user.branch_id || data.user.branch?.id || null;

    const profile: UserProfile = {
      id: data.user.id,
      name: data.user.name,
      role: normRole,
      roleLabel:
        normRole === 'admin'
          ? 'Quản trị viên'
          : normRole === 'cskh'
          ? 'CSKH Tiếp nhận'
          : normRole === 'tech'
          ? 'Kỹ thuật viên'
          : normRole === 'qc'
          ? 'Kiểm định QC'
          : 'Nhân viên kho',
      branch: branchName,
      branch_id: branchIdVal,
      initials: (data.user.name || 'ML')
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      email: data.user.email,
      phone: data.user.phone,
      avatar_url: data.user.avatar_url,
    };

    localStorage.setItem('podscare_token', data.token);
    localStorage.setItem('podscare_user', JSON.stringify(profile));
    localStorage.setItem('podscare_role', normRole);

    setToken(data.token);
    setUserProfile(profile);
    setRoleState(normRole);
    setIsAuthenticated(true);

    if (branchName) {
      setBranch(branchName, branchIdVal || undefined);
    }
  };

  const logout = () => {
    localStorage.removeItem('podscare_token');
    localStorage.removeItem('podscare_user');
    localStorage.removeItem('podscare_role');
    setToken(null);
    setUserProfile(null);
    setIsAuthenticated(false);
  };

  const currentUser: UserProfile = userProfile || {
    id: role === 'admin' ? '1' : role === 'cskh' ? '2' : '3',
    name: role === 'admin' ? 'Minh Lê' : role === 'cskh' ? 'Lan Phạm' : 'Tuấn K.',
    role,
    roleLabel: role === 'admin' ? 'Quản trị viên' : role === 'cskh' ? 'CSKH Tiếp nhận' : 'Kỹ thuật viên',
    branch: 'Quận 1',
    initials: role === 'admin' ? 'ML' : role === 'cskh' ? 'LP' : 'TK',
  };

  const addOrder = (order: RepairOrder) => {
    setOrders((prev) => [order, ...prev]);
  };

  const updateOrder = (order: RepairOrder) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
  };

  const addCategory = (name: string) => {
    if (!categories.includes(name)) {
      setCategories((prev) => [...prev, name]);
    }
  };

  const addOrUpdateProfile = (profile: DeviceProfile) => {
    setDeviceProfiles((prev) => {
      const idx = prev.findIndex((p) => p.name === profile.name);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = profile;
        return copy;
      }
      return [...prev, profile];
    });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <PodsCareContext.Provider
        value={{
          role,
          setRole,
          currentUser,
          branch,
          branchId,
          setBranch,
          branches,
          fetchBranches,
          orders,
          addOrder,
          updateOrder,
          refreshOrders: fetchOrders,
          invalidateOrders,
          queryClient,
          deviceProfiles,
          fetchDeviceProfiles,
          categories,
          addCategory,
          addOrUpdateProfile,
          token,
          isAuthenticated,
          isLoadingAuth,
          login,
          logout,
        }}
      >
        <NotificationProvider
          branchId={branchId}
          role={role}
          userId={currentUser?.id}
        >
          <ToastProvider>{children}</ToastProvider>
        </NotificationProvider>
      </PodsCareContext.Provider>
    </QueryClientProvider>
  );
};
