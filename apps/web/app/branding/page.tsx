'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Icon, useToast } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import {
  tenantService,
} from '@podscare/api-client';
import { ThermalK80Receipt } from '../components/print/ThermalK80Receipt';
import { A4ReceiptTemplate } from '../components/print/A4ReceiptTemplate';
import { useSilentPrint } from '../components/print/useSilentPrint';
import type { RepairOrder } from '@podscare/types';

const SAMPLE_DEMO_ORDER: RepairOrder = {
  id: 'PC26-88888',
  name: 'Nguyễn Văn An',
  phone: '0912 345 678',
  device: 'AirPods Pro 2 (USB-C)',
  serial: 'H1K23L4M9P',
  issue: 'Pin tai trái tụt nhanh, rè nhẹ khi bật ANC',
  price: 650000,
  branch: 'Chi nhánh Trung tâm',
  date: new Date().toLocaleDateString('vi-VN'),
  createdBy: 'KTV Kỹ thuật',
  tech: 'KTV Kỹ thuật',
  status: 'Đang sửa',
  statusType: 'progress',
  checks: [
    { label: 'Ngoại quan / Vỏ case', status: 'Hoạt động' },
    { label: 'Chống ồn ANC / Xuyên âm', status: 'Lỗi' },
    { label: 'Micro đàm thoại', status: 'Hoạt động' },
    { label: 'Thời lượng Pin > 3h', status: 'Lỗi' },
  ],
  testNote: 'Pin tai L chai còn 42%, thay cell pin pin zin chính hãng.',
};

export default function TenantBrandingPage() {
  const { toast } = useToast();
  const { currentUser, role } = usePodsCare();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);

  // Form state
  const [storeName, setStoreName] = useState('');
  const [hotline, setHotline] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Preview format switch
  const [previewFormat, setPreviewFormat] = useState<'k80' | 'a4'>('k80');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { printReceipt, isPrinting } = useSilentPrint();

  const isAdmin = role === 'admin' || currentUser?.role === 'admin';

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantService.getSettings();
      if (res?.success && res.data) {
        setStoreName(res.data.name || '');
        setHotline(res.data.hotline || '');
        setFooterNote(res.data.receipt_footer_note || '');
        setLogoUrl(res.data.logo_url || null);
      }
    } catch (err: any) {
      console.error('Failed to load branding settings:', err);
      // Fallback from currentUser.tenant if available
      if (currentUser?.tenant) {
        setStoreName(currentUser.tenant.name || '');
        setHotline(currentUser.tenant.hotline || '');
        setFooterNote(currentUser.tenant.receipt_footer_note || '');
        setLogoUrl(currentUser.tenant.logo_url || null);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast('Chỉ Quản trị viên cửa hàng (Store Admin) mới có quyền lưu cấu hình.', 'error');
      return;
    }

    if (footerNote.length > 255) {
      toast('Lời dặn chân trang không được vượt quá 255 ký tự.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await tenantService.updateSettings({
        name: storeName.trim() || undefined,
        hotline: hotline.trim() || null,
        receipt_footer_note: footerNote.trim() || null,
      });

      if (res?.success) {
        toast('Đã lưu cấu hình thương hiệu và mẫu in thành công!', 'success');
        if (res.data) {
          setStoreName(res.data.name || '');
          setHotline(res.data.hotline || '');
          setFooterNote(res.data.receipt_footer_note || '');
        }
      } else {
        toast(res?.message || 'Có lỗi khi lưu cấu hình.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Không thể lưu cấu hình đến máy chủ.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessFile = async (file: File) => {
    if (!isAdmin) {
      toast('Chỉ Quản trị viên mới có quyền tải logo lên.', 'error');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast('Định dạng ảnh không hợp lệ. Vui lòng chọn PNG, JPG, SVG hoặc WEBP.', 'error');
      return;
    }

    // 2MB size limit
    if (file.size > 2 * 1024 * 1024) {
      toast('Dung lượng ảnh vượt quá 2MB. Vui lòng nén ảnh và thử lại.', 'error');
      return;
    }

    setUploadingLogo(true);
    try {
      const res = await tenantService.uploadLogo(file);
      if (res?.success && res.data?.logo_url) {
        setLogoUrl(res.data.logo_url);
        toast('Tải logo thương hiệu lên thành công!', 'success');
      } else {
        toast(res?.message || 'Không thể tải logo lên.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Lỗi khi tải logo lên máy chủ.', 'error');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDeleteLogo = async () => {
    if (!isAdmin) {
      toast('Chỉ Quản trị viên mới có quyền gỡ logo.', 'error');
      return;
    }

    setDeletingLogo(true);
    try {
      const res = await tenantService.deleteLogo();
      if (res?.success) {
        setLogoUrl(null);
        toast('Đã gỡ logo cửa hàng. Mẫu in sẽ sử dụng nhận diện FIXO mặc định.', 'success');
      } else {
        toast(res?.message || 'Không thể gỡ logo.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Lỗi khi gỡ logo khỏi máy chủ.', 'error');
    } finally {
      setDeletingLogo(false);
    }
  };

  const handleTestPrint = () => {
    const branding = {
      logoUrl,
      storeName: storeName || 'Tên Cửa Hàng',
      hotline: hotline || undefined,
      footerNote: footerNote || undefined,
    };

    printReceipt(SAMPLE_DEMO_ORDER, previewFormat, {
      slipMode: 'dual',
      branding,
    });
  };

  const liveBranding = {
    logoUrl,
    storeName: storeName || 'Tên Cửa Hàng',
    hotline: hotline || undefined,
    footerNote: footerNote || undefined,
  };

  return (
    <AppShell crumbName="Thương hiệu & Mẫu in">
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Header Banner */}
        <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-[#176b58] bg-[#e8f5f1] px-2.5 py-1 rounded-full uppercase tracking-wider inline-block mb-2">
                NHẬN DIỆN THƯƠNG HIỆU &amp; IN ẤN
              </span>
              <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-[#1c302b] m-0">
                Cấu hình Logo Cửa hàng &amp; Mẫu phiếu in
              </h1>
              <p className="text-xs sm:text-sm text-[#5c6e66] mt-1 max-w-2xl leading-relaxed mb-0">
                Tùy biến Logo riêng của tiệm, Hotline liên hệ và Lời dặn bảo hành chân trang trên toàn bộ hóa đơn K80 nhiệt &amp; khổ A4. Mọi phiếu in luôn được bảo chứng bởi <strong>⚡ Powered by FIXO Repair OS</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestPrint}
                disabled={isPrinting}
                className="text-xs font-bold border-[#b8d0c5] hover:bg-[#f0f8f4] text-[#176b58]"
              >
                <span>🖨️</span>
                <span>{isPrinting ? 'Đang gửi lệnh in...' : `In thử mẫu ${previewFormat.toUpperCase()}`}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Warning if not Admin */}
        {!isAdmin && (
          <div className="p-4 rounded-[12px] bg-[#fff8e6] border border-[#fae29f] text-xs text-[#8a6100] flex items-center gap-3">
            <Icon name="alert" size={18} className="shrink-0 text-[#b58105]" />
            <span>
              <strong>Chế độ xem:</strong> Bạn đang đăng nhập với vai trò không phải Quản trị viên cửa hàng (Store Admin). Bạn có thể xem trước mẫu in nhưng không thể thay đổi thông tin thương hiệu.
            </span>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form & Upload Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Card 1: Logo Upload & Management */}
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#eef3f0] mb-4">
                <div>
                  <h2 className="text-sm font-heading font-bold text-[#1c302b] m-0 flex items-center gap-2">
                    <span className="text-base">🖼️</span>
                    <span>Logo Cửa hàng (Store Brand Logo)</span>
                  </h2>
                  <p className="text-xs text-[#5c6e66] m-0 mt-0.5">
                    Hiển thị ở đầu phiếu K80 (tối đa 42mm x 24mm) và A4 (tối đa 48mm x 28mm).
                  </p>
                </div>
                {logoUrl && (
                  <span className="text-[10px] bg-[#e8f5f1] text-[#176b58] font-bold px-2 py-0.5 rounded-full">
                    Đã cài đặt
                  </span>
                )}
              </div>

              {/* Logo Preview & Dropzone */}
              <div className="space-y-4">
                {logoUrl ? (
                  <div className="p-4 rounded-[12px] bg-[#f9faf9] border border-[#e5ece8] flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-16 rounded-[8px] bg-white border border-[#d2ded8] flex items-center justify-center p-2 overflow-hidden shadow-xs">
                        <img
                          src={logoUrl}
                          alt="Logo cửa hàng"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#1c302b]">Logo hiện tại của tiệm</div>
                        <div className="text-[11px] text-[#6b7c74] mt-0.5">Đang áp dụng trên tất cả bản in K80 &amp; A4</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo || !isAdmin}
                        className="text-xs"
                      >
                        Đổi logo khác
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteLogo}
                        disabled={deletingLogo || !isAdmin}
                        className="text-xs text-[#c0392b] border-[#f5c6cb] hover:bg-[#fdf2f2]"
                      >
                        {deletingLogo ? 'Đang gỡ...' : 'Gỡ logo'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => isAdmin && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-[12px] p-6 text-center transition-all ${
                      isDragOver
                        ? 'border-[#176b58] bg-[#f0f8f4]'
                        : 'border-[#d2ded8] hover:border-[#176b58] bg-[#fbfcfb] cursor-pointer'
                    }`}
                  >
                    <div className="w-12 h-12 mx-auto rounded-full bg-[#e8f5f1] text-[#176b58] flex items-center justify-center mb-2">
                      <Icon name="plus" size={20} />
                    </div>
                    <div className="text-xs font-bold text-[#1c302b]">
                      Kéo thả ảnh logo vào đây hoặc bấm để chọn tệp
                    </div>
                    <div className="text-[11px] text-[#6b7c74] mt-1">
                      Hỗ trợ PNG, JPG, SVG, WEBP (Dung lượng tối đa 2MB). Khuyến nghị ảnh nền trong suốt PNG hoặc SVG tỷ lệ ngang.
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="text-[11px] text-[#718279] bg-[#f0f5f2] p-2.5 rounded-[8px] flex items-start gap-2">
                  <span className="text-xs">💡</span>
                  <span>
                    Nếu không tải logo riêng, hệ thống sẽ tự động dùng biểu tượng <strong>FIXO REPAIR OS</strong> tiêu chuẩn làm logo mặc định.
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Store Receipt Details Form */}
            <form onSubmit={handleSaveSettings} className="rounded-[16px] bg-white border border-[#e5ece8] p-6 shadow-xs space-y-4">
              <div className="pb-3 border-b border-[#eef3f0]">
                <h2 className="text-sm font-heading font-bold text-[#1c302b] m-0 flex items-center gap-2">
                  <span className="text-base">📝</span>
                  <span>Thông tin hiển thị trên mẫu phiếu</span>
                </h2>
                <p className="text-xs text-[#5c6e66] m-0 mt-0.5">
                  Các thông tin này sẽ xuất hiện trên tiêu đề và phần chân trang của phiếu giao khách.
                </p>
              </div>

              {/* Store Name Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#2a3c36] block">
                  Tên Cửa hàng / Thương hiệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ví dụ: iFix Center - Chuyên sửa chữa Apple"
                  disabled={!isAdmin || loading}
                  className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                  required
                />
                <span className="text-[10px] text-[#718279] block">
                  Hiển thị đậm nét ngay dưới logo cửa hàng trên phiếu in.
                </span>
              </div>

              {/* Hotline Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#2a3c36] block">
                  Hotline / Số điện thoại liên hệ
                </label>
                <input
                  type="text"
                  value={hotline}
                  onChange={(e) => setHotline(e.target.value)}
                  placeholder="Ví dụ: 0988.777.666 hoặc 1900 8888"
                  disabled={!isAdmin || loading}
                  className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                />
                <span className="text-[10px] text-[#718279] block">
                  Giúp khách hàng nhanh chóng gọi cho tiệm khi cần hỏi tiến độ hoặc hỗ trợ.
                </span>
              </div>

              {/* Footer Note Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#2a3c36]">
                    Lời dặn / Ghi chú bảo hành chân trang
                  </label>
                  <span className={`text-[10px] ${footerNote.length > 255 ? 'text-red-600 font-bold' : 'text-[#718279]'}`}>
                    {footerNote.length}/255 ký tự
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  placeholder="Ví dụ: Bảo hành 1 đổi 1 linh kiện trong 30 ngày. Quý khách vui lòng giữ phiếu này khi đến nhận máy."
                  disabled={!isAdmin || loading}
                  className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white leading-relaxed resize-none"
                />
                <span className="text-[10px] text-[#718279] block">
                  In ở phần chân phiếu giao khách hàng, trước dòng co-branding của nền tảng.
                </span>
              </div>

              {/* Co-branding info banner */}
              <div className="p-3 rounded-[10px] bg-[#f7faf8] border border-[#dce7e1] text-[11px] text-[#4d6359] flex items-center gap-2.5">
                <span className="text-base">⚡</span>
                <div>
                  <strong>Nhận diện Co-branding nền tảng:</strong> Dòng chữ <em>&ldquo;⚡ Powered by FIXO Repair OS · fixo.vn&rdquo;</em> được tự động in ở đáy trang để định danh công nghệ quản lý chuẩn mực.
                </div>
              </div>

              {/* Submit Button */}
              {isAdmin && (
                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={saving || loading}
                    className="font-bold text-xs px-6 bg-[#176b58] hover:bg-[#0e4b3d]"
                  >
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
                </div>
              )}
            </form>
          </div>

          {/* Right Column: Live Sticky Print Preview (5 cols) */}
          <div className="lg:col-span-5 sticky top-6 space-y-3">
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#eef3f0]">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">👁️</span>
                  <span className="text-xs font-heading font-bold text-[#1c302b]">
                    Xem trước trực quan Realtime
                  </span>
                </div>

                {/* Tab toggle: K80 vs A4 */}
                <div className="flex items-center bg-[#f0f4f2] p-0.5 rounded-[8px]">
                  <button
                    type="button"
                    onClick={() => setPreviewFormat('k80')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-[6px] transition-all ${
                      previewFormat === 'k80'
                        ? 'bg-[#176b58] text-white shadow-xs'
                        : 'text-[#5c6e66] hover:text-[#1c302b]'
                    }`}
                  >
                    Cuộn K80
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFormat('a4')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-[6px] transition-all ${
                      previewFormat === 'a4'
                        ? 'bg-[#176b58] text-white shadow-xs'
                        : 'text-[#5c6e66] hover:text-[#1c302b]'
                    }`}
                  >
                    Khổ A4
                  </button>
                </div>
              </div>

              {/* Preview Paper Simulation */}
              <div className="bg-[#525659] p-3 sm:p-4 rounded-[12px] overflow-auto max-h-[720px] flex justify-center">
                {previewFormat === 'k80' ? (
                  <div className="w-full max-w-[320px] bg-white shadow-2xl p-2 rounded-sm transform origin-top transition-transform">
                    <ThermalK80Receipt
                      order={SAMPLE_DEMO_ORDER}
                      slipMode="dual"
                      branding={liveBranding}
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-[480px] bg-white shadow-2xl p-3 rounded-sm transform origin-top transition-transform scale-[0.85] sm:scale-100">
                    <A4ReceiptTemplate
                      order={SAMPLE_DEMO_ORDER}
                      branding={liveBranding}
                    />
                  </div>
                )}
              </div>

              <div className="mt-2.5 text-center text-[10px] text-[#718279]">
                Mẫu in mô phỏng trực tiếp dữ liệu bạn vừa nhập. Bấm &quot;In thử mẫu&quot; để gửi lệnh in tới máy quầy.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
