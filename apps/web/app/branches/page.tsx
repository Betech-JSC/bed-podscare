'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Modal,
  Icon,
  StatCard,
  Checkbox,
  TableSkeleton,
  EmptyState,
  useToast,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import { branchService, type CreateBranchPayload } from '@podscare/api-client';

export interface BranchRecord {
  id: number | string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  is_active: boolean;
  users_count?: number;
  repair_orders_count?: number;
}

export default function BranchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, fetchBranches } = usePodsCare();

  const isAdmin = currentUser?.role === 'admin';

  const [branchesList, setBranchesList] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [togglingId, setTogglingId] = useState<number | string | null>(null);

  // Modal: Create Branch
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    code: string;
    name: string;
    address: string;
    phone: string;
    is_active: boolean;
  }>({
    code: '',
    name: '',
    address: '',
    phone: '',
    is_active: true,
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Modal: Edit Branch
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BranchRecord | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Nạp danh sách chi nhánh từ Backend API
  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await branchService.getBranches();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list) && list.length > 0) {
        const mapped: BranchRecord[] = list.map((b: any) => ({
          id: b.id,
          code: b.code || '',
          name: b.name,
          address: b.address || '',
          phone: b.phone || '',
          is_active: b.is_active !== undefined ? Boolean(b.is_active) : true,
          users_count: b.users_count !== undefined ? Number(b.users_count) : (b.users?.length || 0),
          repair_orders_count: b.repair_orders_count !== undefined ? Number(b.repair_orders_count) : 0,
        }));
        setBranchesList(mapped);
      } else {
        // Fallback default sample data if API returns empty
        setBranchesList([
          {
            id: 1,
            code: 'Q1',
            name: 'FIXO · Quận 1',
            address: '142 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP.HCM',
            phone: '028 7300 1234',
            is_active: true,
            users_count: 8,
            repair_orders_count: 142,
          },
          {
            id: 2,
            code: 'Q3',
            name: 'FIXO · Quận 3',
            address: '285 Cách Mạng Tháng Tám, Phường 12, Quận 3, TP.HCM',
            phone: '028 7300 5678',
            is_active: true,
            users_count: 5,
            repair_orders_count: 98,
          },
          {
            id: 3,
            code: 'THUDUC',
            name: 'FIXO · TP. Thủ Đức',
            address: '56 Võ Văn Ngân, Phường Bình Thọ, TP. Thủ Đức, TP.HCM',
            phone: '028 7300 9012',
            is_active: true,
            users_count: 4,
            repair_orders_count: 67,
          },
        ]);
      }
    } catch (e) {
      console.warn('Could not fetch branches from API:', e);
      // Fallback sample data if connection fails
      setBranchesList([
        {
          id: 1,
          code: 'Q1',
          name: 'FIXO · Quận 1',
          address: '142 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP.HCM',
          phone: '028 7300 1234',
          is_active: true,
          users_count: 8,
          repair_orders_count: 142,
        },
        {
          id: 2,
          code: 'Q3',
          name: 'FIXO · Quận 3',
          address: '285 Cách Mạng Tháng Tám, Phường 12, Quận 3, TP.HCM',
          phone: '028 7300 5678',
          is_active: true,
          users_count: 5,
          repair_orders_count: 98,
        },
        {
          id: 3,
          code: 'THUDUC',
          name: 'FIXO · TP. Thủ Đức',
          address: '56 Võ Văn Ngân, Phường Bình Thọ, TP. Thủ Đức, TP.HCM',
          phone: '028 7300 9012',
          is_active: true,
          users_count: 4,
          repair_orders_count: 67,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadBranches();
    }
  }, [isAdmin, loadBranches]);

  // Validation Form Tạo Chi nhánh
  const validateCreateForm = () => {
    const errs: Record<string, string> = {};
    const trimmedCode = createForm.code.trim().toUpperCase();
    const trimmedName = createForm.name.trim();
    const trimmedAddress = createForm.address.trim();

    if (!trimmedCode) {
      errs.code = 'Vui lòng nhập mã chi nhánh.';
    } else if (
      branchesList.some(
        (b) => b.code.toUpperCase() === trimmedCode
      )
    ) {
      errs.code = `Mã "${trimmedCode}" đã tồn tại trên hệ thống. Vui lòng chọn mã khác.`;
    }

    if (!trimmedName) {
      errs.name = 'Vui lòng nhập tên chi nhánh.';
    }

    if (!trimmedAddress) {
      errs.address = 'Vui lòng nhập địa chỉ chi nhánh.';
    }

    setCreateErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit Tạo Chi nhánh Mới
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;

    setSubmittingCreate(true);
    const payload: CreateBranchPayload = {
      code: createForm.code.trim().toUpperCase(),
      name: createForm.name.trim(),
      address: createForm.address.trim(),
      phone: createForm.phone.trim() || undefined,
      is_active: createForm.is_active,
    };

    try {
      await branchService.createBranch(payload);
      toast(`Đã tạo chi nhánh "${payload.name}" thành công!`, 'success');

      // Reset form & đóng modal
      setCreateModalOpen(false);
      setCreateForm({
        code: '',
        name: '',
        address: '',
        phone: '',
        is_active: true,
      });
      setCreateErrors({});

      // Làm mới danh sách chi nhánh trang hiện tại
      await loadBranches();

      // Đồng bộ làm mới danh sách chi nhánh toàn bộ ứng dụng (Sidebar, Context)
      if (fetchBranches) {
        await fetchBranches();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể tạo chi nhánh';
      toast(msg, 'error');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Mở modal Chỉnh sửa Chi nhánh
  const handleOpenEdit = (branch: BranchRecord) => {
    setSelectedBranch({ ...branch });
    setEditErrors({});
    setEditModalOpen(true);
  };

  // Submit Cập nhật Chi nhánh
  const handleUpdateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    const errs: Record<string, string> = {};
    if (!selectedBranch.name.trim()) {
      errs.name = 'Vui lòng nhập tên chi nhánh.';
    }
    if (!selectedBranch.address?.trim()) {
      errs.address = 'Vui lòng nhập địa chỉ chi nhánh.';
    }
    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      return;
    }

    setSubmittingEdit(true);
    try {
      await branchService.updateBranch(selectedBranch.id, {
        name: selectedBranch.name.trim(),
        address: selectedBranch.address?.trim(),
        phone: selectedBranch.phone?.trim() || undefined,
        is_active: selectedBranch.is_active,
      });

      toast(`Cập nhật chi nhánh "${selectedBranch.name}" thành công!`, 'success');
      setEditModalOpen(false);
      setSelectedBranch(null);

      await loadBranches();
      if (fetchBranches) {
        await fetchBranches();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể cập nhật chi nhánh';
      toast(msg, 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Chuyển đổi trạng thái Tạm ngưng / Kích hoạt
  const handleToggleStatus = async (branch: BranchRecord) => {
    const actionLabel = branch.is_active ? 'tạm ngưng' : 'kích hoạt lại';
    if (!confirm(`Bạn có chắc chắn muốn ${actionLabel} chi nhánh "${branch.name}"?`)) {
      return;
    }

    try {
      setTogglingId(branch.id);
      await branchService.toggleBranchStatus(branch.id);
      toast(
        `Đã ${branch.is_active ? 'tạm ngưng' : 'kích hoạt'} chi nhánh "${branch.name}".`,
        'success'
      );
      await loadBranches();
      if (fetchBranches) {
        await fetchBranches();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể thay đổi trạng thái chi nhánh';
      toast(msg, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // Thống kê StatCards
  const totalBranches = branchesList.length;
  const activeBranches = branchesList.filter((b) => b.is_active).length;
  const totalStaff = branchesList.reduce((sum, b) => sum + (b.users_count || 0), 0);
  const totalOrders = branchesList.reduce((sum, b) => sum + (b.repair_orders_count || 0), 0);

  // Lọc dữ liệu danh sách chi nhánh
  const filteredBranches = useMemo(() => {
    return branchesList.filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        (b.address && b.address.toLowerCase().includes(q)) ||
        (b.phone && b.phone.includes(q));

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && b.is_active) ||
        (statusFilter === 'inactive' && !b.is_active);

      return matchSearch && matchStatus;
    });
  }, [branchesList, searchQuery, statusFilter]);

  // Role Guard: Từ chối truy cập (403 Forbidden) đối với nhân viên không phải Admin
  if (!isAdmin) {
    return (
      <AppShell crumbName="Quản lý Chi nhánh">
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#e5ece8] rounded-[12px] p-6 text-center shadow-xs">
            <div className="w-14 h-14 rounded-full bg-[#fbf0ee] text-[#bc5b52] mx-auto grid place-items-center mb-4">
              <Icon name="alert" size={28} />
            </div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
              403 FORBIDDEN · TỪ CHỐI TRUY CẬP
            </div>
            <h2 className="font-heading font-bold text-xl text-[#1c302b] m-0">
              Quyền truy cập bị từ chối
            </h2>
            <p className="text-sm text-[#7e8d85] mt-2 mb-6 leading-relaxed">
              Trang Quản lý Chi nhánh chỉ dành riêng cho Quản trị viên (Admin). Bạn không có quyền truy cập hoặc thực hiện thao tác trên module này.
            </p>
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => router.push('/')}
            >
              ← Quay về Tổng quan
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumbName="Quản lý Chi nhánh">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
              HỆ THỐNG · MẠNG LƯỚI CHI NHÁNH
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Quản lý Chi nhánh
            </h1>
            <p className="text-sm text-[#7e8d85] mt-1 mb-0">
              Thiết lập các trạm tiếp nhận, phòng lab kỹ thuật và điều phối hoạt động toàn hệ thống FIXO.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon="refresh"
              onClick={loadBranches}
              disabled={loading}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="plus"
              onClick={() => {
                setCreateErrors({});
                setCreateModalOpen(true);
              }}
            >
              + Thêm chi nhánh mới
            </Button>
          </div>
        </div>

        {/* 4 Thẻ thống kê (StatCards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard
            label="Tổng số chi nhánh"
            value={totalBranches}
            icon="spark"
            foot="Mạng lưới toàn quốc"
            trend="up"
          />
          <StatCard
            label="Chi nhánh đang hoạt động"
            value={activeBranches}
            icon="check"
            foot={`${totalBranches - activeBranches} chi nhánh tạm ngưng`}
            trend="up"
          />
          <StatCard
            label="Tổng nhân sự trực thuộc"
            value={totalStaff}
            icon="customers"
            foot="KTV & CSKH tại các trạm"
            trend="up"
          />
          <StatCard
            label="Tổng đơn sửa chữa"
            value={totalOrders}
            icon="repairs"
            foot="Tích lũy toàn hệ thống"
            trend="up"
          />
        </div>

        {/* Thanh công cụ tìm kiếm & lọc */}
        <div className="bg-white rounded-[12px] border border-[#e5ece8] p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[240px] max-w-[420px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91a098] pointer-events-none">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên chi nhánh, mã code, địa chỉ, hotline..."
                  className="w-full h-10 pl-9 pr-3 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 transition-all placeholder:text-[#9aa59f]"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-10 border border-[#e4eae6] rounded-[8px] px-3 text-sm text-[#54645c] bg-white outline-none focus:border-[#75a994] cursor-pointer"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
              </select>
            </div>

            <div className="text-xs text-[#7e8d85] font-medium">
              Hiển thị <b>{filteredBranches.length}</b> / {totalBranches} chi nhánh
            </div>
          </div>
        </div>

        {/* Bảng danh sách chi nhánh */}
        {loading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : filteredBranches.length === 0 ? (
          <EmptyState
            title="Không tìm thấy chi nhánh phù hợp"
            description="Thử thay đổi từ khóa tìm kiếm hoặc tạo thêm chi nhánh mới vào hệ thống."
            actionLabel="+ Thêm chi nhánh mới"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : (
          <div className="bg-white rounded-[12px] border border-[#e5ece8] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-[#fafbfa] border-b border-[#edf1ee] text-xs font-bold text-[#7a8a83] uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-[110px]">Mã code</th>
                    <th className="py-3.5 px-4">Tên chi nhánh</th>
                    <th className="py-3.5 px-4">Địa chỉ hoạt động</th>
                    <th className="py-3.5 px-4">Hotline</th>
                    <th className="py-3.5 px-4">Quy mô nhân sự</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3f1] text-sm">
                  {filteredBranches.map((branch) => {
                    return (
                      <tr
                        key={branch.id}
                        className={`hover:bg-[#f8faf9] transition-colors ${
                          !branch.is_active ? 'opacity-75 bg-[#fafafa]' : ''
                        }`}
                      >
                        {/* Code Badge */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[6px] bg-[#eaf4ef] text-[#176b58] border border-[#cbe4d7] inline-block">
                            {branch.code}
                          </span>
                        </td>

                        {/* Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-[8px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none font-bold text-xs">
                              {branch.code.slice(0, 2)}
                            </div>
                            <div>
                              <b className="block text-sm font-bold text-[#1c302b]">
                                {branch.name}
                              </b>
                              <span className="block text-xs text-[#809088]">
                                ID: #{branch.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Address */}
                        <td className="py-3.5 px-4">
                          <div className="text-xs text-[#3b4c44] flex items-center gap-1.5 max-w-[280px]">
                            <span className="text-[#819089] flex-none">📍</span>
                            <span className="truncate" title={branch.address}>
                              {branch.address || 'Chưa cập nhật'}
                            </span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4">
                          <span className="text-xs font-medium text-[#2d3e35]">
                            {branch.phone || '—'}
                          </span>
                        </td>

                        {/* Staff & Orders */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#48564f] bg-[#f0f3f1] px-2 py-0.5 rounded-[8px]">
                              <Icon name="customers" size={13} />
                              {branch.users_count || 0}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded-[8px]">
                              <Icon name="repairs" size={13} />
                              {branch.repair_orders_count || 0} đơn
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {branch.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-xs font-semibold tracking-wide text-[#28765a] bg-[#e9f4ed]">
                              <span className="w-1.5 h-1.5 rounded-full bg-current flex-none" />
                              <span>Hoạt động</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-xs font-semibold tracking-wide text-[#ad5148] bg-[#fbefed]">
                              <span className="w-1.5 h-1.5 rounded-full bg-current flex-none" />
                              <span>Tạm ngưng</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEdit(branch)}
                            >
                              Chỉnh sửa
                            </Button>
                            <Button
                              variant={branch.is_active ? 'danger' : 'secondary'}
                              size="sm"
                              onClick={() => handleToggleStatus(branch)}
                              loading={togglingId === branch.id}
                            >
                              {branch.is_active ? 'Tạm ngưng' : 'Kích hoạt'}
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

        {/* Modal: Tạo Chi nhánh Mới */}
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          eyebrow="MẠNG LƯỚI FIXO"
          title="Thêm chi nhánh mới"
          subtitle="Đăng ký thêm trạm tiếp nhận hoặc phòng lab kỹ thuật mới vào hệ thống"
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2.5 w-full">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setCreateModalOpen(false)}
                disabled={submittingCreate}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCreateBranch}
                loading={submittingCreate}
              >
                Xác nhận tạo chi nhánh →
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreateBranch} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Mã chi nhánh (Code) *"
                  value={createForm.code}
                  onChange={(e) => {
                    const upper = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                    setCreateForm({ ...createForm, code: upper });
                  }}
                  placeholder="Ví dụ: BINHTHANH"
                  error={createErrors.code}
                  hint="Tự động in hoa, không dấu, không trùng lặp."
                  required
                />
              </div>

              <div>
                <Input
                  label="Số điện thoại hotline"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="Ví dụ: 028 7300 8888"
                />
              </div>
            </div>

            <div>
              <Input
                label="Tên chi nhánh *"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Ví dụ: FIXO · Bình Thạnh"
                error={createErrors.name}
                required
              />
            </div>

            <div>
              <Input
                label="Địa chỉ chi nhánh *"
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                placeholder="Ví dụ: 123 Điện Biên Phủ, P.15, Q. Bình Thạnh, TP.HCM"
                error={createErrors.address}
                required
              />
            </div>

            <div className="pt-2 border-t border-[#f0f3f1]">
              <Checkbox
                label="Kích hoạt chi nhánh ngay sau khi tạo"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
              />
              <p className="text-xs text-[#82928a] mt-1 ml-6.5">
                Chi nhánh sẽ xuất hiện ngay lập tức trên thanh chọn chi nhánh toàn hệ thống để nhân viên sử dụng.
              </p>
            </div>
          </form>
        </Modal>

        {/* Modal: Chỉnh sửa Chi nhánh */}
        {selectedBranch && (
          <Modal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            eyebrow="CẬP NHẬT CHI NHÁNH"
            title={`Chỉnh sửa: ${selectedBranch.name}`}
            subtitle={`Mã chi nhánh: ${selectedBranch.code} · ID: #${selectedBranch.id}`}
            maxWidth="md"
            footer={
              <div className="flex justify-end gap-2.5 w-full">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setEditModalOpen(false)}
                  disabled={submittingEdit}
                >
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleUpdateBranch}
                  loading={submittingEdit}
                >
                  Lưu thay đổi
                </Button>
              </div>
            }
          >
            <form onSubmit={handleUpdateBranch} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Mã chi nhánh (Code)"
                    value={selectedBranch.code}
                    disabled
                    hint="Mã code là định danh duy nhất và không thể thay đổi."
                  />
                </div>

                <div>
                  <Input
                    label="Số điện thoại hotline"
                    value={selectedBranch.phone || ''}
                    onChange={(e) =>
                      setSelectedBranch({ ...selectedBranch, phone: e.target.value })
                    }
                    placeholder="Ví dụ: 028 7300 8888"
                  />
                </div>
              </div>

              <div>
                <Input
                  label="Tên chi nhánh *"
                  value={selectedBranch.name}
                  onChange={(e) =>
                    setSelectedBranch({ ...selectedBranch, name: e.target.value })
                  }
                  error={editErrors.name}
                  required
                />
              </div>

              <div>
                <Input
                  label="Địa chỉ chi nhánh *"
                  value={selectedBranch.address || ''}
                  onChange={(e) =>
                    setSelectedBranch({ ...selectedBranch, address: e.target.value })
                  }
                  error={editErrors.address}
                  required
                />
              </div>

              <div className="pt-2 border-t border-[#f0f3f1]">
                <Checkbox
                  label="Đang hoạt động"
                  checked={selectedBranch.is_active}
                  onChange={(e) =>
                    setSelectedBranch({ ...selectedBranch, is_active: e.target.checked })
                  }
                />
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
