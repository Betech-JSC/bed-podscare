'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Avatar,
  Icon,
  StatCard,
  TableSkeleton,
  EmptyState,
  useToast,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import { userService } from '@podscare/api-client';

export interface UserItem {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'cskh' | 'technician' | 'tech' | 'qc' | 'inventory' | 'warehouse';
  branch_name?: string;
  branch_id?: number | null;
  branch?: {
    id: number;
    code?: string;
    name: string;
  };
  is_active: boolean;
  avatar_url?: string | null;
  created_at?: string;
}

const FALLBACK_BRANCHES = [
  { id: 1, name: 'PodsCare · Quận 1', code: 'Q1' },
  { id: 2, name: 'PodsCare · Quận 3', code: 'Q3' },
  { id: 3, name: 'PodsCare · TP. Thủ Đức', code: 'THUDUC' },
];

export default function UsersPage() {
  const { toast } = useToast();
  const { branches } = usePodsCare();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  const effectiveBranches = React.useMemo(() => {
    const filtered = (branches || []).filter((b) => b.id !== 'all');
    return filtered.length > 0 ? filtered : FALLBACK_BRANCHES;
  }, [branches]);

  const branchOptions = React.useMemo(() => {
    return effectiveBranches.map((b) => ({
      value: String(b.id),
      label: b.name,
    }));
  }, [effectiveBranches]);

  // Form states for Create User
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'cskh' as UserItem['role'],
    branch_id: '' as string | number,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Nạp danh sách tài khoản từ userService API
  const fetchUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await userService.getUsers({ per_page: 50 });
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      if (Array.isArray(list)) {
        const apiUsers: UserItem[] = list.map((u: any) => {
          const resolvedBranchId = u.branch_id ?? u.branch?.id ?? null;
          const resolvedBranchName =
            u.branch?.name ||
            effectiveBranches.find((b) => Number(b.id) === Number(resolvedBranchId))?.name ||
            (resolvedBranchId ? `Chi nhánh #${resolvedBranchId}` : 'Chưa phân công');

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || '—',
            role: u.role,
            branch_id: resolvedBranchId,
            branch_name: resolvedBranchName,
            branch: u.branch,
            is_active: Boolean(u.is_active),
            avatar_url: u.avatar_url,
          };
        });
        setUsers(apiUsers);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.warn('Could not fetch users from API:', e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveBranches]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Validation
  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Vui lòng nhập họ và tên.';
    if (!formData.email.trim()) {
      errs.email = 'Vui lòng nhập email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = 'Email không đúng định dạng.';
    }
    if (!formData.password || formData.password.length < 6) {
      errs.password = 'Mật khẩu phải từ 6 ký tự trở lên.';
    }
    const isNonAdmin = ['cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'].includes(
      formData.role
    );
    if (
      isNonAdmin &&
      (!formData.branch_id || formData.branch_id === '' || formData.branch_id === 0)
    ) {
      errs.branch_id = 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    const chosenBranchId = formData.branch_id ? Number(formData.branch_id) : undefined;
    try {
      await userService.createUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
        role: formData.role,
        branch_id: chosenBranchId,
      });

      toast(`Cấp tài khoản cho "${formData.name}" thành công!`, 'success');
      setCreateModalOpen(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'cskh',
        branch_id: '',
      });
      setFormErrors({});
      fetchUsers();
    } catch (err: any) {
      toast(err?.response?.data?.message || err.message || 'Lỗi khi cấp tài khoản', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Status (Lock / Unlock)
  const handleToggleStatus = async (user: UserItem) => {
    const actionName = user.is_active ? 'khóa' : 'kích hoạt';
    if (!confirm(`Bạn có chắc chắn muốn ${actionName} tài khoản ${user.name}?`)) {
      return;
    }

    try {
      await userService.toggleStatus(user.id);
      toast(
        `Đã ${user.is_active ? 'tạm khóa' : 'kích hoạt lại'} tài khoản ${user.name}.`,
        'success'
      );
      fetchUsers();
    } catch {
      toast('Không thể thay đổi trạng thái tài khoản.', 'error');
    }
  };

  // Update Role / Details
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const isNonAdmin = ['cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'].includes(
      selectedUser.role
    );
    if (isNonAdmin && (!selectedUser.branch_id || Number(selectedUser.branch_id) === 0)) {
      setEditErrors({ branch_id: 'Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.' });
      toast('Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const chosenBranchId =
        selectedUser.branch_id !== undefined &&
        selectedUser.branch_id !== null &&
        Number(selectedUser.branch_id) > 0
          ? Number(selectedUser.branch_id)
          : undefined;

      await userService.updateUser(selectedUser.id, {
        name: selectedUser.name,
        phone: selectedUser.phone,
        role: selectedUser.role,
        branch_id: chosenBranchId,
      });

      toast(`Đã cập nhật thông tin nhân viên ${selectedUser.name}!`, 'success');
      setEditModalOpen(false);
      setSelectedUser(null);
      setEditErrors({});
      fetchUsers();
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể cập nhật tài khoản.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper badge for role
  const renderRoleBadge = (role: UserItem['role']) => {
    switch (role) {
      case 'admin':
        return <Badge variant="brand">Quản trị viên</Badge>;
      case 'cskh':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#eef4ff] text-[#2563eb]">
            CSKH Tiếp nhận
          </span>
        );
      case 'technician':
      case 'tech':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#fef5e7] text-[#b45309]">
            Kỹ thuật viên
          </span>
        );
      case 'qc':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#f5f0ff] text-[#7c3aed]">
            Kiểm định QC
          </span>
        );
      case 'inventory':
      case 'warehouse':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#fdf2f8] text-[#db2777]">
            Thủ kho
          </span>
        );
      default:
        return <Badge variant="neutral">{role}</Badge>;
    }
  };

  // Filtering
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.includes(q);

    const matchRole =
      !roleFilter ||
      u.role === roleFilter ||
      (roleFilter === 'tech' && u.role === 'technician');

    const matchStatus =
      !statusFilter ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'locked' && !u.is_active);

    return matchQuery && matchRole && matchStatus;
  });

  return (
    <AppShell crumbName="Tài khoản & Phân quyền">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
              HỆ THỐNG · PHÂN QUYỀN
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Tài khoản & Phân quyền
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Quản lý danh sách nhân viên, cấp tài khoản và thiết lập quyền truy cập PodsCare OS.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon="refresh"
              onClick={fetchUsers}
              disabled={loading}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="plus"
              onClick={() => setCreateModalOpen(true)}
            >
              Cấp tài khoản mới
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard
            label="Tổng nhân viên"
            value={users.length}
            icon="customers"
            foot="Toàn hệ thống"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Quản trị viên (Admin)"
            value={users.filter((u) => u.role === 'admin').length}
            icon="spark"
            foot="Toàn quyền hệ thống"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="CSKH & Kỹ thuật"
            value={
              users.filter((u) => ['cskh', 'technician', 'tech'].includes(u.role)).length
            }
            icon="repairs"
            foot="Nhân sự trực tiếp"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Đang hoạt động"
            value={users.filter((u) => u.is_active).length}
            icon="check"
            foot={`${users.filter((u) => !u.is_active).length} tài khoản tạm khóa`}
            periodLabel=""
            trend="neutral"
          />
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-[340px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91a098] pointer-events-none">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên, email, SĐT..."
                  className="w-full h-10 pl-9 pr-3 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 border border-[#e4eae6] rounded-[8px] px-3 text-sm text-[#54645c] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="">Tất cả vai trò</option>
                <option value="admin">Quản trị viên (Admin)</option>
                <option value="cskh">CSKH Tiếp nhận</option>
                <option value="technician">Kỹ thuật viên</option>
                <option value="qc">Kiểm định QC</option>
                <option value="inventory">Thủ kho</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 border border-[#e4eae6] rounded-[8px] px-3 text-sm text-[#54645c] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Tạm khóa</option>
              </select>
            </div>

            <div className="text-xs text-[#7e8d85] font-medium">
              Hiển thị <b>{filteredUsers.length}</b> / {users.length} nhân viên
            </div>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="Không tìm thấy nhân viên nào phù hợp"
            description="Thử thay đổi bộ lọc tìm kiếm hoặc cấp tài khoản mới."
            actionLabel="Cấp tài khoản mới"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fafbfa] border-b border-[#edf1ee] text-xs font-bold text-[#7a8a83] uppercase tracking-wider">
                    <th className="py-3.5 px-4">Nhân viên</th>
                    <th className="py-3.5 px-4">Liên hệ</th>
                    <th className="py-3.5 px-4">Chi nhánh</th>
                    <th className="py-3.5 px-4">Vai trò</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3f1] text-sm">
                  {filteredUsers.map((user) => {
                    const initials = user.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr
                        key={user.id}
                        className={`hover:bg-[#f8faf9] transition-colors ${
                          !user.is_active ? 'opacity-70 bg-[#fafafa]' : ''
                        }`}
                      >
                        {/* User Name & Avatar */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar initials={initials} size="md" variant="dark" />
                            <div>
                              <b className="block text-sm font-bold text-[#1c302b]">
                                {user.name}
                              </b>
                              <span className="block text-xs text-[#809088]">
                                ID: #{user.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4">
                          <div className="text-sm text-[#2a3932] font-medium">
                            {user.email}
                          </div>
                          <div className="text-xs text-[#7e8d85]">{user.phone}</div>
                        </td>

                        {/* Branch */}
                        <td className="py-3.5 px-4">
                          <span className="text-sm font-medium text-[#3b4c44]">
                            {user.branch?.name ||
                              branches.find((b) => Number(b.id) === Number(user.branch_id))?.name ||
                              user.branch_name ||
                              'Chưa phân công'}
                          </span>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3.5 px-4">
                          {renderRoleBadge(user.role)}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-xs font-semibold tracking-wide text-[#28765a] bg-[#e9f4ed]">
                              <span className="w-1.5 h-1.5 rounded-full bg-current flex-none" />
                              <span>Hoạt động</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-xs font-semibold tracking-wide text-[#ad5148] bg-[#fbefed]">
                              <span className="w-1.5 h-1.5 rounded-full bg-current flex-none" />
                              <span>Tạm khóa</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const currentBranchId = user.branch_id || Number(branchOptions[0]?.value) || 1;
                                setSelectedUser({
                                  ...user,
                                  branch_id: currentBranchId,
                                  branch_name: branchOptions.find((b) => Number(b.value) === Number(currentBranchId))?.label || user.branch_name,
                                });
                                setEditModalOpen(true);
                              }}
                            >
                              Sửa / Vai trò
                            </Button>
                            <Button
                              variant={user.is_active ? 'danger' : 'secondary'}
                              size="sm"
                              onClick={() => handleToggleStatus(user)}
                            >
                              {user.is_active ? 'Khóa' : 'Kích hoạt'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Cấp tài khoản mới */}
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          eyebrow="PHÂN QUYỀN HỆ THỐNG"
          title="Cấp tài khoản nhân viên mới"
          subtitle="Tạo tài khoản truy cập và chỉ định vai trò trong quy trình vận hành PodsCare"
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2.5 w-full">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setCreateModalOpen(false)}
                disabled={submitting}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCreateUser}
                loading={submitting}
              >
                Xác nhận cấp tài khoản →
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Input
                label="Họ và tên nhân viên *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ví dụ: Nguyễn Văn An"
                error={formErrors.name}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Email đăng nhập *"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="an.nguyen@podscare.vn"
                  error={formErrors.email}
                  required
                />
              </div>
              <div>
                <Input
                  label="Số điện thoại"
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0901 xxx xxx"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Mật khẩu khởi tạo *"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Tối thiểu 6 ký tự"
                  error={formErrors.password}
                  required
                />
              </div>
              <div>
                <Select
                  label={`Chi nhánh công tác ${
                    ['cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'].includes(formData.role)
                      ? '*'
                      : '(tùy chọn)'
                  }`}
                  value={String(formData.branch_id || '')}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      branch_id: e.target.value ? Number(e.target.value) : '',
                    });
                    if (formErrors.branch_id) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.branch_id;
                        return next;
                      });
                    }
                  }}
                  error={formErrors.branch_id}
                  options={[
                    { value: '', label: '-- Chọn chi nhánh công tác --' },
                    ...branchOptions,
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                Chỉ định vai trò truy cập *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    role: 'admin',
                    title: 'Quản trị viên (Admin)',
                    desc: 'Toàn quyền cấu hình, tài khoản, doanh thu, xóa sửa.',
                  },
                  {
                    role: 'cskh',
                    title: 'CSKH Tiếp nhận',
                    desc: 'Tiếp nhận đơn, tạo phiếu, báo giá, giao nhận, chăm sóc.',
                  },
                  {
                    role: 'technician',
                    title: 'Kỹ thuật viên',
                    desc: 'Nhận đơn, sửa chữa, thay linh kiện, bàn giao kiểm định.',
                  },
                  {
                    role: 'qc',
                    title: 'Kiểm định QC',
                    desc: 'Kiểm tra checklist chất lượng, phê duyệt xuất xưởng.',
                  },
                  {
                    role: 'inventory',
                    title: 'Thủ kho linh kiện',
                    desc: 'Nhập xuất tồn, quản lý danh mục và điều phối linh kiện.',
                  },
                ].map((item) => (
                  <label
                    key={item.role}
                    className={`p-3 rounded-[8px] border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      formData.role === item.role
                        ? 'border-[#176b58] bg-[#f2f8f5] shadow-xs'
                        : 'border-[#e5ece8] bg-white hover:bg-[#fafbfa]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <b className="text-sm font-bold text-[#1c302b]">{item.title}</b>
                      <input
                        type="radio"
                        name="assign_role"
                        value={item.role}
                        checked={formData.role === item.role}
                        onChange={() =>
                          setFormData({ ...formData, role: item.role as UserItem['role'] })
                        }
                        className="accent-[#176b58]"
                      />
                    </div>
                    <p className="text-xs text-[#7e8d85] m-0 leading-snug">{item.desc}</p>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </Modal>

        {/* Modal: Chỉnh sửa thông tin / Đổi vai trò */}
        {selectedUser && (
          <Modal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            eyebrow="CẬP NHẬT TÀI KHOẢN"
            title={`Chỉnh sửa: ${selectedUser.name}`}
            subtitle={`ID: #${selectedUser.id} · Email: ${selectedUser.email}`}
            maxWidth="md"
            footer={
              <div className="flex justify-end gap-2.5 w-full">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setEditModalOpen(false)}
                  disabled={submitting}
                >
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleUpdateUser}
                  loading={submitting}
                >
                  Lưu thay đổi
                </Button>
              </div>
            }
          >
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <Input
                  label="Họ và tên"
                  value={selectedUser.name}
                  onChange={(e) =>
                    setSelectedUser({ ...selectedUser, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Email"
                    value={selectedUser.email}
                    disabled
                    hint="Email không thể thay đổi sau khi tạo."
                  />
                </div>
                <div>
                  <Input
                    label="Số điện thoại"
                    value={selectedUser.phone}
                    onChange={(e) =>
                      setSelectedUser({ ...selectedUser, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Select
                    label="Đổi vai trò phân quyền"
                    value={selectedUser.role}
                    onChange={(e) =>
                      setSelectedUser({
                        ...selectedUser,
                        role: e.target.value as UserItem['role'],
                      })
                    }
                    options={[
                      { value: 'admin', label: 'Quản trị viên (Admin)' },
                      { value: 'cskh', label: 'CSKH Tiếp nhận' },
                      { value: 'technician', label: 'Kỹ thuật viên' },
                      { value: 'qc', label: 'Kiểm định QC' },
                      { value: 'inventory', label: 'Thủ kho linh kiện' },
                    ]}
                  />
                </div>
                <div>
                  <Select
                    label={`Chi nhánh công tác ${
                      ['cskh', 'technician', 'tech', 'qc', 'inventory', 'warehouse'].includes(selectedUser.role)
                        ? '*'
                        : '(tùy chọn)'
                    }`}
                    value={String(selectedUser.branch_id || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newBranchId = val ? Number(val) : null;
                      const newBranchName = branchOptions.find((b) => b.value === val)?.label;
                      setSelectedUser({
                        ...selectedUser,
                        branch_id: newBranchId,
                        branch_name: newBranchName,
                      });
                      if (editErrors.branch_id) {
                        setEditErrors((prev) => {
                          const next = { ...prev };
                          delete next.branch_id;
                          return next;
                        });
                      }
                    }}
                    error={editErrors.branch_id}
                    options={[
                      { value: '', label: '-- Chọn chi nhánh công tác --' },
                      ...branchOptions,
                    ]}
                  />
                </div>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
