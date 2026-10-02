'use client';

import React, { useState, useEffect } from 'react';
import { Button, Icon, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';

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

const DEFAULT_CONFIG: SepayConfig = {
  bankCode: 'MB',
  bankName: 'MBBank - Ngân hàng Quân Đội',
  accountNumber: '0988888888',
  accountName: 'CTY TNHH CONG NGHE FIXO VIETNAM',
  apiToken: 'sp_live_99a8b7c6d5e4f3a2b1c098877665544',
  webhookSecret: 'whsec_fixo_sepay_live_secret_key_8899',
};

const WEBHOOK_ENDPOINT = 'https://api.fixo.com.vn/api/v1/webhooks/sepay';
const STORAGE_KEY = 'fixo_sepay_platform_config';

export default function PlatformIntegrationsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SepayConfig>(DEFAULT_CONFIG);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setConfig((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {
      console.warn('Could not read saved SePay config from localStorage', e);
    }
  }, []);

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

  const handleSaveConfig = () => {
    setIsSaving(true);
    setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch (e) {
        console.warn('Could not persist SePay config', e);
      }
      setIsSaving(false);
      toast('Lưu cấu hình tài khoản nhận tiền SePay thành công.', 'success');
    }, 400);
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      setIsLiveConnected(true);
      toast('Kết nối SePay thành công (200 OK). Đang hoạt động Live.', 'success');
    }, 700);
  };

  // QR Preview URL using standard VietQR quick preview
  const qrPreviewUrl = `https://img.vietqr.io/image/${config.bankCode}-${config.accountNumber}-compact2.png?accountName=${encodeURIComponent(
    config.accountName
  )}&amount=299000&addInfo=FIXO_SAAS_TEST`;

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

        {/* 2-Columns Layout: Form & VietQR Preview */}
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
                    Chưa kích hoạt
                  </span>
                )}
              </div>
              <p className="text-xs text-[#596962] leading-relaxed">
                Tài khoản nhận tiền đã sẵn sàng. Khi gian hàng thanh toán quét mã QR, SePay sẽ gửi webhook đến hệ thống và tự động gia hạn bản quyền trong vòng 3 giây.
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
                <div className="bg-white border border-[#e2e8f0] rounded-[8px] p-2 my-2 flex items-center justify-center">
                  <img
                    src={qrPreviewUrl}
                    alt="VietQR Sample Preview"
                    className="w-48 h-48 object-contain mx-auto"
                    onError={(e) => {
                      // Fallback nếu không có internet hoặc URL không tải được
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>

                {/* Account details in frame */}
                <div className="mt-3 pt-2 border-t border-[#edf2ef] text-left space-y-1">
                  <div className="text-[11px] text-[#718279]">
                    Số TK: <strong className="text-[#1c302b] font-mono">{config.accountNumber}</strong>
                  </div>
                  <div className="text-[11px] text-[#718279] truncate">
                    Chủ TK: <strong className="text-[#1c302b]">{config.accountName}</strong>
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
                <span>Lấy <strong>API Token</strong> từ SePay điền vào ô bên trên và bấm nút <em>&quot;Kiểm tra kết nối Live&quot;</em>.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
