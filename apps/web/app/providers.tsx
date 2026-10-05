'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ConfirmProvider, useToast } from '@podscare/ui';
import type { UserRole, UserProfile, RepairOrder, DeviceProfile } from '@podscare/types';
import {
  repairService,
  branchService,
  deviceService,
  authService,
  defaultHttpClient,
} from '@podscare/api-client';

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
  currentUser: UserProfile | null;
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
  logout: () => Promise<void> | void;
  isMounted: boolean;
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

export const DEFAULT_MASTER_BRANCHES: BranchItem[] = [
  {
    id: 'all',
    name: 'Tất cả chi nhánh',
    code: 'ALL',
    address: 'Toàn hệ thống FIXO',
  },
];

/**
 * Component tự phục hồi khi gặp ChunkLoadError do deploy mã nguồn mới trên VPS.
 * Lắng nghe toàn cục sự kiện error & unhandledrejection, reload trang 1 lần trong 15s để chống vòng lặp.
 */
export const ChunkLoadErrorHandler: React.FC = () => {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }

    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message =
        'message' in event
          ? event.message
          : (event as PromiseRejectionEvent).reason?.message ||
            String((event as PromiseRejectionEvent).reason || '');

      const isChunkError =
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes('Failed to fetch dynamically imported module');

      if (isChunkError) {
        const lastReload =
          sessionStorage.getItem('podscare_chunk_reload_ts') ||
          sessionStorage.getItem('fixo_last_chunk_reload');
        const now = Date.now();

        // Chỉ tự động reload 1 lần trong vòng 15 giây để chống reload lặp vô tận
        if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
          sessionStorage.setItem('podscare_chunk_reload_ts', String(now));
          sessionStorage.setItem('fixo_last_chunk_reload', String(now));
          window.location.reload();
        } else {
          toast(
            'Hệ thống vừa cập nhật phiên bản mới. Vui lòng bấm Ctrl+F5 hoặc tải lại trình duyệt để tiếp tục sử dụng.',
            'error'
          );
        }
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, [toast]);

  return null;
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

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [role, setRoleState] = useState<UserRole>('admin');
  const [branch, setBranchState] = useState<string>('Tất cả chi nhánh');
  const [branchId, setBranchIdState] = useState<string | number>('all');
  const [branches, setBranches] = useState<BranchItem[]>(DEFAULT_MASTER_BRANCHES);
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
    if (!isAuthenticated || !token) return;
    try {
      const res = await branchService.getBranches();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      const allBranch: BranchItem = {
        id: 'all',
        name: 'Tất cả chi nhánh',
        code: 'ALL',
        address: 'Toàn hệ thống FIXO',
      };
      if (Array.isArray(list) && list.length > 0) {
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
      } else {
        setBranches([allBranch]);
        try {
          localStorage.setItem('podscare_branches', JSON.stringify([allBranch]));
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('Could not fetch branches from API:', e);
    }
  }, [isAuthenticated, token]);

  // Nạp danh mục thiết bị từ API và đồng bộ localStorage
  const fetchDeviceProfiles = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    try {
      const res = await deviceService.getDevices();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      let defaultChecks = [
        'Kết nối Bluetooth',
        'Âm thanh tai trái',
        'Âm thanh tai phải',
        'Microphone',
        'Pin & thời lượng sử dụng',
        'Hộp sạc / nhận sạc',
        'Chống ồn ANC',
        'Xuyên âm',
        'Cảm ứng / thao tác',
      ];
      try {
        const tplRes = await deviceService.getChecklistTemplate();
        const tplData = tplRes?.data || tplRes;
        if (Array.isArray(tplData) && tplData.length > 0) {
          defaultChecks = tplData.map((item: any) => item.item_name || item.name || String(item));
        }
      } catch (err) {
        console.warn('Could not fetch default checklist templates:', err);
      }

      // Nạp dynamic categories từ API
      try {
        const catRes = await deviceService.getCategories();
        const catData = catRes?.data || (Array.isArray(catRes) ? catRes : []);
        if (Array.isArray(catData) && catData.length > 0) {
          setCategories(catData);
          try {
            localStorage.setItem('podscare_categories', JSON.stringify(catData));
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn('Could not fetch categories from API:', err);
      }

      if (Array.isArray(list) && list.length > 0) {
        const mapped: DeviceProfile[] = list.map((d: any) => {
          const modelChecks =
            Array.isArray(d.checklist_templates) && d.checklist_templates.length > 0
              ? d.checklist_templates.map((c: any) => c.item_name || c.name || String(c))
              : defaultChecks;

          return {
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
            checks: modelChecks,
          };
        });
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
  }, [isAuthenticated, token]);

  // Sync auth, role, branch and cached data from localStorage on mount
  useEffect(() => {
    setIsMounted(true);
    try {
      const savedBranch = localStorage.getItem('podscare_branch');
      const savedBranchId = localStorage.getItem('podscare_branch_id');

      const savedToken = localStorage.getItem('podscare_token');
      const savedUserStr = localStorage.getItem('podscare_user');
      const savedRole = localStorage.getItem('podscare_role') as UserRole;
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

      const cachedCategories = localStorage.getItem('podscare_categories');
      if (cachedCategories) {
        try {
          const parsedCats = JSON.parse(cachedCategories);
          if (Array.isArray(parsedCats) && parsedCats.length > 0) {
            setCategories(parsedCats);
          }
        } catch {
          // ignore
        }
      }

      let parsedUser: UserProfile | null = null;
      let effectiveRole: UserRole = savedRole || 'admin';

      if (savedToken && savedUserStr) {
        try {
          parsedUser = JSON.parse(savedUserStr);
          if (parsedUser?.role) {
            effectiveRole = parsedUser.role;
          }
          defaultHttpClient.setToken(savedToken);
          setToken(savedToken);
          setUserProfile(parsedUser);
          setRoleState(effectiveRole);
          setIsAuthenticated(true);
        } catch {
          // ignore
        }
      } else {
        defaultHttpClient.setToken(null);
        setToken(null);
        setIsAuthenticated(false);
      }

      // Bảo vệ hydration: Nếu role !== 'admin' và !== 'super_admin', luôn luôn ép buộc branchId = user.branch_id và branch = user.branch
      if (effectiveRole === 'super_admin') {
        setBranchState('Nền tảng FIXO');
        setBranchIdState('all');
      } else if (effectiveRole !== 'admin') {
        const enforcedBranch = parsedUser?.branch || 'FIXO · Quận 1';
        const enforcedBranchId = parsedUser?.branch_id ?? 1;
        setBranchState(enforcedBranch);
        setBranchIdState(enforcedBranchId);
        try {
          localStorage.setItem('podscare_branch', enforcedBranch);
          localStorage.setItem('podscare_branch_id', String(enforcedBranchId));
        } catch {
          // ignore
        }
      } else {
        if (savedBranch) {
          setBranchState(savedBranch);
        } else {
          setBranchState('Tất cả chi nhánh');
        }
        if (savedBranchId) {
          setBranchIdState(savedBranchId === 'all' ? 'all' : Number(savedBranchId) || savedBranchId);
        } else {
          setBranchIdState('all');
        }
      }
    } catch {
      defaultHttpClient.setToken(null);
      setToken(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // Kích hoạt nạp chi nhánh và danh mục thiết bị từ API khi đã đăng nhập
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchBranches();
      fetchDeviceProfiles();
    }
  }, [isAuthenticated, token, fetchBranches, fetchDeviceProfiles]);

  const fetchOrders = useCallback(async (targetBranchId?: string | number) => {
    if (!isAuthenticated || !token) return;
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
          const mappedChecks = Array.isArray(o.intake_checklists)
            ? o.intake_checklists.map((c: any) => ({
                label: c.item_name,
                status:
                  c.status === 'pass' || c.status === 'passed' || c.status === 'good' || c.status === 'Hoạt động'
                    ? ('Hoạt động' as const)
                    : c.status === 'fail' || c.status === 'failed' || c.status === 'Lỗi'
                    ? ('Lỗi' as const)
                    : ('Không kiểm tra' as const),
              }))
            : Array.isArray(o.checks)
            ? o.checks
            : [];

          const mappedPhotos = Array.isArray(o.intake_photos)
            ? o.intake_photos.map((p: any) => ({
                name: p.photo_type || 'Ảnh thiết bị',
                url: p.photo_url || p.file_path || p.url,
              }))
            : Array.isArray(o.photos)
            ? o.photos.map((p: any) => ({
                name: p.name || p.photo_type || 'Ảnh thiết bị',
                url: p.photo_url || p.file_path || p.url,
              }))
            : [];

          return {
            id: o.order_code || String(o.id),
            name: o.customer?.name || 'Khách lẻ',
            phone: o.customer?.phone || '',
            deviceCategory: o.device_model?.category || 'AirPods',
            device: o.device_model?.name || 'AirPods',
            device_id: o.device_model_id || o.device_model?.id || o.device_id || null,
            device_model_id: o.device_model_id || o.device_model?.id || o.device_id || null,
            serial: o.serial_number || 'Chưa cập nhật',
            issue: o.issue_description || 'Kiểm tra',
            status: mappedStatus.label,
            statusType: mappedStatus.type,
            price: Number(o.total_price) || Number(o.estimated_price) || 0,
            tech: o.technician?.name || 'Chưa phân công',
            technicianId: o.technician_id ?? o.technician?.id ?? null,
            technician_id: o.technician_id ?? o.technician?.id ?? null,
            date: o.created_at
              ? new Intl.DateTimeFormat('vi-VN').format(new Date(o.created_at))
              : 'Hôm nay',
            branch: o.branch?.name || 'Chi nhánh FIXO',
            branchId: o.branch_id || o.branch?.id || 1,
            branchName: o.branch?.name || 'Chi nhánh FIXO',
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
            checks: mappedChecks,
            photos: mappedPhotos,
            createdBy: o.created_by_user?.name || o.createdBy || 'FIXO',
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
  }, [branchId, isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchOrders(branchId);
    }
  }, [branchId, fetchOrders, isAuthenticated, token]);

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
    // Non-Admin không được phép thay đổi chi nhánh (Strict Branch Isolation)
    if (role !== 'admin') {
      return;
    }
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
    if (newRole !== 'admin') {
      const enforcedBranch = userProfile?.branch || 'FIXO · Quận 1';
      const enforcedBranchId = userProfile?.branch_id ?? 1;
      setBranchState(enforcedBranch);
      setBranchIdState(enforcedBranchId);
      try {
        localStorage.setItem('podscare_branch', enforcedBranch);
        localStorage.setItem('podscare_branch_id', String(enforcedBranchId));
      } catch {
        // ignore
      }
      fetchOrders(enforcedBranchId);
    }
  };

  const login = (data: { token: string; user: any }) => {
    const rawRole = (data.user.role || 'admin') as string;
    const normRole = (rawRole === 'technician' ? 'tech' : rawRole) as UserRole;
    const isSuperAdmin = normRole === 'super_admin';
    const isAdmin = normRole === 'admin';
    const userBranchName = isSuperAdmin
      ? 'Nền tảng FIXO'
      : data.user.branch?.name || data.user.branch || 'FIXO · Quận 1';
    const userBranchId = isSuperAdmin
      ? null
      : data.user.branch_id || data.user.branch?.id || 1;

    const profile: UserProfile = {
      id: data.user.id,
      name: data.user.name,
      role: normRole,
      roleLabel:
        normRole === 'super_admin'
          ? 'Quản trị Nền tảng'
          : normRole === 'admin'
          ? 'Quản trị viên'
          : normRole === 'cskh'
          ? 'CSKH Tiếp nhận'
          : normRole === 'tech'
          ? 'Kỹ thuật viên'
          : normRole === 'qc'
          ? 'Kiểm định QC'
          : 'Nhân viên kho',
      branch: userBranchName,
      branch_id: userBranchId,
      initials: (data.user.name || 'SA')
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      email: data.user.email,
      phone: data.user.phone,
      avatar_url: data.user.avatar_url,
      tenant_id: data.user.tenant_id ?? (data.user.tenant?.id || null),
      tenant: data.user.tenant || null,
    };

    localStorage.setItem('podscare_token', data.token);
    localStorage.setItem('podscare_user', JSON.stringify(profile));
    localStorage.setItem('podscare_role', normRole);

    // Đồng bộ session cookie cho Next.js Edge Middleware
    if (typeof document !== 'undefined') {
      document.cookie = `podscare_session_token=${encodeURIComponent(data.token)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    }

    defaultHttpClient.setToken(data.token);
    setToken(data.token);
    setUserProfile(profile);
    setRoleState(normRole);
    setIsAuthenticated(true);

    if (isSuperAdmin) {
      setBranchState('Nền tảng FIXO');
      setBranchIdState('all');
    } else if (isAdmin) {
      setBranchState('Tất cả chi nhánh');
      setBranchIdState('all');
      try {
        localStorage.setItem('podscare_branch', 'Tất cả chi nhánh');
        localStorage.setItem('podscare_branch_id', 'all');
      } catch {
        // ignore
      }
      fetchOrders('all');
    } else {
      setBranchState(userBranchName);
      setBranchIdState(userBranchId ?? 1);
      try {
        localStorage.setItem('podscare_branch', userBranchName);
        localStorage.setItem('podscare_branch_id', String(userBranchId ?? 1));
      } catch {
        // ignore
      }
      fetchOrders(userBranchId ?? 1);
    }
  };

  const logout = async () => {
    try {
      await authService.logout().catch((err) => {
        console.warn('Backend logout API returned error (safe fallback ignored):', err);
      });
    } finally {
      // Fail-safe teardown: xóa sạch LocalStorage, Cookie và React Query Cache
      if (typeof window !== 'undefined') {
        localStorage.removeItem('podscare_token');
        localStorage.removeItem('podscare_user');
        localStorage.removeItem('podscare_role');
        localStorage.removeItem('podscare_branch');
        localStorage.removeItem('podscare_branch_id');
        document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';
      }
      queryClient.clear();
      defaultHttpClient.setToken(null);
      setToken(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      setOrders([]);
    }
  };

  const currentUser: UserProfile | null = userProfile;

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
          isMounted,
        }}
      >
        <NotificationProvider
          branchId={branchId}
          role={role}
          userId={currentUser?.id}
          enabled={isAuthenticated}
        >
          <ToastProvider>
            <ChunkLoadErrorHandler />
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </NotificationProvider>
      </PodsCareContext.Provider>
    </QueryClientProvider>
  );
};
