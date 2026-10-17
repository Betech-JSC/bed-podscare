'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Icon, useToast } from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import {
  tenantService,
  type TelegramRecipientItem,
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
  const { currentUser, role, updateTenantBranding, branches } = usePodsCare();
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);

  // Form state
  const [storeName, setStoreName] = useState('');
  const [hotline, setHotline] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bankCode, setBankCode] = useState('MB');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  // Telegram Recipients state
  const [telegramRecipients, setTelegramRecipients] = useState<TelegramRecipientItem[]>([]);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [syncingTelegram, setSyncingTelegram] = useState(false);
  const [addingTelegram, setAddingTelegram] = useState(false);
  const [testingRecipientId, setTestingRecipientId] = useState<number | null>(null);
  const [togglingRecipientId, setTogglingRecipientId] = useState<number | null>(null);
  const [deletingRecipientId, setDeletingRecipientId] = useState<number | null>(null);

  const [tgLabel, setTgLabel] = useState('');
  const [tgPhone, setTgPhone] = useState('');
  const [tgBranchId, setTgBranchId] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [showAdvancedTg, setShowAdvancedTg] = useState(false);

  // Preview format switch
  const [previewFormat, setPreviewFormat] = useState<'k80' | 'a4'>('k80');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { printReceipt, isPrinting } = useSilentPrint();

  const isAdmin = role === 'admin' || currentUser?.role === 'admin';

  const toUpperNoDiacritics = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase();
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantService.getSettings();
      if (res?.success && res.data) {
        setStoreName(res.data.name || '');
        setHotline(res.data.hotline || '');
        setFooterNote(res.data.receipt_footer_note || '');
        setLogoUrl(res.data.logo_url || null);
        setBankCode(res.data.bank_code || 'MB');
        setBankAccountNumber(res.data.bank_account_number || '');
        setBankAccountHolder(res.data.bank_account_holder || '');
        updateTenantBranding(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load branding settings:', err);
      // Fallback from currentUser.tenant if available
      const fallbackTenant = currentUserRef.current?.tenant;
      if (fallbackTenant) {
        setStoreName(fallbackTenant.name || '');
        setHotline(fallbackTenant.hotline || '');
        setFooterNote(fallbackTenant.receipt_footer_note || '');
        setLogoUrl(fallbackTenant.logo_url || null);
        setBankCode((fallbackTenant as any).bank_code || 'MB');
        setBankAccountNumber((fallbackTenant as any).bank_account_number || '');
        setBankAccountHolder((fallbackTenant as any).bank_account_holder || '');
      }
    } finally {
      setLoading(false);
    }
  }, [updateTenantBranding]);

  const loadTelegramRecipients = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingTelegram(true);
    try {
      const res = await tenantService.getTelegramRecipients();
      if (res?.success && Array.isArray(res.data)) {
        setTelegramRecipients(res.data);
      }
    } catch (err) {
      console.error('Failed to load telegram recipients:', err);
    } finally {
      setLoadingTelegram(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadTelegramRecipients();
  }, [loadTelegramRecipients]);

  const hasPendingTelegram = telegramRecipients.some(
    (item) => item.is_active && (!item.telegram_chat_id || item.telegram_chat_id.trim() === '')
  );

  useEffect(() => {
    if (!isAdmin || !hasPendingTelegram) return;

    let isMounted = true;
    let isSyncing = false;

    const silentSync = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        const res = await tenantService.syncTelegramRecipients();
        if (!isMounted || !res?.success || !res.data) return;

        const nextRecipients = Array.isArray(res.data.recipients) ? res.data.recipients : [];
        const newlyConnected = nextRecipients.some((nextItem) => {
          const hasChatIdNow = Boolean(
            nextItem.telegram_chat_id && nextItem.telegram_chat_id.trim() !== ''
          );
          if (!hasChatIdNow) return false;
          const prevItem = telegramRecipients.find((p) => p.id === nextItem.id);
          const hadChatIdBefore = Boolean(
            prevItem?.telegram_chat_id && prevItem.telegram_chat_id.trim() !== ''
          );
          return !hadChatIdBefore;
        });

        if ((res.data.synced_count ?? 0) > 0 || newlyConnected) {
          if (nextRecipients.length > 0) {
            setTelegramRecipients(nextRecipients);
          }
          toast('Đã tự động kết nối Telegram thành công!', 'success');
        }
      } catch {
        // Bỏ qua lỗi khi đồng bộ ngầm để không làm gián đoạn trải nghiệm
      } finally {
        isSyncing = false;
      }
    };

    const intervalId = window.setInterval(silentSync, 3000);
    const handleFocus = () => {
      silentSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAdmin, hasPendingTelegram, telegramRecipients, toast]);

  const handleAddTelegramRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast('Chỉ Quản trị viên cửa hàng mới có quyền thêm số điện thoại nhận thông báo.', 'error');
      return;
    }

    if (!tgLabel.trim() || !tgPhone.trim()) {
      toast('Vui lòng nhập đầy đủ Tên gợi nhớ và Số điện thoại.', 'error');
      return;
    }

    setAddingTelegram(true);
    try {
      const res = await tenantService.createTelegramRecipient({
        label: tgLabel.trim(),
        phone: tgPhone.trim(),
        branch_id: tgBranchId ? Number(tgBranchId) : null,
        target_role: 'admin',
        telegram_chat_id: tgChatId.trim() || null,
        is_active: true,
      });

      if (res?.success && res.data) {
        setTelegramRecipients((prev) => [res.data!, ...prev]);
        setTgLabel('');
        setTgPhone('');
        setTgBranchId('');
        setTgChatId('');
        setShowAdvancedTg(false);
        toast('Đã thêm số điện thoại nhận thông báo Telegram!', 'success');
      } else {
        toast(res?.message || 'Không thể thêm số điện thoại.', 'error');
      }
    } catch (err: any) {
      toast(err?.data?.message || err?.message || 'Lỗi khi thêm số điện thoại nhận thông báo.', 'error');
    } finally {
      setAddingTelegram(false);
    }
  };

  const handleSyncTelegram = async () => {
    if (!isAdmin) return;
    setSyncingTelegram(true);
    try {
      const res = await tenantService.syncTelegramRecipients();
      if (res?.success && res.data) {
        if (Array.isArray(res.data.recipients)) {
          setTelegramRecipients(res.data.recipients);
        } else {
          await loadTelegramRecipients();
        }
        const count = res.data.synced_count ?? 0;
        if (count > 0) {
          toast(`Đã đồng bộ kết nối thành công ${count} số điện thoại!`, 'success');
        } else {
          toast(res.message || 'Đã kiểm tra đồng bộ. Chưa phát hiện lượt bấm Start mới trên Telegram.', 'info');
        }
      } else {
        toast(res?.message || 'Không thể đồng bộ kết nối Telegram.', 'error');
      }
    } catch (err: any) {
      toast(err?.data?.message || err?.message || 'Lỗi khi đồng bộ với Telegram Bot.', 'error');
    } finally {
      setSyncingTelegram(false);
    }
  };

  const handleToggleTelegramRecipient = async (item: TelegramRecipientItem) => {
    if (!isAdmin) return;
    setTogglingRecipientId(item.id);
    try {
      const nextActive = !item.is_active;
      const res = await tenantService.updateTelegramRecipient(item.id, {
        is_active: nextActive,
      });
      if (res?.success && res.data) {
        setTelegramRecipients((prev) =>
          prev.map((r) => (r.id === item.id ? res.data! : r))
        );
        toast(
          nextActive
            ? `Đã bật thông báo cho ${item.label}.`
            : `Đã tạm tắt thông báo cho ${item.label}.`,
          'success'
        );
      } else {
        toast(res?.message || 'Không thể cập nhật trạng thái.', 'error');
      }
    } catch (err: any) {
      toast(err?.data?.message || err?.message || 'Lỗi khi cập nhật trạng thái.', 'error');
    } finally {
      setTogglingRecipientId(null);
    }
  };

  const handleTestTelegramRecipient = async (item: TelegramRecipientItem) => {
    if (!isAdmin) return;
    setTestingRecipientId(item.id);
    try {
      const res = await tenantService.testTelegramRecipient(item.id);
      if (res?.success) {
        toast(res.message || `Đã gửi tin nhắn thử nghiệm tới ${item.label}!`, 'success');
      } else {
        toast(res?.message || 'Gửi tin nhắn thử nghiệm thất bại.', 'error');
      }
    } catch (err: any) {
      toast(err?.data?.message || err?.message || 'Không thể gửi tin nhắn thử nghiệm.', 'error');
    } finally {
      setTestingRecipientId(null);
    }
  };

  const handleDeleteTelegramRecipient = async (item: TelegramRecipientItem) => {
    if (!isAdmin) return;
    setDeletingRecipientId(item.id);
    try {
      const res = await tenantService.deleteTelegramRecipient(item.id);
      if (res?.success) {
        setTelegramRecipients((prev) => prev.filter((r) => r.id !== item.id));
        toast(`Đã xóa số điện thoại ${item.phone} (${item.label}).`, 'success');
      } else {
        toast(res?.message || 'Không thể xóa số điện thoại.', 'error');
      }
    } catch (err: any) {
      toast(err?.data?.message || err?.message || 'Lỗi khi xóa số điện thoại.', 'error');
    } finally {
      setDeletingRecipientId(null);
    }
  };

  const handleCopyConnectUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã sao chép đường dẫn kết nối Telegram!', 'success');
    } catch {
      toast('Không thể sao chép tự động. Vui lòng mở trực tiếp link.', 'error');
    }
  };

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
        bank_code: bankCode.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_account_holder: bankAccountHolder.trim() || null,
      });

      if (res?.success) {
        toast('Đã lưu cấu hình thương hiệu và tài khoản ngân hàng thành công!', 'success');
        if (res.data) {
          setStoreName(res.data.name || '');
          setHotline(res.data.hotline || '');
          setFooterNote(res.data.receipt_footer_note || '');
          setBankCode(res.data.bank_code || 'MB');
          setBankAccountNumber(res.data.bank_account_number || '');
          setBankAccountHolder(res.data.bank_account_holder || '');
          updateTenantBranding(res.data);
        } else {
          updateTenantBranding({
            name: storeName.trim() || undefined,
            hotline: hotline.trim() || null,
            receipt_footer_note: footerNote.trim() || null,
            bank_code: bankCode.trim() || null,
            bank_account_number: bankAccountNumber.trim() || null,
            bank_account_holder: bankAccountHolder.trim() || null,
          });
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
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

    // Khóa dung lượng ảnh tối đa 5MB (khuyến nghị 2 * 1024 * 1024)
    if (file.size > 5 * 1024 * 1024) {
      toast('Dung lượng ảnh vượt quá 5MB. Vui lòng nén ảnh và thử lại.', 'error');
      return;
    }

    setUploadingLogo(true);
    try {
      let res;
      let usedFallback = false;

      // 1. Thử gửi file nhị phân qua Multipart FormData chuẩn
      try {
        res = await tenantService.uploadLogo(file);
      } catch (uploadErr: any) {
        // Fallback tự động sang Base64 Data URL nếu Multipart gặp sự cố (Proxy, encoding, network)
        console.warn('Multipart upload failed, attempting automatic Base64 fallback:', uploadErr);
        usedFallback = true;
        const base64Data = await fileToBase64(file);
        res = await tenantService.uploadLogo(base64Data);
      }

      // 2. Nếu response không báo success nhưng cũng chưa throw exception, thử fallback Base64
      if (!res?.success && !usedFallback) {
        try {
          const base64Data = await fileToBase64(file);
          res = await tenantService.uploadLogo(base64Data);
        } catch {
          // Giữ lỗi ban đầu nếu fallback cũng không thành công
        }
      }

      if (res?.success && res.data?.logo_url) {
        setLogoUrl(res.data.logo_url);
        updateTenantBranding({ logo_url: res.data.logo_url });
        toast('Tải logo thương hiệu lên thành công!', 'success');
      } else {
        const errorMsg =
          (res as any)?.errors?.logo?.[0] ||
          res?.message ||
          'Không thể tải logo lên. Vui lòng thử lại.';
        toast(errorMsg, 'error');
      }
    } catch (err: any) {
      let detailedMsg = err?.message || 'Lỗi khi tải logo lên máy chủ.';
      if (err?.data?.errors?.logo?.[0]) {
        detailedMsg = err.data.errors.logo[0];
      } else if (err?.data?.message) {
        detailedMsg = err.data.message;
      }
      toast(detailedMsg, 'error');
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
        updateTenantBranding({ logo_url: null });
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
                Tùy biến Logo riêng của tiệm, Hotline liên hệ và Lời dặn bảo hành chân trang trên toàn bộ hóa đơn K80 nhiệt &amp; khổ A4. Mọi phiếu in luôn được bảo chứng bởi <strong>Powered by FIXO Repair OS</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestPrint}
                disabled={isPrinting}
                className="text-xs font-bold border-[#b8d0c5] hover:bg-[#f0f8f4] text-[#176b58] flex items-center gap-1.5"
              >
                <Icon name="printer" size={14} />
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
                    <Icon name="spark" size={16} />
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
                      Hỗ trợ PNG, JPG, SVG, WEBP (Dung lượng tối đa 5MB). Khuyến nghị ảnh nền trong suốt PNG hoặc SVG tỷ lệ ngang.
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
                  <Icon name="alert" size={14} className="text-[#718279] shrink-0 mt-0.5" />
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
                  <Icon name="edit" size={16} />
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

              {/* Bank Account Settings for VietQR */}
              <div className="pt-4 border-t border-[#eef3f0] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-heading font-bold text-[#1c302b] m-0 flex items-center gap-2">
                      <Icon name="building" size={16} />
                      <span>Tài khoản Ngân hàng nhận thanh toán (VietQR Cửa hàng)</span>
                    </h3>
                    <p className="text-xs text-[#5c6e66] m-0 mt-0.5">
                      Khách hàng quét VietQR sẽ chuyển khoản trực tiếp vào tài khoản này của cửa hàng.
                    </p>
                  </div>
                  {bankAccountNumber ? (
                    <span className="text-[10px] bg-[#e8f5f1] text-[#176b58] font-bold px-2 py-0.5 rounded-full">
                      Đã liên kết STK
                    </span>
                  ) : (
                    <span className="text-[10px] bg-[#fff8e6] text-[#b58105] font-bold px-2 py-0.5 rounded-full">
                      Chưa cài đặt STK
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bank Code Dropdown */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#2a3c36] block">
                      Ngân hàng thụ hưởng
                    </label>
                    <select
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value)}
                      disabled={!isAdmin || loading}
                      className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                    >
                      <option value="MB">MB - Ngân hàng Quân Đội (MBBank)</option>
                      <option value="VCB">VCB - Vietcombank (Ngoại Thương VN)</option>
                      <option value="TCB">TCB - Techcombank (Kỹ Thương VN)</option>
                      <option value="ACB">ACB - Ngân hàng Á Châu</option>
                      <option value="VietinBank">VietinBank - Ngân hàng Công Thương</option>
                      <option value="BIDV">BIDV - Đầu tư và Phát triển VN</option>
                      <option value="VPB">VPB - VPBank (Việt Nam Thịnh Vượng)</option>
                      <option value="TPB">TPB - TPBank (Tiên Phong)</option>
                      <option value="STB">STB - Sacombank (Sài Gòn Thương Tín)</option>
                      <option value="HDB">HDB - HDBank (Phát triển TP.HCM)</option>
                      <option value="VIB">VIB - Ngân hàng Quốc tế</option>
                      <option value="SHB">SHB - Ngân hàng Sài Gòn Hà Nội</option>
                      <option value="MSB">MSB - Ngân hàng Hàng Hải</option>
                      <option value="OCB">OCB - Ngân hàng Phương Đông</option>
                      <option value="LPB">LPB - LPBank (Lộc Phát VN)</option>
                    </select>
                    <span className="text-[10px] text-[#718279] block">
                      Mã ngân hàng chuẩn VietQR Napas 247.
                    </span>
                  </div>

                  {/* Bank Account Number */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#2a3c36] block">
                      Số tài khoản ngân hàng (STK)
                    </label>
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="Ví dụ: 0988777666 hoặc 1903..."
                      disabled={!isAdmin || loading}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                    />
                    <span className="text-[10px] text-[#718279] block">
                      Số tài khoản nhận tiền tại quầy của tiệm.
                    </span>
                  </div>
                </div>

                {/* Bank Account Holder */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#2a3c36] block">
                    Tên chủ tài khoản (Viết hoa không dấu)
                  </label>
                  <input
                    type="text"
                    value={bankAccountHolder}
                    onChange={(e) => setBankAccountHolder(toUpperNoDiacritics(e.target.value))}
                    placeholder="Ví dụ: NGUYEN VAN A hoặc CONG TY TNHH FIXO"
                    disabled={!isAdmin || loading}
                    className="w-full px-3 py-2 text-xs font-mono font-bold uppercase rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                  />
                  <span className="text-[10px] text-[#718279] block">
                    Tên người thụ hưởng (tự động chuẩn hóa viết hoa không dấu).
                  </span>
                </div>
              </div>

              {/* Co-branding info banner */}
              <div className="p-3 rounded-[10px] bg-[#f7faf8] border border-[#dce7e1] text-[11px] text-[#4d6359] flex items-center gap-2.5">
                <Icon name="spark" size={16} className="text-[#176b58] shrink-0" />
                <div>
                  <strong>Nhận diện Co-branding nền tảng:</strong> Dòng chữ <em>&ldquo;Powered by FIXO Repair OS · fixo.vn&rdquo;</em> được tự động in ở đáy trang để định danh công nghệ quản lý chuẩn mực.
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

            {/* Card 3: Telegram Notifications for New Repair Orders (Admin only) */}
            {isAdmin && (
              <div className="rounded-[16px] bg-white border border-[#e5ece8] p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#eef3f0]">
                  <div>
                    <h2 className="text-sm font-heading font-bold text-[#1c302b] m-0">
                      Thông báo Telegram (Đơn sửa chữa mới)
                    </h2>
                    <p className="text-xs text-[#5c6e66] m-0 mt-0.5 leading-relaxed">
                      Thêm một hoặc nhiều số điện thoại của Admin/Quản lý để tự động nhận tin nhắn Telegram ngay khi có đơn sửa chữa mới được tạo.
                    </p>
                  </div>
                  <span className="text-[10px] bg-[#e8f5f1] text-[#176b58] font-bold px-2.5 py-1 rounded-full self-start sm:self-center shrink-0">
                    {telegramRecipients.filter((r) => r.is_active && r.telegram_chat_id).length}/{telegramRecipients.length} SĐT đã kết nối
                  </span>
                </div>

                {/* Form thêm số điện thoại mới */}
                <form
                  onSubmit={handleAddTelegramRecipient}
                  className="p-4 rounded-[12px] bg-[#f9faf9] border border-[#e5ece8] space-y-3.5"
                >
                  <div className="text-xs font-heading font-bold text-[#1c302b]">
                    Thêm số điện thoại nhận thông báo
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Tên gợi nhớ */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#2a3c36] block">
                        Tên gợi nhớ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={tgLabel}
                        onChange={(e) => setTgLabel(e.target.value)}
                        placeholder="VD: Anh Minh - Chủ shop"
                        disabled={addingTelegram}
                        className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                        required
                      />
                    </div>

                    {/* Số điện thoại */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#2a3c36] block">
                        Số điện thoại <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={tgPhone}
                        onChange={(e) => setTgPhone(e.target.value)}
                        placeholder="VD: 0901234567"
                        disabled={addingTelegram}
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                        required
                      />
                    </div>

                    {/* Phạm vi chi nhánh */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#2a3c36] block">
                        Phạm vi chi nhánh
                      </label>
                      <select
                        value={tgBranchId}
                        onChange={(e) => setTgBranchId(e.target.value)}
                        disabled={addingTelegram}
                        className="w-full px-3 py-2 text-xs rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                      >
                        <option value="">Tất cả chi nhánh</option>
                        {branches
                          .filter((b) => String(b.id) !== 'all')
                          .map((b) => (
                            <option key={b.id} value={String(b.id)}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Tùy chọn nâng cao: Chat ID / Group ID */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedTg((prev) => !prev)}
                      className="text-[11px] font-semibold text-[#176b58] hover:underline focus:outline-none"
                    >
                      {showAdvancedTg
                        ? 'Ẩn tùy chọn nâng cao (Chat ID / Group ID)'
                        : 'Tùy chọn nâng cao: Nhập trực tiếp Chat ID / Group ID (nếu có)'}
                    </button>

                    {showAdvancedTg && (
                      <div className="mt-2 space-y-1">
                        <label className="text-[11px] font-bold text-[#2a3c36] block">
                          Chat ID / Group ID (Không bắt buộc)
                        </label>
                        <input
                          type="text"
                          value={tgChatId}
                          onChange={(e) => setTgChatId(e.target.value)}
                          placeholder="Để trống để kết nối 1 chạm qua nút Start Bot trên Telegram"
                          disabled={addingTelegram}
                          className="w-full px-3 py-2 text-xs font-mono rounded-[8px] border border-[#d2ded8] focus:outline-none focus:border-[#176b58] focus:ring-1 focus:ring-[#176b58] transition-all bg-white"
                        />
                        <span className="text-[10px] text-[#718279] block">
                          Nếu để trống, sau khi thêm bạn chỉ cần mở link Telegram của số điện thoại đó và bấm Start Bot là hệ thống tự nhận diện Chat ID.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={addingTelegram}
                      className="font-bold text-xs px-4 bg-[#176b58] hover:bg-[#0e4b3d]"
                    >
                      {addingTelegram ? 'Đang thêm...' : '+ Thêm SĐT nhận đơn'}
                    </Button>
                  </div>
                </form>

                {/* Danh sách các số điện thoại đã thêm */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-heading font-bold text-[#1c302b]">
                      Danh sách số điện thoại nhận thông báo ({telegramRecipients.length})
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSyncTelegram}
                      disabled={syncingTelegram || loadingTelegram}
                      className="text-xs font-bold border-[#b8d0c5] hover:bg-[#f0f8f4] text-[#176b58]"
                    >
                      {syncingTelegram ? 'Đang đồng bộ...' : 'Đồng bộ kết nối Telegram'}
                    </Button>
                  </div>

                  {loadingTelegram ? (
                    <div className="p-6 text-center text-xs text-[#6b7c74] bg-[#f9faf9] rounded-[12px] border border-[#e5ece8]">
                      Đang tải danh sách số điện thoại...
                    </div>
                  ) : telegramRecipients.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#6b7c74] bg-[#f9faf9] rounded-[12px] border border-[#e5ece8]">
                      Chưa có số điện thoại nào được cấu hình. Hãy thêm số điện thoại của Admin ở biểu mẫu phía trên.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {telegramRecipients.map((item) => {
                        const branchName =
                          item.branch?.name ||
                          (item.branch_id
                            ? branches.find((b) => String(b.id) === String(item.branch_id))?.name ||
                              `Chi nhánh #${item.branch_id}`
                            : 'Tất cả chi nhánh');
                        const roleName =
                          item.target_role === 'admin'
                            ? 'Admin'
                            : item.target_role.toUpperCase();
                        const isConnected = Boolean(item.telegram_chat_id);

                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 rounded-[12px] border transition-all ${
                              item.is_active
                                ? 'bg-white border-[#dce7e1]'
                                : 'bg-[#f6f8f6] border-[#e5ece8] opacity-75'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-heading font-bold text-[#1c302b]">
                                    {item.label}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-[#176b58] bg-[#e9f4ef] px-2 py-0.5 rounded-[6px]">
                                    {item.phone}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#516059] bg-[#f0f3f1] px-2 py-0.5 rounded-full">
                                    {branchName}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#516059] bg-[#f0f3f1] px-2 py-0.5 rounded-full">
                                    Vai trò: {roleName}
                                  </span>
                                  {!item.is_active && (
                                    <span className="text-[10px] font-semibold text-[#77847e] bg-[#e9eeeb] px-2 py-0.5 rounded-full">
                                      Đang tạm tắt
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                  {isConnected ? (
                                    <>
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#28805e] bg-[#eaf5ef]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#28805e]" />
                                        Đã kết nối Telegram
                                      </span>
                                      <span className="text-[10px] font-mono text-[#6b7c74]">
                                        Chat ID: {item.telegram_chat_id}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#b77a21] bg-[#faf3e7]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#b77a21]" />
                                      Chờ bấm Start trên Telegram
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Nút thao tác */}
                              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-center">
                                {isConnected ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleTestTelegramRecipient(item)}
                                    disabled={testingRecipientId === item.id}
                                    className="text-[11px] font-bold text-[#176b58] border-[#b8d0c5] hover:bg-[#f0f8f4]"
                                  >
                                    {testingRecipientId === item.id ? 'Đang gửi...' : 'Gửi thử'}
                                  </Button>
                                ) : (
                                  <>
                                    {item.connect_url && (
                                      <>
                                        <Button
                                          type="button"
                                          variant="primary"
                                          size="sm"
                                          onClick={() =>
                                            window.open(item.connect_url, '_blank', 'noopener,noreferrer')
                                          }
                                          className="text-[11px] font-bold bg-[#176b58] hover:bg-[#0e4b3d]"
                                        >
                                          Mở Telegram kích hoạt
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleCopyConnectUrl(item.connect_url)}
                                          className="text-[11px]"
                                        >
                                          Copy link
                                        </Button>
                                      </>
                                    )}
                                  </>
                                )}

                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleToggleTelegramRecipient(item)}
                                  disabled={togglingRecipientId === item.id}
                                  className="text-[11px]"
                                >
                                  {togglingRecipientId === item.id
                                    ? 'Đang lưu...'
                                    : item.is_active
                                      ? 'Tạm tắt'
                                      : 'Bật lại'}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteTelegramRecipient(item)}
                                  disabled={deletingRecipientId === item.id}
                                  className="text-[11px] text-[#bc5b52] border-[#f5c6cb] hover:bg-[#fbefed]"
                                >
                                  {deletingRecipientId === item.id ? 'Đang xóa...' : 'Xóa'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="p-3 rounded-[10px] bg-[#f7faf8] border border-[#dce7e1] text-[11px] text-[#4d6359] leading-relaxed">
                    <strong>Hướng dẫn kết nối 1 chạm:</strong> Sau khi thêm số điện thoại, hãy bấm <strong>&ldquo;Mở Telegram kích hoạt&rdquo;</strong> (hoặc gửi link cho chủ số điện thoại đó) và bấm <strong>Start</strong> trên Telegram Bot. Sau đó bấm <strong>&ldquo;Đồng bộ kết nối Telegram&rdquo;</strong> để hoàn tất liên kết tự động.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Sticky Print Preview (5 cols) */}
          <div className="lg:col-span-5 sticky top-6 space-y-3">
            <div className="rounded-[16px] bg-white border border-[#e5ece8] p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#eef3f0]">
                <div className="flex items-center gap-1.5">
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
