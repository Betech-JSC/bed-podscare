'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, useToast, Icon } from '@podscare/ui';
import { usePodsCare } from '../providers';
import { unlockAudio } from '../utils/audioChime';

interface StaffCard {
  name: string;
  roleTitle: string;
  roleBadge: string;
  badgeStyle: string;
  branchLabel: string;
  branchCode: string;
  duty: string;
  email: string;
  initials: string;
  avatarBg: string;
  targetRoute: string;
}

const STAFF_CARDS: StaffCard[] = [
  {
    name: 'Minh Lê',
    roleTitle: 'Quản trị viên',
    roleBadge: 'Quản trị toàn chuỗi',
    badgeStyle: 'bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]',
    branchLabel: 'FIXO · Quận 1',
    branchCode: 'Q1',
    duty: 'Toàn quyền điều hành, phân quyền & cấu hình hệ thống',
    email: 'admin@fixo.com.vn',
    initials: 'ML',
    avatarBg: '#176b58',
    targetRoute: '/dashboard',
  },
  {
    name: 'Lan Phạm',
    roleTitle: 'CSKH Tiếp nhận',
    roleBadge: 'Tiếp nhận & Báo giá',
    badgeStyle: 'bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]',
    branchLabel: 'FIXO · Quận 1',
    branchCode: 'Q1',
    duty: 'Tiếp nhận máy tại quầy, test checklist & lập báo giá',
    email: 'cskh.lan@fixo.com.vn',
    initials: 'LP',
    avatarBg: '#2563eb',
    targetRoute: '/dashboard',
  },
  {
    name: 'Tuấn K.',
    roleTitle: 'Kỹ thuật viên',
    roleBadge: 'Sửa chữa & Linh kiện',
    badgeStyle: 'bg-[#fffbeb] text-[#b45309] border border-[#fde68a]',
    branchLabel: 'FIXO · Quận 1',
    branchCode: 'Q1',
    duty: 'Chẩn đoán mạch, bóc tách linh kiện & sửa chữa phần cứng',
    email: 'ktv.tuan@fixo.com.vn',
    initials: 'TK',
    avatarBg: '#d97706',
    targetRoute: '/tech',
  },
  {
    name: 'Duy T.',
    roleTitle: 'Kỹ thuật viên',
    roleBadge: 'Cách ly chi nhánh Q3',
    badgeStyle: 'bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa]',
    branchLabel: 'FIXO · Quận 3',
    branchCode: 'Q3',
    duty: 'Trạm kỹ thuật sửa chữa độc lập cách ly chi nhánh Quận 3',
    email: 'ktv.duy@fixo.com.vn',
    initials: 'DT',
    avatarBg: '#ea580c',
    targetRoute: '/tech',
  },
  {
    name: 'Hải N.',
    roleTitle: 'QC Inspector',
    roleBadge: 'Kiểm định & Rework',
    badgeStyle: 'bg-[#faf5ff] text-[#6b21a8] border border-[#e9d5ff]',
    branchLabel: 'FIXO · Quận 1',
    branchCode: 'Q1',
    duty: 'Kiểm tra chất lượng âm thanh, ANC, sạc & duyệt xuất xưởng',
    email: 'qc.inspector@fixo.com.vn',
    initials: 'HN',
    avatarBg: '#7c3aed',
    targetRoute: '/qc',
  },
  {
    name: 'Việt Trần',
    roleTitle: 'Quản lý kho',
    roleBadge: 'Tồn kho & Phiếu xuất/nhập',
    badgeStyle: 'bg-[#fdf2f8] text-[#be185d] border border-[#fbcfe8]',
    branchLabel: 'FIXO · Quận 1',
    branchCode: 'Q1',
    duty: 'Quản trị kho linh kiện, kiểm kê & điều phối phiếu xuất nhập',
    email: 'kho.viet@fixo.com.vn',
    initials: 'VT',
    avatarBg: '#db2777',
    targetRoute: '/inventory',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated, login } = usePodsCare();

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const executeLogin = async (loginEmail: string, loginPass: string, targetPath?: string) => {
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

        let destination = targetPath;
        if (!destination) {
          const userRole = json.data.user.role;
          if (userRole === 'technician' || userRole === 'tech') {
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

  const handleQuickLogin = (card: StaffCard) => {
    unlockAudio();
    setEmailOrPhone(card.email);
    setPassword('password');
    executeLogin(card.email, 'password', card.targetRoute);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[780px] bg-white rounded-[16px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.08)] p-6 sm:p-8 md:p-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#f0f3f1]">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176b51] hover:text-[#10583f] transition-colors"
          >
            ← Quay về Trang chủ
          </button>
          <span className="text-[11px] text-[#819089] font-medium">Cổng điều hành nội bộ</span>
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <img
            src="/logo.png"
            alt="FIXO Logo"
            className="w-14 h-14 rounded-[12px] object-cover shadow-md mb-3"
          />
          <h1 className="font-heading font-extrabold text-[26px] tracking-[-1px] text-[#1c302b] m-0">
            FIXO
          </h1>
          <p className="text-xs tracking-[1.3px] text-[#819089] font-bold mt-1 uppercase">
            REPAIR OPERATING SYSTEM
          </p>
          <div className="h-[1px] w-16 bg-[#e5ece8] my-4" />
          <h2 className="font-heading font-bold text-lg text-[#20332d] m-0">
            Đăng nhập hệ thống
          </h2>
          <p className="text-xs text-[#788880] mt-1 mb-0">
            Nhập tài khoản được phân quyền hoặc chọn thẻ nhân sự để bắt đầu ca làm việc
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#52635a] mb-1.5">
                Email hoặc Số điện thoại
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
              Đăng nhập nhanh theo Thẻ nhân sự (Staff ID Cards)
            </span>
          </div>
        </div>

        {/* 6 Staff ID Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STAFF_CARDS.map((card) => (
            <button
              key={card.email}
              type="button"
              onClick={() => handleQuickLogin(card)}
              disabled={loading}
              className="p-3.5 rounded-[12px] border border-[#e5ece8] bg-[#fbfcfb] hover:bg-[#f3f7f4] hover:border-[#75a994] hover:shadow-md transition-all text-left group disabled:opacity-50 cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-[10px] text-white font-bold text-xs grid place-items-center shrink-0 shadow-xs"
                  style={{ backgroundColor: card.avatarBg }}
                >
                  {card.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <b className="text-sm font-bold text-[#1c302b] group-hover:text-[#176b58] truncate">
                      {card.name}
                    </b>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-[#edf2ef] text-[#54645c] shrink-0">
                      {card.branchCode}
                    </span>
                  </div>
                  <div className="mb-1.5">
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[6px] ${card.badgeStyle}`}>
                      {card.roleBadge}
                    </span>
                  </div>
                  <p className="text-xs text-[#6e7d75] leading-snug line-clamp-2 m-0">
                    {card.duty}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#edf1ee] flex items-center justify-between text-[11px] text-[#86968f] font-medium">
                <span>{card.branchLabel}</span>
                <span className="text-[#176b58] font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Vào ca →
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Security Footer Note */}
        <p className="text-xs text-[#819089] text-center mt-7 mb-0 leading-relaxed">
          <span className="inline-block whitespace-nowrap">FIXO Repair Operating System</span>
          <span className="mx-1.5 text-[#b2c2ba]">·</span>
          <span className="inline-block whitespace-nowrap">Bảo mật tài khoản với Sanctum Bearer Token</span>
        </p>
      </div>
    </div>
  );
}
