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

  // Mọi tài khoản đăng ký mới đều được cấp Gói Chuyên nghiệp ('pro') miễn phí 1 năm đầu
  // (kể cả khi truy cập không có ?plan= hoặc từ liên kết ?plan=trial cũ)
  const rawPlan = searchParams?.get('plan')?.toLowerCase();
  const initialPlan: 'trial' | 'standard' | 'pro' =
    rawPlan === 'pro' || rawPlan === 'trial' || !rawPlan ? 'pro' : 'pro';

  const [selectedPlan] = useState<'trial' | 'standard' | 'pro'>(initialPlan);
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
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

    if (!agreedToPolicies) {
      setErrorMessage(
        'Vui lòng tích xác nhận đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật trước khi khởi tạo gian hàng.'
      );
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
    trial: 'Gói Chuyên nghiệp (Pro) - Miễn phí 1 năm đầu (Không giới hạn nhân sự & chi nhánh)',
    standard:
      'Gói Tiêu chuẩn (299.000đ/tháng · 2 chi nhánh, 5 nhân sự, 300 đơn/tháng - Miễn phí 1 năm đầu)',
    pro: 'Gói Chuyên nghiệp (Pro) - Miễn phí 1 năm đầu (Không giới hạn nhân sự & chi nhánh)',
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

        {/* Activated Plan Benefit Banner — Calm Jade & Warm Ivory */}
        <div className="mb-6 p-4 rounded-[12px] bg-[#e9f4ef] border border-[#cde3d6]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
              Gói dịch vụ cấp tự động
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] bg-[#176b51] text-white text-[10px] font-extrabold uppercase tracking-[0.4px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8eadb]" />
              CHUYÊN NGHIỆP (PRO) — MIỄN PHÍ 1 NĂM ĐẦU (0đ)
            </span>
          </div>
          <p className="text-xs text-[#17231f] font-semibold leading-relaxed m-0">
            Không giới hạn nhân viên, không giới hạn chi nhánh &amp; không giới hạn đơn sửa chữa · Không cần thẻ tín dụng.
          </p>
        </div>

        {successData ? (
          <div className="p-6 rounded-[12px] bg-[#f6f8f6] border border-[#d6e8de] text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-full bg-[#e9f4ef] text-[#176b51] mx-auto grid place-items-center mb-4">
              <Icon name="check" size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#17231f] mb-2">
              Đăng ký gian hàng thành công!
            </h3>
            <p className="text-xs text-[#52635a] leading-relaxed mb-4 max-w-[500px] mx-auto">
              Gian hàng <strong className="text-[#176b51]">{successData.store_name}</strong> (Mã:{' '}
              <span className="font-mono font-bold text-[#17231f]">{successData.store_code}</span>) đã được khởi tạo thành công với{' '}
              <strong className="text-[#176b51]">Gói Chuyên nghiệp (Pro) - Miễn phí 1 năm đầu (Không giới hạn nhân sự &amp; chi nhánh)</strong>.
            </p>
            <div className="p-3.5 bg-white border border-[#e5ece8] rounded-[8px] text-xs text-[#6e7d75] mb-6 text-left space-y-2">
              <div className="flex justify-between gap-3">
                <span>Mã gian hàng:</span>
                <span className="font-mono font-bold text-[#17231f]">{successData.store_code}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Email quản trị:</span>
                <span className="font-medium text-[#17231f]">{successData.email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="shrink-0">Gói dịch vụ kích hoạt:</span>
                <span className="font-bold text-[#176b51] text-right">
                  {planTitles[successData.plan as keyof typeof planTitles] || planTitles.pro}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Hạn mức tài nguyên:</span>
                <span className="font-bold text-[#176b51] text-right">
                  Không giới hạn nhân viên, chi nhánh &amp; đơn hàng
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Trạng thái phê duyệt:</span>
                <span className="font-bold text-[#176b51]">Đã duyệt tự động (Active)</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Ưu đãi miễn phí:</span>
                <span className="font-semibold text-[#176b51]">1 năm đầu kể từ hôm nay (0đ)</span>
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
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-xs font-medium text-[#bc5b52] flex items-center gap-2"
              >
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

              <div className="p-3 rounded-[8px] bg-[#f6f8f6] border border-[#e5ece8] text-xs text-[#52635a] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#176b51] shrink-0" />
                <span>
                  Sau khi đăng ký, gian hàng được <strong>phê duyệt &amp; kích hoạt tự động ngay lập tức</strong> với{' '}
                  <strong>Gói Chuyên nghiệp (Pro) miễn phí 1 năm đầu</strong>. Không cần chờ quản trị viên duyệt.
                </span>
              </div>

              {/* Mandatory Legal Policy Consent Checkbox */}
              <div className="bg-[#f6f8f6] border border-[#e5ece8] rounded-[8px] p-3">
                <div className="flex items-start gap-2.5">
                  <input
                    id="register_agree_policies"
                    name="agreed_to_policies"
                    type="checkbox"
                    checked={agreedToPolicies}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAgreedToPolicies(checked);
                      if (checked && errorMessage.includes('Điều khoản sử dụng')) {
                        setErrorMessage('');
                      }
                    }}
                    className="mt-0.5 h-4 w-4 rounded-[4px] border border-[#b7ccc0] accent-[#176b51] cursor-pointer shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
                  />
                  <label
                    htmlFor="register_agree_policies"
                    className="text-xs text-[#17231f] leading-relaxed cursor-pointer select-none"
                  >
                    Tôi xác nhận đã đọc, hiểu rõ và đồng ý với{' '}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="font-bold text-[#176b51] underline hover:text-[#10583f]"
                    >
                      Điều khoản sử dụng
                    </Link>{' '}
                    và{' '}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="font-bold text-[#176b51] underline hover:text-[#10583f]"
                    >
                      Chính sách bảo mật dữ liệu
                    </Link>{' '}
                    của FIXO Repair OS.
                  </label>
                </div>
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

        {/* Security & Policy Mini-Footer */}
        <footer className="mt-7 pt-4 border-t border-[#f0f3f1] text-center space-y-2">
          <p className="text-xs text-[#819089] m-0 leading-relaxed">
            <span className="inline-block whitespace-nowrap">FIXO Repair Operating System</span>
            <span className="mx-1.5 text-[#b2c2ba]">·</span>
            <span className="inline-block whitespace-nowrap">Hạ tầng bảo mật Multi-Tenant</span>
            <span className="mx-1.5 text-[#b2c2ba]">·</span>
            <span className="inline-block whitespace-nowrap">
              Phát triển bởi{' '}
              <a
                href="https://betech-digital.com/"
                target="_blank"
                rel="noopener"
                className="font-semibold text-[#176b51] hover:underline"
              >
                Betech Digital
              </a>
            </span>
          </p>
          <nav
            aria-label="Liên kết chính sách pháp lý"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#52635a]"
          >
            <Link
              href="/terms"
              className="hover:text-[#176b51] hover:underline transition-colors"
            >
              Điều khoản sử dụng
            </Link>
            <span className="text-[#c5d1cb]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/privacy"
              className="hover:text-[#176b51] hover:underline transition-colors"
            >
              Chính sách bảo mật
            </Link>
            <span className="text-[#c5d1cb]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/billing-policy"
              className="hover:text-[#176b51] hover:underline transition-colors"
            >
              Chính sách thanh toán
            </Link>
            <span className="text-[#c5d1cb]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/sla"
              className="hover:text-[#176b51] hover:underline transition-colors"
            >
              Cam kết SLA
            </Link>
          </nav>
        </footer>
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
