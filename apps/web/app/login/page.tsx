'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, useToast, Icon, Badge } from '@podscare/ui';
import { usePodsCare } from '../providers';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated, login } = usePodsCare();

  const [emailOrPhone, setEmailOrPhone] = useState('admin@podscare.vn');
  const [password, setPassword] = useState('password123');
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
      let resData: any = null;
      let isSuccess = false;

      // Try backend API via Next.js proxy or direct localhost:8000
      try {
        const endpoints = [
          '/api/v1/auth/login',
          'http://127.0.0.1:8000/api/v1/auth/login',
        ];

        for (const endpoint of endpoints) {
          try {
            const res = await fetch(endpoint, {
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

            if (res.ok) {
              const json = await res.json();
              if (json.success && json.data) {
                resData = json.data;
                isSuccess = true;
                break;
              }
            }
          } catch {
            // continue fallback
          }
        }
      } catch (err: any) {
        console.warn('Backend API request error:', err);
      }

      // If backend was successfully reached
      if (isSuccess && resData) {
        login({
          token: resData.token,
          user: resData.user,
        });
        toast(`Đăng nhập thành công! Xin chào ${resData.user.name}.`, 'success');
        router.push('/');
        return;
      }

      // Offline / Demo fallback if backend API server is stopped
      const demoUsersMap: Record<string, any> = {
        'admin@podscare.vn': {
          id: 1,
          name: 'Minh Lê',
          email: 'admin@podscare.vn',
          phone: '0901 000 001',
          role: 'admin',
          branch: 'Quận 1',
        },
        'cskh.lan@podscare.vn': {
          id: 2,
          name: 'Lan Phạm',
          email: 'cskh.lan@podscare.vn',
          phone: '0902 000 002',
          role: 'cskh',
          branch: 'Quận 1',
        },
        'tuan.kt@podscare.vn': {
          id: 3,
          name: 'Tuấn K.',
          email: 'tuan.kt@podscare.vn',
          phone: '0903 000 003',
          role: 'technician',
          branch: 'Quận 1',
        },
      };

      const matchedUser = demoUsersMap[loginEmail.trim().toLowerCase()];
      if (matchedUser && (loginPass === 'password123' || loginPass === 'password')) {
        login({
          token: `demo-bearer-token-${Date.now()}`,
          user: matchedUser,
        });
        toast(`Đăng nhập thành công (Demo)! Xin chào ${matchedUser.name}.`, 'success');
        router.push('/');
        return;
      }

      setErrorMessage('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Có lỗi xảy ra trong quá trình đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50"
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
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50"
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
            className="w-full p-3 sm:p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f1f6f3] hover:border-[#96c4b0] transition-all flex items-center justify-between text-left group disabled:opacity-50"
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
