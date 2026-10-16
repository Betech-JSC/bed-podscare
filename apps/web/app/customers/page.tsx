'use client';

import React, { useState, useMemo } from 'react';
import {
  FilterBar,
  Modal,
  Button,
  CardsSkeleton,
  EmptyState,
  ErrorFallback,
  useToast,
  Input,
  Textarea,
  Icon,
  sanitizeInputLive,
  sanitizeSearchQuery,
  normalizePhoneForStorage,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { IntakeWizardModal } from '../components/IntakeWizardModal';
import { customerService } from '@podscare/api-client';
import { useQuery } from '@tanstack/react-query';

interface CustomerViewModel {
  id: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  shipping_address?: string;
  orders: number;
  spent: string;
  totalSpentRaw: number;
  since: string;
  initials: string;
  raw: any;
}

export default function CustomersPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number | 'all'>(15);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [newIntakeCustomer, setNewIntakeCustomer] = useState<{ name: string; phone: string } | null>(null);

  // Nạp danh sách khách hàng trực tiếp từ API kèm phân trang và tìm kiếm động
  const {
    data: apiCustomersData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['customers', search.trim(), page, perPage],
    queryFn: async () => {
      const cleanQuery = sanitizeSearchQuery(search);
      const res = await customerService.getCustomers({
        q: cleanQuery || undefined,
        page: perPage === 'all' ? 1 : page,
        per_page: perPage,
        all: perPage === 'all' ? true : undefined,
      });
      return res?.data || res;
    },
  });

  // Query chi tiết khách hàng và lịch sử đơn hàng khi mở modal
  const {
    data: customerDetailData,
    isLoading: isLoadingDetail,
  } = useQuery({
    queryKey: ['customerDetail', selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return null;
      const res = await customerService.getCustomerById(selectedCustomerId);
      return res?.data || res;
    },
    enabled: Boolean(selectedCustomerId),
  });

  const customers: CustomerViewModel[] = useMemo(() => {
    const raw = apiCustomersData?.data || apiCustomersData;
    const list = Array.isArray(raw) ? raw : [];

    return list.map((c: any) => {
      const name = c.name || 'Khách lẻ';
      const initials =
        name
          .split(' ')
          .filter(Boolean)
          .map((w: string) => w[0])
          .slice(-2)
          .join('')
          .toUpperCase() || 'KH';

      const ordersCount =
        c.repair_orders_count ??
        c.orders_count ??
        (Array.isArray(c.repair_orders) ? c.repair_orders.length : 0);

      const totalSpent =
        c.total_spent ??
        (Array.isArray(c.repair_orders)
          ? c.repair_orders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0)
          : 0);

      const formattedSpent =
        totalSpent > 0
          ? new Intl.NumberFormat('vi-VN').format(totalSpent) + ' ₫'
          : '0 ₫';

      const sinceStr = c.created_at
        ? new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(new Date(c.created_at))
        : 'Mới tiếp nhận';

      return {
        id: c.id,
        name,
        phone: c.phone || 'Chưa cập nhật SĐT',
        email: c.email,
        address: c.address,
        shipping_address: c.shipping_address,
        orders: ordersCount,
        spent: formattedSpent,
        totalSpentRaw: totalSpent,
        since: sinceStr,
        initials,
        raw: c,
      };
    });
  }, [apiCustomersData]);

  // Khách hàng hiện tại được chọn xem chi tiết
  const activeCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    const fromList = customers.find((c) => c.id === selectedCustomerId);
    const detail = customerDetailData?.data || customerDetailData;
    if (detail && detail.id === selectedCustomerId) {
      return {
        ...fromList,
        ...detail,
        name: detail.name || fromList?.name || 'Khách lẻ',
        phone: detail.phone || fromList?.phone || 'Chưa cập nhật SĐT',
        email: detail.email || fromList?.email,
        address: detail.address || fromList?.address || fromList?.raw?.address,
        shipping_address: detail.shipping_address || fromList?.shipping_address || fromList?.raw?.shipping_address,
        repair_orders: detail.repair_orders || detail.repairOrders || fromList?.raw?.repair_orders || [],
        warranties: detail.warranties || fromList?.raw?.warranties || [],
      };
    }
    return fromList?.raw || fromList;
  }, [selectedCustomerId, customers, customerDetailData]);

  // Tính số liệu cho modal chi tiết
  const detailStats = useMemo(() => {
    if (!activeCustomer) return { totalSpent: '0 ₫', orderCount: 0, activeWarranties: 0 };
    const ordersList = activeCustomer.repair_orders || activeCustomer.repairOrders || [];
    const warrantiesList = activeCustomer.warranties || [];

    const totalMoney = ordersList.reduce(
      (sum: number, o: any) => sum + (Number(o.total_price || o.estimated_price) || 0),
      0
    );

    const now = Date.now();
    const activeWCount = warrantiesList.filter((w: any) => {
      if (w.status === 'voided') return false;
      if (w.expires_at) return new Date(w.expires_at).getTime() >= now;
      return true;
    }).length;

    return {
      totalSpent:
        totalMoney > 0
          ? new Intl.NumberFormat('vi-VN').format(totalMoney) + ' ₫'
          : '0 ₫',
      orderCount: ordersList.length || activeCustomer.orders || 0,
      activeWarranties: activeWCount,
    };
  }, [activeCustomer]);

  const customerAddress = useMemo(() => {
    return (
      activeCustomer?.address ||
      activeCustomer?.shipping_address ||
      activeCustomer?.repair_orders?.find((o: any) => o.shipping_address)?.shipping_address ||
      activeCustomer?.repair_orders?.find((o: any) => o.shippingAddress)?.shippingAddress
    );
  }, [activeCustomer]);

  const handleCopyPhone = (phoneNum: string) => {
    if (!phoneNum || phoneNum === 'Chưa cập nhật SĐT') return;
    navigator.clipboard?.writeText(phoneNum);
    toast(`Đã sao chép số điện thoại ${phoneNum}`, 'success');
  };

  const handleCopyAddress = (addr: string) => {
    if (!addr) return;
    navigator.clipboard?.writeText(addr);
    toast('Đã sao chép địa chỉ khách hàng', 'success');
  };

  const handleStartIntakeForCustomer = () => {
    if (!activeCustomer) return;
    setNewIntakeCustomer({
      name: activeCustomer.name,
      phone: activeCustomer.phone,
    });
    setSelectedCustomerId(null);
    setIntakeModalOpen(true);
  };

  // Edit Customer State & Handlers
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEditModal = (c: any) => {
    if (!c) return;
    setEditingCustomer(c);
    setEditName(c.name || '');
    setEditPhone(c.phone === 'Chưa cập nhật SĐT' ? '' : c.phone || '');
    setEditAddress(c.address || c.shipping_address || c.raw?.address || '');
    setEditEmail(c.email || '');
    setEditError(null);
  };

  const handleSaveEditCustomer = async () => {
    if (!editingCustomer) return;
    if (!editName.trim()) {
      setEditError('Họ và tên khách hàng không được để trống.');
      return;
    }
    if (!editPhone.trim()) {
      setEditError('Số điện thoại không được để trống.');
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await customerService.updateCustomer(editingCustomer.id, {
        name: sanitizeSearchQuery(editName),
        phone: normalizePhoneForStorage(editPhone),
        address: sanitizeSearchQuery(editAddress) || undefined,
        email: sanitizeSearchQuery(editEmail) || undefined,
      });

      toast('Cập nhật thông tin khách hàng thành công!', 'success');
      setEditingCustomer(null);
      await refetch();
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Có lỗi xảy ra khi lưu thông tin khách hàng.';
      setEditError(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Thông tin phân trang từ response API
  const total = apiCustomersData?.total ?? customers.length;
  const currentPage = apiCustomersData?.current_page ?? page;
  const lastPage = apiCustomersData?.last_page ?? 1;
  const from = apiCustomersData?.from ?? (customers.length > 0 ? 1 : 0);
  const to = apiCustomersData?.to ?? customers.length;

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(lastPage, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }
    return pages;
  }, [currentPage, lastPage]);

  return (
    <AppShell crumbName="Khách hàng">
      <div className="space-y-5">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              CRM & KHÁCH HÀNG
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Danh sách khách hàng
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Quản lý hồ sơ, theo dõi bảo hành và lịch sử tất cả các lần tiếp nhận sửa chữa.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setNewIntakeCustomer(null);
                setIntakeModalOpen(true);
              }}
              data-testid="btn-intake-new"
              className="flex items-center gap-1.5"
            >
              <span>+ Tiếp nhận thiết bị</span>
            </Button>
          </div>
        </div>

        {/* Panel danh sách Compact Dense List */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <FilterBar
            searchValue={search}
            onSearchChange={(val: string) => {
              setSearch(sanitizeInputLive(val));
              setPage(1);
            }}
            searchPlaceholder="Tìm theo họ tên hoặc số điện thoại..."
          />

          {isError ? (
            <ErrorFallback onRetry={() => refetch()} />
          ) : isLoading ? (
            <CardsSkeleton count={8} />
          ) : customers.length === 0 ? (
            <EmptyState
              title="Không tìm thấy khách hàng nào"
              description="Thử tìm kiếm với số điện thoại hoặc họ tên khác."
            />
          ) : (
            <>
              <div
                data-testid="compact-customer-list"
                className="mt-3 border border-[#e5ece8] rounded-[8px] overflow-hidden divide-y divide-[#edf1ee] bg-white shadow-xs"
              >
                {customers.map((c) => (
                  <div
                    key={c.id || c.phone}
                    onClick={() => setSelectedCustomerId(c.id)}
                    data-testid={`customer-row-${c.id}`}
                    className="group flex items-center justify-between px-3 py-2 sm:px-4 hover:bg-[#f3f9f6] transition-colors cursor-pointer min-h-[48px] max-h-[52px]"
                  >
                    {/* Cột trái: Avatar 32px + Họ tên & SĐT */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <div className="w-8 h-8 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold text-xs flex items-center justify-center flex-shrink-0 border border-[#b8d7c8]">
                        {c.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            data-testid={`customer-name-${c.id}`}
                            className="font-bold text-sm text-[#111827] truncate group-hover:text-[#176b58] transition-colors"
                          >
                            {c.name}
                          </span>
                          {c.email && (
                            <span className="hidden md:inline-block text-[11px] text-[#86968f] truncate max-w-[160px]">
                              · {c.email}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-[#667a70] truncate leading-tight">
                          {c.phone}
                        </div>
                      </div>
                    </div>

                    {/* Cột phải: Chỉnh sửa + Số đơn + Tổng chi tiêu + Chevron */}
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
                      <button
                        type="button"
                        data-testid={`btn-edit-customer-${c.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(c);
                        }}
                        className="px-2 py-1 rounded-[6px] text-xs font-semibold text-[#176b58] bg-[#f0f7f3] hover:bg-[#d8ece1] border border-[#cbe3d5] transition-colors flex items-center gap-1 cursor-pointer"
                        title="Chỉnh sửa thông tin khách hàng"
                      >
                        <Icon name="edit" size={12} />
                        <span className="hidden sm:inline">Chỉnh sửa</span>
                      </button>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#eaf4ef] text-[#176b58] whitespace-nowrap">
                        {c.orders} đơn
                      </span>
                      <span className="font-bold font-mono text-xs text-[#111827] min-w-[75px] sm:min-w-[90px] text-right whitespace-nowrap">
                        {c.spent}
                      </span>
                      <svg
                        className="w-4 h-4 text-[#9ca3af] group-hover:text-[#176b58] transition-colors flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>

              {/* Thanh điều hướng phân trang (Pagination Bar) chuẩn thiết kế Calm Jade */}
              <div
                data-testid="customers-pagination-bar"
                className="mt-4 pt-3.5 border-t border-[#edf1ee] flex flex-wrap items-center justify-between gap-3 text-xs text-[#596962]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Hiển thị <b className="text-[#1c302b]">{from} - {to}</b> trên tổng{' '}
                    <b className="text-[#176b58]">{total}</b> khách hàng
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#7e8d85]">Số dòng:</span>
                    <select
                      data-testid="customers-per-page-select"
                      value={perPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPerPage(val === 'all' ? 'all' : Number(val));
                        setPage(1);
                      }}
                      className="text-xs border border-[#d8e2dc] rounded-[7px] px-2.5 py-1 bg-white text-[#1c302b] font-semibold outline-none focus:border-[#176b58] cursor-pointer"
                    >
                      <option value={15}>15 / trang</option>
                      <option value={30}>30 / trang</option>
                      <option value={50}>50 / trang</option>
                      <option value={100}>100 / trang</option>
                      <option value="all">Tất cả</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="customers-prev-page"
                    disabled={currentPage <= 1 || perPage === 'all'}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className={`px-2.5 py-1 rounded-[7px] font-semibold border transition-colors ${
                      currentPage <= 1 || perPage === 'all'
                        ? 'bg-[#f6f8f7] text-[#9ca8a2] border-[#e5ece8] cursor-not-allowed'
                        : 'bg-white text-[#1c302b] border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58] hover:border-[#b8d7c8] cursor-pointer'
                    }`}
                  >
                    Trước
                  </button>

                  {pageNumbers.map((p) => (
                    <button
                      key={p}
                      type="button"
                      data-testid={`customers-page-${p}`}
                      disabled={perPage === 'all'}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] h-7 px-2 rounded-[7px] font-bold text-xs transition-all cursor-pointer ${
                        p === currentPage
                          ? 'bg-[#176b58] text-white shadow-xs'
                          : 'bg-white text-[#4b5b53] border border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    type="button"
                    data-testid="customers-next-page"
                    disabled={currentPage >= lastPage || perPage === 'all'}
                    onClick={() => setPage((prev) => Math.min(lastPage, prev + 1))}
                    className={`px-2.5 py-1 rounded-[7px] font-semibold border transition-colors ${
                      currentPage >= lastPage || perPage === 'all'
                        ? 'bg-[#f6f8f7] text-[#9ca8a2] border-[#e5ece8] cursor-not-allowed'
                        : 'bg-white text-[#1c302b] border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58] hover:border-[#b8d7c8] cursor-pointer'
                    }`}
                  >
                    Sau
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Hồ sơ chi tiết khách hàng */}
      {selectedCustomerId && (
        <Modal
          isOpen={Boolean(selectedCustomerId)}
          onClose={() => setSelectedCustomerId(null)}
          maxWidth="lg"
          eyebrow="HỒ SƠ KHÁCH HÀNG · FIXO CRM"
          title={activeCustomer?.name || 'Chi tiết khách hàng'}
          subtitle={
            activeCustomer?.phone
              ? `Số điện thoại: ${activeCustomer.phone}${activeCustomer.email ? ` · Email: ${activeCustomer.email}` : ''}`
              : 'Thông tin hồ sơ và lịch sử tiếp nhận sửa chữa'
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCustomerId(null)}
                data-testid="modal-close-btn"
              >
                Đóng
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartIntakeForCustomer}
                data-testid="modal-intake-for-customer-btn"
                className="flex items-center gap-1.5"
              >
                <span>+ Tiếp nhận máy mới cho khách này</span>
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Header thông tin liên hệ & Action nhanh */}
            <div className="p-3.5 bg-[#fbfdfc] border border-[#dce7e1] rounded-[8px] space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold text-base flex items-center justify-center border border-[#b8d7c8] flex-shrink-0">
                    {activeCustomer?.initials || 'KH'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-[#111827]">
                        {activeCustomer?.name}
                      </span>
                      <button
                        type="button"
                        data-testid="detail-btn-edit-customer"
                        onClick={() => handleOpenEditModal(activeCustomer)}
                        className="px-2 py-0.5 rounded text-xs font-semibold text-[#176b58] bg-white border border-[#b8d7c8] hover:bg-[#eaf4ef] transition-colors cursor-pointer flex items-center gap-1"
                        title="Chỉnh sửa thông tin khách hàng"
                      >
                        <Icon name="edit" size={12} />
                        <span>Chỉnh sửa</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-sm text-[#176b58] font-semibold">
                        {activeCustomer?.phone}
                      </span>
                      {activeCustomer?.phone && (
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(activeCustomer.phone)}
                          data-testid="btn-copy-phone"
                          className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#d1ded7] text-[#416053] hover:bg-[#eaf4ef] transition-colors cursor-pointer"
                          title="Sao chép số điện thoại"
                        >
                          Sao chép
                        </button>
                      )}
                      {activeCustomer?.phone && (
                        <a
                          href={`tel:${activeCustomer.phone}`}
                          data-testid="btn-call-phone"
                          className="text-[11px] px-1.5 py-0.5 rounded bg-[#176b58] text-white hover:bg-[#135646] transition-colors cursor-pointer flex items-center gap-1"
                          title="Gọi điện ngay"
                        >
                          Gọi điện
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right text-xs text-[#667a70]">
                  <div>Ngày tạo hồ sơ: <b>{activeCustomer?.since || 'Mới đây'}</b></div>
                  {activeCustomer?.email && (
                    <div className="mt-0.5">Email: <b>{activeCustomer.email}</b></div>
                  )}
                </div>
              </div>

              {/* Dòng địa chỉ khách hàng */}
              <div className="pt-2 border-t border-[#edf3f0] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[#667a70] font-medium flex-shrink-0">Địa chỉ:</span>
                  {customerAddress ? (
                    <span
                      data-testid="customer-detail-address"
                      className="text-[#1c302b] font-medium break-words sm:truncate"
                      title={customerAddress}
                    >
                      {customerAddress}
                    </span>
                  ) : (
                    <span className="italic text-[#9ca3af]">Chưa cập nhật</span>
                  )}
                </div>
                {customerAddress && (
                  <button
                    type="button"
                    onClick={() => handleCopyAddress(customerAddress)}
                    data-testid="btn-copy-address"
                    className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#d1ded7] text-[#416053] hover:bg-[#eaf4ef] transition-colors cursor-pointer flex-shrink-0"
                    title="Sao chép địa chỉ"
                  >
                    Sao chép
                  </button>
                )}
              </div>
            </div>

            {/* 3 Thẻ thống kê nhanh */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-[8px] bg-[#f4f9f6] border border-[#cbe2d5]">
                <div className="text-[11px] font-bold text-[#176b58] uppercase tracking-wider">
                  Tổng chi tiêu
                </div>
                <div
                  data-testid="modal-stat-total-spent"
                  className="text-lg font-bold font-mono text-[#111827] mt-1"
                >
                  {detailStats.totalSpent}
                </div>
              </div>

              <div className="p-3 rounded-[8px] bg-[#f8faf9] border border-[#dbe6df]">
                <div className="text-[11px] font-bold text-[#455b51] uppercase tracking-wider">
                  Tổng số đơn sửa
                </div>
                <div
                  data-testid="modal-stat-orders-count"
                  className="text-lg font-bold font-mono text-[#111827] mt-1"
                >
                  {detailStats.orderCount} đơn
                </div>
              </div>

              <div className="p-3 rounded-[8px] bg-[#ecfdf5] border border-[#a7f3d0]">
                <div className="text-[11px] font-bold text-[#047857] uppercase tracking-wider">
                  Thiết bị đang bảo hành
                </div>
                <div
                  data-testid="modal-stat-warranties-count"
                  className="text-lg font-bold font-mono text-[#047857] mt-1"
                >
                  {detailStats.activeWarranties} máy
                </div>
              </div>
            </div>

            {/* Danh sách lịch sử đơn sửa chữa & bảo hành */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#1c302b] uppercase tracking-wider">
                  Lịch sử sửa chữa & Bảo hành
                </span>
                <span className="text-xs text-[#667a70]">
                  {activeCustomer?.repair_orders?.length || 0} lần tiếp nhận
                </span>
              </div>

              {isLoadingDetail ? (
                <div className="p-4 text-center text-xs text-[#667a70]">
                  Đang tải lịch sử sửa chữa...
                </div>
              ) : (!activeCustomer?.repair_orders || activeCustomer.repair_orders.length === 0) ? (
                <div className="p-6 text-center rounded-[8px] border border-dashed border-[#d8e3dc] bg-[#fafcfa] text-xs text-[#667a70]">
                  Khách hàng chưa có lịch sử đơn hàng nào.
                </div>
              ) : (
                <div
                  data-testid="customer-history-list"
                  className="max-h-[300px] overflow-y-auto space-y-2 pr-1"
                >
                  {activeCustomer.repair_orders.map((ord: any, idx: number) => {
                    const now = new Date();
                    const dd = String(now.getDate()).padStart(2, '0');
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const yy = String(now.getFullYear()).slice(-2);
                    const orderCode = ord.order_code || ord.id || `PC1${dd}${mm}${yy}${String(idx + 1).padStart(2, '0')}`;
                    const devName = ord.device_model?.name || ord.device || 'Thiết bị Apple';
                    const isWarrantyOrder = ord.order_type === 'warranty' || ord.orderType === 'warranty';
                    const isCodOrder = ord.order_type === 'cod' || ord.orderType === 'cod';
                    const priceVal = Number(ord.total_price || ord.estimated_price) || 0;
                    const priceFormatted =
                      priceVal > 0
                        ? new Intl.NumberFormat('vi-VN').format(priceVal) + ' ₫'
                        : (isWarrantyOrder ? '0 ₫ (Bảo hành)' : '0 ₫');

                    const dateStr = ord.created_at
                      ? new Intl.DateTimeFormat('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        }).format(new Date(ord.created_at))
                      : '—';

                    return (
                      <div
                        key={ord.id || idx}
                        data-testid={`history-order-item-${ord.id || idx}`}
                        className="p-3 rounded-[8px] border border-[#e4ede7] bg-white hover:border-[#b8d7c8] transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs text-[#176b58]">
                              {orderCode}
                            </span>
                            <span className="font-bold text-xs text-[#111827]">
                              {devName}
                            </span>
                            {ord.serial_number && (
                              <span className="font-mono text-[11px] text-[#6b7280] bg-[#f3f4f6] px-1.5 py-0.5 rounded">
                                SN: {ord.serial_number}
                              </span>
                            )}
                            {isWarrantyOrder ? (
                              <span className="text-[10px] font-bold text-[#047857] bg-[#ecfdf5] px-1.5 py-0.5 rounded border border-[#a7f3d0]">
                                Đơn bảo hành
                              </span>
                            ) : isCodOrder ? (
                              <span className="text-[10px] font-bold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded border border-[#fde68a]">
                                Đơn COD
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded border border-[#b8d7c8]">
                                Tại quầy
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#4b5563] mt-1 line-clamp-1">
                            Lỗi: <b>{ord.issue_description || ord.issue || 'Kiểm tra tổng quát'}</b>
                          </div>
                          {(ord.shipping_address || ord.shippingAddress) && (
                            <div
                              data-testid={`history-order-shipping-${ord.id || idx}`}
                              className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-[#fffbeb] text-[#92400e] border border-[#fef08a] max-w-full"
                              title={ord.shipping_address || ord.shippingAddress}
                            >
                              <span className="font-semibold flex-shrink-0">📦 Địa chỉ giao:</span>
                              <span className="font-normal truncate">
                                {ord.shipping_address || ord.shippingAddress}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex sm:flex-col sm:items-end justify-between items-center text-xs gap-1 flex-shrink-0">
                          <span className="font-bold font-mono text-[#111827]">
                            {priceFormatted}
                          </span>
                          <span className="text-[11px] text-[#6b7280]">
                            {dateStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Chỉnh sửa thông tin khách hàng */}
      {editingCustomer && (
        <Modal
          isOpen={Boolean(editingCustomer)}
          onClose={() => setEditingCustomer(null)}
          title="Chỉnh sửa thông tin khách hàng"
          eyebrow="CẬP NHẬT HỒ SƠ · FIXO CRM"
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-2.5 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingCustomer(null)}
                disabled={isSubmittingEdit}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-save-customer-edit"
                loading={isSubmittingEdit}
                disabled={isSubmittingEdit}
                onClick={handleSaveEditCustomer}
              >
                Lưu thay đổi
              </Button>
            </div>
          }
        >
          <div className="space-y-3.5">
            {editError && (
              <div className="p-3 bg-[#fbefed] border border-[#f5c7c2] rounded-[8px] text-[#bc5b52] text-xs">
                {editError}
              </div>
            )}
            <Input
              label="Họ và tên khách hàng *"
              value={editName}
              onChange={(e) => {
                setEditName(sanitizeInputLive(e.target.value));
                if (editError) setEditError(null);
              }}
              placeholder="Nhập họ và tên..."
            />
            <Input
              label="Số điện thoại *"
              value={editPhone}
              onChange={(e) => {
                setEditPhone(sanitizeInputLive(e.target.value));
                if (editError) setEditError(null);
              }}
              placeholder="Nhập số điện thoại..."
            />
            <Input
              label="Email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="example@gmail.com"
            />
            <Textarea
              label="Địa chỉ"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
              rows={2}
            />
          </div>
        </Modal>
      )}

      {/* Intake Wizard Modal khi người dùng bấm + Tiếp nhận thiết bị hoặc Tiếp nhận cho khách này */}
      <IntakeWizardModal
        isOpen={intakeModalOpen}
        onClose={() => {
          setIntakeModalOpen(false);
          setNewIntakeCustomer(null);
        }}
        initialCustomerName={newIntakeCustomer?.name}
        initialCustomerPhone={newIntakeCustomer?.phone}
        onSuccess={() => {
          refetch();
        }}
      />
    </AppShell>
  );
}
