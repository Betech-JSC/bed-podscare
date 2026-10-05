'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Icon, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';
import { platformService, type PlatformSepayConfig } from '@podscare/api-client';

interface SepayConfig {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  apiToken: string;
  webhookSecret: string;
}

const SUPPORTED_BANKS = [
  { code: 'MB', name: 'MBBank - Ngân hàng Quân Đội' },
  { code: 'VCB', name: 'Vietcombank - Ngân hàng Ngoại Thương' },
  { code: 'TCB', name: 'Techcombank - Kỹ Thương' },
  { code: 'ACB', name: 'ACB - Ngân hàng Á Châu' },
  { code: 'VPB', name: 'VPBank - Việt Nam Thịnh Vượng' },
  { code: 'TPB', name: 'TPBank - Tiên Phong' },
  { code: 'BIDV', name: 'BIDV - Đầu tư & Phát triển Việt Nam' },
  { code: 'ICB', name: 'VietinBank - Công Thương Việt Nam' },
];

const WEBHOOK_ENDPOINT = typeof window !== 'undefined'
  ? `${window.location.origin}/api/v1/webhooks/sepay`
  : 'https://api.fixo.com.vn/api/v1/webhooks/sepay';

export default function PlatformIntegrationsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SepayConfig>({
    bankCode: 'MB',
    bankName: 'MBBank - Ngân hàng Quân Đội',
    accountNumber: '',
    accountName: '',
    apiToken: '',
    webhookSecret: '',
  });

  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await platformService.getSepayConfig();
      const data = res?.data || res;
      if (data) {
        const bankCode = data.bank_code || data.bankCode || 'MB';
        const found = SUPPORTED_BANKS.find((b) => b.code === bankCode);
        setConfig({
          bankCode,
          bankName: found ? found.name : (data.bank_name || data.bankName || bankCode),
          accountNumber: data.account_number || data.accountNumber || '',
          accountName: data.account_name || data.accountName || '',
          apiToken: data.api_token || data.apiToken || '',
          webhookSecret: data.webhook_secret || data.webhookSecret || '',
        });
        if (data.is_connected !== undefined) {
          setIsLiveConnected(Boolean(data.is_connected));
        }
      }
    } catch (err) {
      console.warn('Could not load SePay config from API:', err);
      toast('Chưa tải được cấu hình SePay từ hệ thống.', 'info');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    const found = SUPPORTED_BANKS.find((b) => b.code === selectedCode);
    setConfig((prev) => ({
      ...prev,
      bankCode: selectedCode,
      bankName: found ? found.name : selectedCode,
    }));
  };

  const handleCopyWebhook = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(WEBHOOK_ENDPOINT);
      toast('Đã sao chép Webhook URL vào clipboard.', 'success');
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<PlatformSepayConfig> = {
        bank_code: config.bankCode,
        bank_name: config.bankName,
        account_number: config.accountNumber,
        account_name: config.accountName,
        api_token: config.apiToken,
        webhook_secret: config.webhookSecret,
      };

      await platformService.updateSepayConfig(payload);
      toast('Lưu cấu hình tài khoản nhận tiền SePay thành công lên hệ thống.', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể lưu cấu hình SePay.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await platformService.testSepayConnection();
      const data = res?.data || res;
      const ok = data?.connected !== undefined ? Boolean(data.connected) : (res?.success ?? true);

      setIsLiveConnected(ok);
      if (ok) {
        toast('Kết nối SePay thành công (200 OK). Đang hoạt động Live.', 'success');
      } else {
        toast(data?.message || 'Kết nối SePay thất bại. Vui lòng kiểm tra lại API Token.', 'error');
      }
    } catch (err: any) {
      setIsLiveConnected(false);
      toast(err?.response?.data?.message || err?.message || 'Lỗi kiểm tra kết nối SePay.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // QR Preview URL using standard VietQR quick preview
  const qrPreviewUrl = config.accountNumber
    ? `https://img.vietqr.io/image/${config.bankCode}-${config.accountNumber}-compact2.png?accountName=${encodeURIComponent(
        config.accountName || 'FIXO'
      )}&amount=299000&addInfo=FIXO_SAAS_TEST`
    : '';

  return (
    <AppShell crumbName="Tài khoản nhận tiền SePay">
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              Thanh toán Tự động SePay VietQR
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1c302b]">
              CẤU HÌNH TÀI KHOẢN NHẬN TIỀN SEPAY (VIETQR)
            </h1>
            <p className="text-sm text-[#596962] mt-1">
              Quản trị tài khoản ngân hàng thụ hưởng và cấu hình xác thực API SePay để kích hoạt bản quyền SaaS tự động.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="md"
              loading={isTesting}
              onClick={handleTestConnection}
            >
              Kiểm tra kết nối Live
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={isSaving}
              onClick={handleSaveConfig}
            >
              Lưu cấu hình SePay
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-[#718279]">
            <div className="w-8 h-8 rounded-full border-2 border-[#176b58]/20 border-t-[#176b58] animate-spin mx-auto mb-3" />
            Đang tải cấu hình SePay sàn từ máy chủ...
          </div>
        ) : (
          /* 2-Columns Layout: Form & VietQR Preview */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Column 1: Config Form (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Box 1: Receiving Bank Information */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[#f1f5f3]">
                  <div className="w-7 h-7 rounded-[6px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center">
                    <Icon name="payments" size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1c302b] uppercase tracking-wide">
                      Tài khoản Ngân hàng Thụ hưởng
                    </h2>
                    <p className="text-xs text-[#718279]">
                      Thông tin hiển thị trên mã VietQR khi gian hàng quét mã thanh toán gói SaaS.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                    Ngân hàng thụ hưởng
                  </label>
                  <select
                    value={config.bankCode}
                    onChange={handleBankChange}
                    className="w-full text-xs font-sans h-9 px-3 rounded-[8px] border border-[#dce5e0] bg-white text-[#1c302b] focus:outline-none focus:ring-1 focus:ring-[#176b58] focus:border-[#176b58]"
                  >
                    {SUPPORTED_BANKS.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                    Số tài khoản nhận tiền
                  </label>
                  <Input
                    type="text"
                    value={config.accountNumber}
                    onChange={(e) => setConfig({ ...config, accountNumber: e.target.value.replace(/\s+/g, '') })}
                    placeholder="Ví dụ: 0988888888"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                    Tên chủ tài khoản (In hoa không dấu)
                  </label>
                  <Input
                    type="text"
                    value={config.accountName}
                    onChange={(e) => setConfig({ ...config, accountName: e.target.value.toUpperCase() })}
                    placeholder="Ví dụ: CTY TNHH CONG NGHE FIXO VIETNAM"
                  />
                </div>
              </div>

              {/* Box 2: SePay API Credentials */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[#f1f5f3]">
                  <div className="w-7 h-7 rounded-[6px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center">
                    <Icon name="spark" size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1c302b] uppercase tracking-wide">
                      Thông số Kỹ thuật Cổng SePay
                    </h2>
                    <p className="text-xs text-[#718279]">
                      Khóa bảo mật và liên kết Webhook tự động nhận thông báo biến động số dư.
                    </p>
                  </div>
                </div>

                {/* SePay API Token */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[#1c302b] uppercase">
                      SePay API Token
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="text-xs font-semibold text-[#176b58] hover:underline flex items-center gap-1"
                    >
                      {showToken ? 'Ẩn mã token' : 'Hiển thị mã'}
                    </button>
                  </div>
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={config.apiToken}
                    onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
                    placeholder="sp_live_..."
                  />
                  <span className="text-[11px] text-[#718279] mt-1 block">
                    Lấy từ bảng điều khiển SePay (my.sepay.vn &rarr; Cấu hình API Token).
                  </span>
                </div>

                {/* Webhook URL (Read-only + Copy) */}
                <div>
                  <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                    Webhook URL (Hệ thống FIXO)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={WEBHOOK_ENDPOINT}
                      className="w-full text-xs font-mono h-9 px-3 rounded-[8px] border border-[#dce5e0] bg-[#f8faf9] text-[#1c302b] select-all focus:outline-none"
                    />
                    <Button
                      variant="outline"
                      size="md"
                      onClick={handleCopyWebhook}
                      className="flex-none whitespace-nowrap"
                    >
                      Sao chép
                    </Button>
                  </div>
                  <span className="text-[11px] text-[#718279] mt-1 block">
                    Dán URL này vào mục Webhooks trên SePay để nhận callback thanh toán tự động.
                  </span>
                </div>

                {/* Webhook Secret Key */}
                <div>
                  <label className="block text-xs font-bold text-[#1c302b] uppercase mb-1.5">
                    Webhook Secret Key (Kiểm tra chữ ký)
                  </label>
                  <Input
                    type="password"
                    value={config.webhookSecret}
                    onChange={(e) => setConfig({ ...config, webhookSecret: e.target.value })}
                    placeholder="whsec_..."
                  />
                </div>
              </div>
            </div>

            {/* Column 2: Live VietQR Simulation & Status (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Live Status Card */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#86968f]">
                    Trạng thái Cổng SePay
                  </span>
                  {isLiveConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                      Đang kết nối (Live)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      Chưa kích hoạt / Chưa kiểm tra
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#596962] leading-relaxed">
                  Tài khoản nhận tiền nền tảng. Khi gian hàng thanh toán quét mã QR, SePay sẽ gửi webhook đến hệ thống và tự động gia hạn bản quyền trong vòng 3 giây.
                </p>
              </div>

              {/* Live VietQR Preview Box */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 shadow-sm text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#f0f4f2] text-[#176b58] mb-4">
                  <Icon name="qr" size={14} />
                  Bản xem trước VietQR Nền tảng
                </div>

                {/* VietQR Mockup Frame */}
                <div className="mx-auto w-64 border border-[#e2e8f0] rounded-[12px] p-4 bg-[#fbfdfc] shadow-xs">
                  {/* Bank Header inside QR */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#edf2ef] text-left">
                    <div>
                      <strong className="block text-xs font-extrabold text-[#1c302b]">
                        {config.bankCode}
                      </strong>
                      <span className="text-[10px] text-[#718279]">VietQR Pro</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#176b58] bg-[#eaf4ef] px-2 py-0.5 rounded">
                      Chính chủ
                    </span>
                  </div>

                  {/* QR Image representation */}
                  <div className="bg-white border border-[#e2e8f0] rounded-[8px] p-2 my-2 flex items-center justify-center min-h-[190px]">
                    {qrPreviewUrl ? (
                      <img
                        src={qrPreviewUrl}
                        alt="VietQR Sample Preview"
                        className="w-48 h-48 object-contain mx-auto"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-[11px] text-[#718279] p-4">
                        Nhập số tài khoản để hiển thị mã VietQR
                      </div>
                    )}
                  </div>

                  {/* Account details in frame */}
                  <div className="mt-3 pt-2 border-t border-[#edf2ef] text-left space-y-1">
                    <div className="text-[11px] text-[#718279]">
                      Số TK: <strong className="text-[#1c302b] font-mono">{config.accountNumber || '—'}</strong>
                    </div>
                    <div className="text-[11px] text-[#718279] truncate">
                      Chủ TK: <strong className="text-[#1c302b]">{config.accountName || '—'}</strong>
                    </div>
                    <div className="text-[10px] text-[#86968f] italic">
                      Nội dung mẫu: FIXO_SAAS_TEST
                    </div>
                  </div>
                </div>

                <span className="text-[11px] text-[#718279] block mt-4">
                  Khung xem trước được sinh tự động theo chuẩn Napas 247 VietQR.
                </span>
              </div>

              {/* Quick Setup Instructions */}
              <div className="bg-[#f8faf9] border border-[#e2e8f0] rounded-[10px] p-5 text-xs text-[#596962] space-y-2">
                <strong className="block text-sm font-bold text-[#1c302b]">
                  Quy trình 3 bước hoàn tất tích hợp:
                </strong>
                <div className="flex items-start gap-2 pt-1">
                  <span className="w-5 h-5 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold flex items-center justify-center flex-none text-[11px]">
                    1
                  </span>
                  <span>Đăng ký tài khoản trên cổng SePay (sepay.vn) và liên kết tài khoản ngân hàng của bạn.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold flex items-center justify-center flex-none text-[11px]">
                    2
                  </span>
                  <span>Copy <strong>Webhook URL</strong> bên cạnh và dán vào phần cài đặt Webhook của SePay.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#eaf4ef] text-[#176b58] font-bold flex items-center justify-center flex-none text-[11px]">
                    3
                  </span>
                  <span>Lấy{' '}<strong>API Token</strong>{' '}từ SePay điền vào ô bên trên và bấm nút{' '}<em>&quot;Kiểm tra kết nối Live&quot;</em>.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
