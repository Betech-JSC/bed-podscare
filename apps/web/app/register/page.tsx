'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Icon } from '@podscare/ui';
import { defaultHttpClient } from '@podscare/api-client';
import { useOptionalPodsCare } from '../providers';

function RegisterStoreForm() {
  const searchParams = useSearchParams();
  const podsCare = useOptionalPodsCare();

  // Đọc query parameter `plan` ('trial' | 'standard' | 'pro', mặc định 'trial')
  const rawPlan = searchParams?.get('plan')?.toLowerCase();
  const initialPlan =
    rawPlan === 'standard' || rawPlan === 'pro' || rawPlan === 'trial'
      ? (rawPlan as 'trial' | 'standard' | 'pro')
      : 'trial';

  const [selectedPlan, setSelectedPlan] = useState<'trial' | 'standard' | 'pro'>(initialPlan);
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [formStartedAt] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState<{
    store_name: string;
    store_code: string;
    email: string;
    plan: string;
  } | null>(null);

  // Tự động chuẩn hóa slug cho mã gian hàng
  const handleStoreNameChange = (name: string) => {
    setStoreName(name);
    // Nếu người dùng chưa tự sửa storeCode thì tự sinh slug từ storeName
    if (!storeCode || storeCode === slugify(storeName)) {
      setStoreCode(slugify(name));
    }
  };

  const handleStoreCodeChange = (raw: string) => {
    setStoreCode(slugify(raw));
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const normalizeVnPhone = (raw: string): string => {
    const stripped = raw.trim().replace(/[\s.-]+/g, '');
    if (stripped.startsWith('+84')) {
      return '0' + stripped.slice(3);
    }
    return stripped;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Tầng 2: Honeypot Guard chặn bot tự động điền trường ẩn
    if (websiteUrl.trim() !== '') {
      setErrorMessage('Phát hiện yêu cầu đăng ký tự động không hợp lệ.');
      return;
    }

    if (!storeName.trim()) {
      setErrorMessage('Vui lòng nhập Tên gian hàng.');
      return;
    }
    if (!storeCode.trim()) {
      setErrorMessage('Vui lòng nhập Mã gian hàng.');
      return;
    }
    if (!ownerName.trim()) {
      setErrorMessage('Vui lòng nhập Họ tên chủ tiệm.');
      return;
    }
    if (!phone.trim()) {
      setErrorMessage('Vui lòng nhập Số điện thoại.');
      return;
    }

    // Tầng 3: Chuẩn hóa & Kiểm tra định dạng số điện thoại 10 số hợp lệ tại Việt Nam
    const normalizedPhone = normalizeVnPhone(phone);
    if (!/^0[235789][0-9]{8}$/.test(normalizedPhone)) {
      setErrorMessage(
        'Số điện thoại không đúng định dạng 10 số hợp lệ tại Việt Nam (ví dụ: 0901234567).'
      );
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Vui lòng nhập Địa chỉ email.');
      return;
    }

    // Tầng 3: Chặn địa chỉ email sử dụng ký tự bí danh (+tag) ở phần local-part trước @
    const cleanEmail = email.trim();
    const emailLocalPart = cleanEmail.split('@')[0] || '';
    if (emailLocalPart.includes('+')) {
      setErrorMessage(
        'Địa chỉ email không được chứa ký tự bí danh (+). Vui lòng sử dụng địa chỉ email chính thức của cửa hàng.'
      );
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/v1/tenants/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          store_name: storeName.trim(),
          store_code: storeCode.trim().toLowerCase(),
          owner_name: ownerName.trim(),
          phone: normalizedPhone,
          email: cleanEmail,
          password,
          plan: selectedPlan,
          website_url: websiteUrl,
          form_started_at: formStartedAt,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.status === 429) {
        setErrorMessage(
          json?.message ||
            'Hệ thống ghi nhận quá nhiều yêu cầu đăng ký từ địa chỉ mạng của bạn (429 Too Many Requests). Vui lòng thử lại sau ít phút.'
        );
        return;
      }

      if (res.ok && json?.success) {
        const normalizedCode = storeCode.trim().toLowerCase();
        try {
          localStorage.setItem('fixo_store_code', normalizedCode);
        } catch {
          // ignore
        }

        if (json?.data?.token && json?.data?.user) {
          const token = json.data.token;
          defaultHttpClient.setToken(token);
          if (typeof document !== 'undefined') {
            document.cookie = `podscare_session_token=${encodeURIComponent(token)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
          }
          podsCare?.login({
            token,
            user: json.data.user,
          });
        }

        setSuccessData({
          store_name: storeName.trim(),
          store_code: normalizedCode,
          email: email.trim(),
          plan: selectedPlan,
        });
      } else {
        const errorText =
          json?.message ||
          (json?.errors ? Object.values(json.errors).flat().join(' ') : null) ||
          'Đăng ký gian hàng không thành công. Vui lòng kiểm tra lại thông tin.';
        setErrorMessage(errorText);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  const planTitles = {
    trial: 'Gói Dùng thử Miễn phí 1 năm (0đ)',
    standard: 'Gói Tiêu chuẩn (299.000đ/tháng - Dùng thử 1 năm)',
    pro: 'Gói Chuyên nghiệp (599.000đ/tháng - Dùng thử 1 năm)',
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[660px] bg-white rounded-[16px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.08)] p-6 sm:p-8 md:p-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#f0f3f1]">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176b51] hover:text-[#10583f] transition-colors cursor-pointer"
          >
            ← Quay lại Đăng nhập
          </Link>
          <span className="text-[11px] text-[#819089] font-medium">FIXO Multi-Tenant Platform</span>
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo.png"
            alt="FIXO Logo"
            className="w-14 h-14 rounded-[12px] object-contain shadow-md mb-3"
          />
          <h1 className="font-heading font-extrabold text-[26px] tracking-[-1px] text-[#1c302b] m-0">
            Mở Gian Hàng Mới
          </h1>
          <p className="text-xs tracking-[1.3px] text-[#819089] font-bold mt-1 uppercase">
            HỆ SINH THÁI FIXO REPAIR OS
          </p>
          <p className="text-xs text-[#788880] mt-2 mb-0 max-w-[480px]">
            Đăng ký sử dụng hệ quản trị sửa chữa chuẩn Enterprise với quy trình tiếp nhận, checklist QC, quản lý kho linh kiện và thanh toán VietQR tự động.
          </p>
        </div>

        {/* Plan Switcher Selector Tabs */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#52635a] mb-2">
            Chọn gói cước trải nghiệm:
          </label>
          <div className="p-1.5 rounded-[12px] bg-[#f0f4f2] border border-[#e2eae5] grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setSelectedPlan('trial')}
              className={`py-2 px-2 rounded-[8px] text-xs font-bold transition-all text-center cursor-pointer ${
                selectedPlan === 'trial'
                  ? 'bg-white text-[#176b58] shadow-sm border border-[#d6e5dd]'
                  : 'text-[#697972] hover:text-[#1c302b]'
              }`}
            >
              Dùng thử (0đ)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlan('standard')}
              className={`py-2 px-2 rounded-[8px] text-xs font-bold transition-all text-center cursor-pointer ${
                selectedPlan === 'standard'
                  ? 'bg-white text-[#176b58] shadow-sm border border-[#d6e5dd]'
                  : 'text-[#697972] hover:text-[#1c302b]'
              }`}
            >
              Tiêu chuẩn (299k)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlan('pro')}
              className={`py-2 px-2 rounded-[8px] text-xs font-bold transition-all text-center cursor-pointer ${
                selectedPlan === 'pro'
                  ? 'bg-white text-[#176b58] shadow-sm border border-[#d6e5dd]'
                  : 'text-[#697972] hover:text-[#1c302b]'
              }`}
            >
              Chuyên nghiệp (599k)
            </button>
          </div>
        </div>

        {/* Selected Plan Highlight Banner */}
        <div className="mb-6 p-3.5 rounded-[10px] bg-[#eaf4ef] border border-[#cde3d6] flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#176b58] text-white grid place-items-center flex-none">
              <Icon name="spark" size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#176b58]">
                  Đang đăng ký:
                </span>
                <span className="px-2 py-0.5 rounded-[4px] bg-[#176b58] text-white text-[10px] font-extrabold uppercase">
                  {selectedPlan === 'trial'
                    ? 'DÙNG THỬ (TRIAL)'
                    : selectedPlan === 'standard'
                    ? 'TIÊU CHUẨN (STANDARD)'
                    : 'CHUYÊN NGHIỆP (PRO)'}
                </span>
              </div>
              <p className="text-xs text-[#2e4d41] font-medium mt-0.5 mb-0">
                {selectedPlan === 'trial' &&
                  'Dùng thử 1 năm miễn phí (1 chi nhánh, 2 nhân viên, 50 đơn/tháng). Không cần thẻ tín dụng.'}
                {selectedPlan === 'standard' &&
                  '299.000đ/tháng · Dùng thử 1 năm đầu miễn phí. Tối đa 2 chi nhánh, 5 nhân viên, 300 đơn/tháng.'}
                {selectedPlan === 'pro' &&
                  '599.000đ/tháng · Dùng thử 1 năm đầu miễn phí. Không giới hạn chi nhánh, nhân sự & đơn sửa chữa.'}
              </p>
            </div>
          </div>
        </div>

        {successData ? (
          <div className="p-6 rounded-[12px] bg-[#f7faf8] border border-[#d6e8de] text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-full bg-[#eaf4ef] text-[#176b58] mx-auto grid place-items-center mb-4">
              <Icon name="check" size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#1c302b] mb-2">
              Đăng ký gian hàng thành công!
            </h3>
            <p className="text-xs text-[#52635a] leading-relaxed mb-4 max-w-[480px] mx-auto">
              Gian hàng <strong className="text-[#176b58]">{successData.store_name}</strong> (Mã:{' '}
              <span className="font-mono font-bold text-[#1c302b]">{successData.store_code}</span>) đã được khởi tạo thành công với <strong>1 năm dùng thử miễn phí</strong>.
            </p>
            <div className="p-3 bg-white border border-[#e2ece6] rounded-[8px] text-xs text-[#6e7d75] mb-6 text-left space-y-1.5">
              <div className="flex justify-between">
                <span>Mã gian hàng:</span>
                <span className="font-mono font-bold text-[#1c302b]">{successData.store_code}</span>
              </div>
              <div className="flex justify-between">
                <span>Email quản trị:</span>
                <span className="font-medium text-[#1c302b]">{successData.email}</span>
              </div>
              <div className="flex justify-between">
                <span>Gói dịch vụ kích hoạt:</span>
                <span className="font-bold text-[#176b58]">{planTitles[successData.plan as keyof typeof planTitles] || successData.plan}</span>
              </div>
              <div className="flex justify-between">
                <span>Trạng thái phê duyệt:</span>
                <span className="font-bold text-[#176b58]">Đã duyệt tự động (Active)</span>
              </div>
              <div className="flex justify-between">
                <span>Hạn dùng thử:</span>
                <span className="font-semibold text-[#176b58]">1 năm kể từ hôm nay</span>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center py-3 px-4 rounded-[10px] bg-[#176b58] text-white font-bold text-sm hover:bg-[#10583f] transition-all text-center shadow-sm cursor-pointer mb-2.5"
            >
              Vào Bảng điều khiển Quản trị ngay →
            </Link>
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-[10px] border border-[#d6e8de] bg-white text-[#176b58] font-semibold text-xs hover:bg-[#f0f7f4] transition-all text-center cursor-pointer"
            >
              Đăng nhập vào gian hàng ngay →
            </Link>
          </div>
        ) : (
          <>
            {/* Error Alert */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-xs font-medium text-[#bc5b52] flex items-center gap-2">
                <Icon name="alert" size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot anti-bot field (hidden from real users & screen readers) */}
              <div
                className="sr-only absolute -left-[9999px] top-auto w-px h-px overflow-hidden"
                aria-hidden="true"
              >
                <label htmlFor="register_website_url">Website URL</label>
                <input
                  id="register_website_url"
                  type="text"
                  name="website_url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                    Tên gian hàng / Tiệm sửa chữa <span className="text-[#dc2626]">*</span>
                  </label>
                  <Input
                    type="text"
                    value={storeName}
                    onChange={(e) => handleStoreNameChange(e.target.value)}
                    placeholder="ví dụ: Huy Apple Care"
                    icon={<Icon name="building" size={16} />}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5 flex items-center justify-between">
                    <span>Mã gian hàng <span className="text-[#dc2626]">*</span></span>
                    <span className="text-[10px] text-[#819089]">Dùng đăng nhập</span>
                  </label>
                  <Input
                    type="text"
                    value={storeCode}
                    onChange={(e) => handleStoreCodeChange(e.target.value)}
                    placeholder="ví dụ: huyapple"
                    icon={<Icon name="spark" size={16} />}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                    Họ tên chủ tiệm / Đại diện <span className="text-[#dc2626]">*</span>
                  </label>
                  <Input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="ví dụ: Nguyễn Văn Huy"
                    icon={<Icon name="customers" size={16} />}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                    Số điện thoại liên hệ <span className="text-[#dc2626]">*</span>
                  </label>
                  <Input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="ví dụ: 0987654321"
                    icon={<Icon name="customers" size={16} />}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                    Email nhận thông báo <span className="text-[#dc2626]">*</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="huy@example.com"
                    icon={<Icon name="customers" size={16} />}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                    Mật khẩu truy cập <span className="text-[#dc2626]">*</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    icon={<Icon name="audit" size={16} />}
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-[8px] bg-[#f8faf9] border border-[#e5ece8] text-xs text-[#6e7d75] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#176b58] shrink-0" />
                <span>
                  Sau khi đăng ký, gian hàng được <strong>phê duyệt & kích hoạt tự động ngay lập tức</strong> với{' '}
                  <strong>1 năm dùng thử miễn phí</strong>. Không cần chờ quản trị viên duyệt.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2 font-bold text-sm"
              >
                Đăng ký & Kích hoạt gian hàng ngay →
              </Button>

              <div className="text-center pt-2">
                <span className="text-xs text-[#6e7d75]">Đã có tài khoản gian hàng? </span>
                <Link
                  href="/login"
                  className="text-xs font-bold text-[#176b58] hover:underline cursor-pointer"
                >
                  Đăng nhập ngay →
                </Link>
              </div>
            </form>
          </>
        )}

        {/* Security Footer Note */}
        <p className="text-xs text-[#819089] text-center mt-7 mb-0 leading-relaxed">
          <span className="inline-block whitespace-nowrap">FIXO Repair Operating System</span>
          <span className="mx-1.5 text-[#b2c2ba]">·</span>
          <span className="inline-block whitespace-nowrap">Hạ tầng bảo mật Multi-Tenant</span>
        </p>
      </div>
    </div>
  );
}

export default function RegisterStorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#176b58] border-t-transparent animate-spin" />
        </div>
      }
    >
      <RegisterStoreForm />
    </Suspense>
  );
}
