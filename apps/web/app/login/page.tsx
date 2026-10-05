'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, useToast, Icon, Checkbox } from '@podscare/ui';
import { defaultHttpClient } from '@podscare/api-client';
import { usePodsCare } from '../providers';
import { unlockAudio } from '../utils/audioChime';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { isAuthenticated, login } = usePodsCare();

  const returnTo = searchParams.get('returnTo');

  const [storeCode, setStoreCode] = useState('fixo-master');
  const [showStoreAccordion, setShowStoreAccordion] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Tự động khôi phục mã gian hàng từ localStorage
  useEffect(() => {
    try {
      const savedCode = localStorage.getItem('fixo_store_code');
      if (savedCode && savedCode.trim()) {
        setStoreCode(savedCode.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  const handleStoreCodeChange = (newCode: string) => {
    setStoreCode(newCode);
    try {
      localStorage.setItem('fixo_store_code', newCode);
    } catch {
      // ignore
    }
  };

  // Nếu đã đăng nhập, chuyển hướng ngay về returnTo hoặc dashboard
  useEffect(() => {
    if (isAuthenticated) {
      if (returnTo && returnTo.startsWith('/')) {
        router.replace(returnTo);
      } else {
        router.replace('/dashboard');
      }
    }
  }, [isAuthenticated, returnTo, router]);

  const executeLogin = async (
    loginEmail: string,
    loginPass: string,
    loginStoreCode?: string,
    targetPath?: string
  ) => {
    setLoading(true);
    setErrorMessage('');

    const effectiveStoreCode = (loginStoreCode !== undefined ? loginStoreCode : storeCode).trim();

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          store_code: effectiveStoreCode,
          login: loginEmail.trim(),
          email: loginEmail.trim(),
          password: loginPass,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success && json?.data) {
        // Đồng bộ cookie phiên làm việc
        const token = json.data.token;
        defaultHttpClient.setToken(token);
        const maxAge = rememberMe ? 30 * 86400 : 86400;
        document.cookie = `podscare_session_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;

        login({
          token,
          user: json.data.user,
        });

        if (effectiveStoreCode) {
          try {
            localStorage.setItem('fixo_store_code', effectiveStoreCode);
          } catch {
            // ignore
          }
        }

        toast(`Đăng nhập thành công! Xin chào ${json.data.user.name}.`, 'success');

        // Xác định đích chuyển hướng: returnTo luôn có ưu tiên cao nhất
        let destination = targetPath;
        if (returnTo && returnTo.startsWith('/')) {
          destination = returnTo;
        } else if (!destination) {
          const userRole = json.data.user.role;
          if (userRole === 'super_admin') {
            destination = '/platform';
          } else if (userRole === 'technician' || userRole === 'tech') {
            destination = '/tech';
          } else if (userRole === 'qc') {
            destination = '/qc';
          } else if (userRole === 'inventory' || userRole === 'warehouse') {
            destination = '/inventory';
          } else {
            destination = '/dashboard';
          }
        }

        router.push(destination);
        return;
      }

      const serverMsg =
        json?.message ||
        json?.error ||
        (res.status === 401
          ? 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.'
          : 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
      setErrorMessage(serverMsg);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!storeCode.trim()) {
      setErrorMessage('Vui lòng nhập Mã gian hàng.');
      setShowStoreAccordion(true);
      return;
    }
    if (!emailOrPhone.trim()) {
      setErrorMessage('Vui lòng nhập Email hoặc Số điện thoại.');
      return;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập Mật khẩu.');
      return;
    }
    executeLogin(emailOrPhone, password, storeCode);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[460px] bg-white rounded-[20px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.08)] p-6 sm:p-8 md:p-9 animate-in fade-in zoom-in-95 duration-200">
        {/* Top bar return */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#f0f3f1]">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176b51] hover:text-[#10583f] transition-colors cursor-pointer"
          >
            ← Quay về Trang chủ
          </button>
          <span className="text-[11px] text-[#819089] font-medium">Cổng điều hành sửa chữa</span>
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo.png"
            alt="FIXO Logo"
            className="w-14 h-14 rounded-[12px] object-contain shadow-sm mb-2.5"
          />
          <h1 className="font-heading font-extrabold text-[24px] tracking-[-0.8px] text-[#1c302b] m-0">
            FIXO
          </h1>
          <p className="text-[11px] tracking-[1.3px] text-[#819089] font-bold mt-0.5 uppercase">
            REPAIR OPERATING SYSTEM
          </p>
        </div>

        {/* Notice returnTo if present */}
        {returnTo && (
          <div className="mb-5 p-3 rounded-[10px] bg-[#eaf4ef] border border-[#cde2d6] text-xs font-medium text-[#176b58] flex items-center gap-2">
            <Icon name="check" size={16} />
            <span>
              Vui lòng đăng nhập để tiếp tục đến liên kết:{' '}
              <b className="font-semibold">{returnTo}</b>
            </span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-xs font-medium text-[#bc5b52] flex items-center gap-2">
            <Icon name="alert" size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* OFFICIAL STAFF LOGIN FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
              Tài khoản (Email hoặc Số điện thoại)
            </label>
            <Input
              type="text"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="admin@fixo.com.vn hoặc 0901..."
              icon={<Icon name="customers" size={16} />}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#52635a]">
                Mật khẩu truy cập
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-[11px] text-[#176b58] font-semibold hover:underline cursor-pointer"
              >
                {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </button>
            </div>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              icon={<Icon name="audit" size={16} />}
              required
            />
          </div>

          {/* Remember Me Checkbox */}
          <div className="pt-1">
            <Checkbox
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              label="Ghi nhớ phiên đăng nhập trên thiết bị này"
            />
          </div>

          {/* Collapsible Store Code Accordion */}
          <div className="border border-[#e5ece8] rounded-[10px] overflow-hidden bg-[#fafbfa]">
            <button
              type="button"
              onClick={() => setShowStoreAccordion((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[#586961] hover:bg-[#f2f6f4] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Icon name="building" size={14} className="text-[#176b58]" />
                <span>Tùy chọn gian hàng nâng cao</span>
                <span className="text-[11px] font-mono text-[#819089] font-normal">
                  ({storeCode})
                </span>
              </div>
              <span className="text-xs text-[#819089]">
                {showStoreAccordion ? '▲ Đóng' : '▼ Mở rộng'}
              </span>
            </button>

            {showStoreAccordion && (
              <div className="p-3.5 border-t border-[#e5ece8] bg-white space-y-2">
                <label className="block text-[11px] font-semibold text-[#52635a]">
                  Mã gian hàng (Store Code)
                </label>
                <Input
                  type="text"
                  value={storeCode}
                  onChange={(e) => handleStoreCodeChange(e.target.value)}
                  placeholder="fixo-master, anhhuyrepair..."
                  icon={<Icon name="building" size={14} />}
                />
                <p className="text-[11px] text-[#7d8c85] m-0">
                  Mặc định hệ thống là{' '}
                  <b className="font-semibold">fixo-master</b>. Chỉ đổi nếu bạn làm việc tại chuỗi độc lập đối tác.
                </p>
              </div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full mt-2 font-bold text-sm"
          >
            Đăng nhập vào ca làm việc →
          </Button>

          <div className="text-center pt-2">
            <span className="text-xs text-[#6e7d75]">Chưa có gian hàng trên FIXO? </span>
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="text-xs font-bold text-[#176b58] hover:underline cursor-pointer"
            >
              Đăng ký mở tiệm ngay →
            </button>
          </div>
        </form>

        {/* Security Footer Note */}
        <p className="text-xs text-[#819089] text-center mt-7 mb-0 leading-relaxed">
          <span className="inline-block whitespace-nowrap">FIXO Repair Operating System</span>
          <span className="mx-1.5 text-[#b2c2ba]">·</span>
          <span className="inline-block whitespace-nowrap">Đồng bộ phiên làm việc bảo mật cao</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
            <span className="text-xs font-semibold text-[#516158]">Đang tải cổng đăng nhập...</span>
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
