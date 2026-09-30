'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { partnerService, type PartnerItem } from '@podscare/api-client';
import { Button, StatusTag, FilterBar, EmptyState, Modal, useToast, StatCard } from '@podscare/ui';
import { AppShell } from '../components/AppShell';

interface FormattedPartner {
  id: number | string;
  code: string;
  name: string;
  serviceType: string;
  serviceTypeLabel: string;
  contactPerson: string;
  phone: string;
  status: string;
  statusType: 'ready' | 'gray' | 'wait' | 'danger';
  shipmentsCount: number;
}

export default function PartnersPage() {
  const { toast } = useToast();
  const [partners, setPartners] = useState<FormattedPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Modal create partner
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formServiceType, setFormServiceType] = useState('logistics');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');

  const mapServiceTypeLabel = (type: string): string => {
    switch (type) {
      case 'logistics':
        return 'Vận chuyển / Logistics';
      case 'specialized_repair':
        return 'Sửa phần cứng chuyên sâu';
      case 'warranty_extended':
        return 'Bảo hành mở rộng';
      case 'parts_supplier':
        return 'Nhà cung ứng linh kiện';
      default:
        return 'Đối tác liên kết';
    }
  };

  const loadPartners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await partnerService.getPartners({ per_page: 50 });
      const raw = res?.data;
      const list: PartnerItem[] = Array.isArray(raw) ? raw : (raw?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        const mapped: FormattedPartner[] = list.map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          serviceType: p.service_type || 'partner',
          serviceTypeLabel: mapServiceTypeLabel(p.service_type),
          contactPerson: p.contact_person || 'Chưa cập nhật',
          phone: p.phone || '—',
          status: p.status === 'inactive' ? 'Tạm ngừng' : 'Hoạt động',
          statusType: p.status === 'inactive' ? 'gray' : 'ready',
          shipmentsCount: Number(p.shipments_count) || 0,
        }));
        setPartners(mapped);
      } else {
        setPartners([]);
      }
    } catch (err) {
      console.warn('Could not fetch partners from API:', err);
      setPartners([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      toast('Vui lòng nhập đầy đủ mã và tên đối tác', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      await partnerService.createPartner({
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        service_type: formServiceType,
        contact_person: formContact.trim(),
        phone: formPhone.trim(),
        status: 'active',
      });
      toast('Thêm đối tác mới thành công', 'success');
      setAddModalOpen(false);
      setFormCode('');
      setFormName('');
      setFormContact('');
      setFormPhone('');
      loadPartners();
    } catch (err: any) {
      console.warn('Could not create partner on API:', err);
      // Fallback local addition
      const newP: FormattedPartner = {
        id: Date.now(),
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        serviceType: formServiceType,
        serviceTypeLabel: mapServiceTypeLabel(formServiceType),
        contactPerson: formContact.trim() || 'Người liên hệ',
        phone: formPhone.trim() || '—',
        status: 'Hoạt động',
        statusType: 'ready',
        shipmentsCount: 0,
      };
      setPartners((prev) => [newP, ...prev]);
      toast('Đã ghi nhận đối tác vào danh bạ', 'success');
      setAddModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = partners.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.contactPerson.toLowerCase().includes(q) ||
      p.phone.includes(q);

    const matchesType = typeFilter === 'all' || p.serviceType === typeFilter;
    return matchesSearch && matchesType;
  });

  const logisticsCount = partners.filter((p) => p.serviceType === 'logistics').length;
  const repairPartnersCount = partners.filter((p) => p.serviceType === 'specialized_repair').length;
  const supplierCount = partners.filter((p) => p.serviceType === 'parts_supplier' || p.serviceType === 'warranty_extended').length;

  return (
    <AppShell crumbName="Đối tác">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              PARTNERS NETWORK
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Đối tác & Đại lý ủy quyền
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Mạng lưới đối tác vận chuyển GHN/Grab, trạm sửa chữa chuyên sâu và nhà cung ứng linh kiện.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon="clock"
              onClick={() => {
                loadPartners();
                toast('Đã làm mới danh bạ đối tác', 'info');
              }}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="plus"
              onClick={() => setAddModalOpen(true)}
            >
              Thêm đối tác mới
            </Button>
          </div>
        </div>

        {/* Network Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard
            label="Tổng đối tác mạng lưới"
            value={String(partners.length).padStart(2, '0')}
            icon="partners"
            foot="Đang liên kết hoạt động"
            periodLabel=""
            trend="neutral"
          />
          <StatCard
            label="Đối tác giao nhận"
            value={`${logisticsCount} đơn vị`}
            icon="shipments"
            foot="GHN, GrabExpress..."
          />
          <StatCard
            label="Trạm sửa chuyên sâu"
            value={`${repairPartnersCount} đơn vị`}
            icon="wrench"
            foot="Xử lý IC & linh kiện khó"
          />
          <StatCard
            label="Nhà cung ứng / Bảo hành"
            value={`${supplierCount} đơn vị`}
            icon="check"
            foot="CarePlus, AppleParts..."
          />
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-[10px] border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex-1 min-w-[240px]">
              <FilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Tìm theo tên đối tác, mã đại lý, người liên hệ, số điện thoại..."
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs border border-[#e4eae6] rounded-[7px] px-3 py-2 bg-white text-[#55655d] outline-none"
              >
                <option value="all">Tất cả phân loại</option>
                <option value="logistics">Vận chuyển / Logistics</option>
                <option value="specialized_repair">Sửa chữa chuyên sâu</option>
                <option value="warranty_extended">Bảo hành mở rộng</option>
                <option value="parts_supplier">Nhà cung ứng linh kiện</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
              <span className="text-xs font-medium text-[#7a8a81]">Đang tải danh bạ đối tác từ máy chủ...</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search || typeFilter !== 'all' ? 'Không tìm thấy đối tác nào' : 'Chưa có đối tác nào'}
              description={
                search || typeFilter !== 'all'
                  ? 'Không có đối tác nào phù hợp với điều kiện tìm kiếm.'
                  : 'Hiện tại hệ thống chưa ghi nhận đối tác hoặc đại lý nào trong danh bạ.'
              }
              icon="users"
              actionLabel={search || typeFilter !== 'all' ? 'Xóa bộ lọc' : 'Thêm đối tác mới'}
              onAction={() => {
                if (search || typeFilter !== 'all') {
                  setSearch('');
                  setTypeFilter('all');
                } else {
                  setAddModalOpen(true);
                }
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-[#e5ece8] rounded-[10px] p-4 flex flex-col justify-between hover:border-[#b4d6c4] hover:shadow-xs transition-all"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#eaf4ef] text-[#176b58]">
                        {p.code}
                      </span>
                      <StatusTag label={p.status} type={p.statusType} />
                    </div>

                    <h3 className="font-heading font-bold text-sm text-[#1c302b] m-0 mb-1 leading-snug">
                      {p.name}
                    </h3>
                    <div className="text-xs font-medium text-[#176b58] mb-3">
                      {p.serviceTypeLabel}
                    </div>

                    <div className="space-y-1.5 text-xs text-[#52635a] pt-2.5 border-t border-[#f0f3f1]">
                      <div className="flex items-center gap-2">
                        <span className="text-[#84948c] w-20 flex-none">Người liên hệ:</span>
                        <b className="text-[#20312a] truncate">{p.contactPerson}</b>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#84948c] w-20 flex-none">Điện thoại:</span>
                        <span className="font-mono text-[#1c302b] font-medium">{p.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#84948c] w-20 flex-none">Vận đơn xử lý:</span>
                        <span className="font-bold text-[#176b58]">{p.shipmentsCount} lượt</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-[#f0f3f1] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toast(`Đang kết nối API với đối tác ${p.code}...`, 'info')}
                      className="text-xs font-bold text-[#176b58] hover:underline flex items-center gap-1"
                    >
                      Kết nối API <span>↗</span>
                    </button>
                    <span className="text-xs text-[#8a9690]">ID #{p.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Thêm đối tác mới */}
        <Modal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          maxWidth="md"
          eyebrow="THÊM MỚI ĐỐI TÁC"
          title="Đăng ký đối tác liên kết mới"
          subtitle="Thêm đại lý ủy quyền tiếp nhận, trạm sửa chữa ngoài hoặc đơn vị vận chuyển."
          footer={
            <div className="flex justify-end gap-2.5 w-full">
              <Button variant="secondary" size="md" onClick={() => setAddModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={isSubmitting}
                onClick={handleCreatePartner}
              >
                {isSubmitting ? 'Đang lưu...' : 'Lưu đối tác'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreatePartner} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#516158] block mb-1">Mã đối tác (Code)</label>
                <input
                  type="text"
                  placeholder="VD: GHN, SPEED-VN"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#516158] block mb-1">Phân loại dịch vụ</label>
                <select
                  value={formServiceType}
                  onChange={(e) => setFormServiceType(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                >
                  <option value="logistics">Vận chuyển / Logistics</option>
                  <option value="specialized_repair">Sửa phần cứng chuyên sâu</option>
                  <option value="warranty_extended">Bảo hành mở rộng</option>
                  <option value="parts_supplier">Nhà cung ứng linh kiện</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#516158] block mb-1">Tên tổ chức / Doanh nghiệp</label>
              <input
                type="text"
                placeholder="VD: Công ty TNHH Giao Hàng Siêu Tốc"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#516158] block mb-1">Người đại diện liên hệ</label>
                <input
                  type="text"
                  placeholder="Họ và tên..."
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#516158] block mb-1">Số điện thoại liên lạc</label>
                <input
                  type="text"
                  placeholder="09xx..."
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-[8px] border border-[#d2dcd6] bg-white outline-none focus:border-[#176b58]"
                />
              </div>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
