'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, useToast, Icon, Badge } from '@podscare/ui';
import { usePodsCare } from '../providers';
import { unlockAudio } from '../utils/audioChime';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated, login } = usePodsCare();

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const executeLogin = async (loginEmail: string, loginPass: string) => {
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPass,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success && json?.data) {
        login({
          token: json.data.token,
          user: json.data.user,
        });
        toast(`Đăng nhập thành công! Xin chào ${json.data.user.name}.`, 'success');
        router.push('/');
        return;
      }

      // Handle server error responses
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
    if (!emailOrPhone.trim()) {
      setErrorMessage('Vui lòng nhập Email hoặc Số điện thoại.');
      return;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập Mật khẩu.');
      return;
    }
    executeLogin(emailOrPhone, password);
  };

  const handleQuickLogin = (email: string) => {
    unlockAudio();
    setEmailOrPhone(email);
    setPassword('password123');
    executeLogin(email, 'password123');
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[560px] bg-white rounded-[16px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.08)] p-6 sm:p-8 md:p-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-[14px] bg-[#196d52] flex items-center justify-center gap-0.5 shadow-md mb-3">
            <span className="h-4 w-1.5 bg-[#c8eadb] rounded-full transform -rotate-[25deg]" />
            <span className="h-6 w-1.5 bg-[#c8eadb] rounded-full transform -rotate-[25deg]" />
          </div>
          <h1 className="font-heading font-extrabold text-[26px] tracking-[-1px] text-[#1c302b] m-0">
            podscare
          </h1>
          <p className="text-xs tracking-[1.3px] text-[#819089] font-bold mt-1 uppercase">
            REPAIR OPERATING SYSTEM
          </p>
          <div className="h-[1px] w-16 bg-[#e5ece8] my-4" />
          <h2 className="font-heading font-bold text-lg text-[#20332d] m-0">
            Đăng nhập hệ thống
          </h2>
          <p className="text-xs text-[#788880] mt-1 mb-0">
            Nhập tài khoản được phân quyền để bắt đầu ca làm việc
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-[8px] bg-[#fbefed] border border-[#f5c7c2] text-xs font-medium text-[#bc5b52] flex items-center gap-2">
            <Icon name="alert" size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
              Email hoặc Số điện thoại
            </label>
            <Input
              type="text"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="admin@podscare.vn hoặc 0901..."
              icon={<Icon name="customers" size={16} />}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
              Mật khẩu truy cập
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              icon={<Icon name="audit" size={16} />}
              required
            />
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
        </form>

        {/* Quick Login Divider */}
        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#edf1ee]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-[#87968f] font-semibold">
              Đăng nhập nhanh cho Demo (1-Click)
            </span>
          </div>
        </div>

        {/* 3 Quick Login Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => handleQuickLogin('admin@podscare.vn')}
            disabled={loading}
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
              <div className="w-9 h-9 rounded-full bg-[#176b58] text-white font-bold text-xs grid place-items-center shrink-0">
                ML
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-bold text-[#1c302b] group-hover:text-[#176b58] truncate">
                  Admin (Minh Lê)
                </b>
                <span className="block text-xs text-[#7e8d85] truncate">
                  admin@podscare.vn · pass: password123
                </span>
              </div>
            </div>
            <Badge variant="brand" className="whitespace-nowrap shrink-0">
              Quản trị viên
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('cskh.lan@podscare.vn')}
            disabled={loading}
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
              <div className="w-9 h-9 rounded-full bg-[#3b82f6] text-white font-bold text-xs grid place-items-center shrink-0">
                LP
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-bold text-[#1c302b] group-hover:text-[#176b58] truncate">
                  CSKH (Lan Phạm)
                </b>
                <span className="block text-xs text-[#7e8d85] truncate">
                  cskh.lan@podscare.vn · pass: password123
                </span>
              </div>
            </div>
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#eef4ff] text-[#2563eb] whitespace-nowrap shrink-0">
              CSKH Tiếp nhận
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('tuan.kt@podscare.vn')}
            disabled={loading}
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
              <div className="w-9 h-9 rounded-full bg-[#f59e0b] text-white font-bold text-xs grid place-items-center shrink-0">
                TK
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-bold text-[#1c302b] group-hover:text-[#176b58] truncate">
                  Kỹ thuật (Tuấn K.)
                </b>
                <span className="block text-xs text-[#7e8d85] truncate">
                  tuan.kt@podscare.vn · pass: password123
                </span>
              </div>
            </div>
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-[10px] bg-[#fef5e7] text-[#b45309] whitespace-nowrap shrink-0">
              Kỹ thuật viên
            </span>
          </button>
        </div>

        {/* Security Footer Note */}
        <p className="text-xs text-[#819089] text-center mt-7 mb-0 leading-relaxed">
          <span className="inline-block whitespace-nowrap">PodsCare Repair Operating System</span>
          <span className="mx-1.5 text-[#b2c2ba]">·</span>
          <span className="inline-block whitespace-nowrap">Bảo mật tài khoản với Sanctum Bearer Token</span>
        </p>
      </div>
    </div>
  );
}
