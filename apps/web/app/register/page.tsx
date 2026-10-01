'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Icon } from '@podscare/ui';

export default function RegisterStorePage() {
  const router = useRouter();

  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState<{
    store_name: string;
    store_code: string;
    email: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

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
    if (!email.trim()) {
      setErrorMessage('Vui lòng nhập Địa chỉ email.');
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
          phone: phone.trim(),
          email: email.trim(),
          password,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        setSuccessData({
          store_name: storeName.trim(),
          store_code: storeCode.trim().toLowerCase(),
          email: email.trim(),
        });
        // Lưu tạm vào localStorage để khi về login sẽ tự điền mã gian hàng này
        try {
          localStorage.setItem('fixo_store_code', storeCode.trim().toLowerCase());
        } catch {
          // ignore
        }
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

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[640px] bg-white rounded-[16px] border border-[#e5ece8] shadow-[0_24px_90px_rgba(18,37,27,0.08)] p-6 sm:p-8 md:p-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#f0f3f1]">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176b51] hover:text-[#10583f] transition-colors cursor-pointer"
          >
            ← Quay lại Đăng nhập
          </button>
          <span className="text-[11px] text-[#819089] font-medium">FIXO Multi-Tenant Platform</span>
        </div>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <img
            src="/logo.png"
            alt="FIXO Logo"
            className="w-14 h-14 rounded-[12px] object-cover shadow-md mb-3"
          />
          <h1 className="font-heading font-extrabold text-[26px] tracking-[-1px] text-[#1c302b] m-0">
            Mở Gian Hàng Mới
          </h1>
          <p className="text-xs tracking-[1.3px] text-[#819089] font-bold mt-1 uppercase">
            HỆ SINH THÁI FIXO REPAIR OS
          </p>
          <p className="text-xs text-[#788880] mt-2 mb-0 max-w-[460px]">
            Đăng ký sử dụng hệ quản trị sửa chữa chuẩn Enterprise với quy trình tiếp nhận, checklist QC, quản lý kho linh kiện và tra cứu thời gian thực.
          </p>
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
              Hồ sơ của gian hàng <strong className="text-[#176b58]">{successData.store_name}</strong> (Mã:{' '}
              <span className="font-mono font-bold text-[#1c302b]">{successData.store_code}</span>) đã được chuyển đến Ban quản trị FIXO để phê duyệt.
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
                <span>Thời gian phê duyệt:</span>
                <span className="font-semibold text-[#176b58]">Trong vòng 24 giờ làm việc</span>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full font-bold"
              onClick={() => router.push('/login')}
            >
              Quay lại màn hình Đăng nhập →
            </Button>
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
                  Sau khi gửi đăng ký, gian hàng được tạo ở trạng thái <strong>Chờ duyệt (Trial 14 ngày)</strong>.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2 font-bold text-sm"
              >
                Gửi hồ sơ đăng ký mở gian hàng →
              </Button>

              <div className="text-center pt-2">
                <span className="text-xs text-[#6e7d75]">Đã có tài khoản gian hàng? </span>
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="text-xs font-bold text-[#176b58] hover:underline cursor-pointer"
                >
                  Đăng nhập ngay →
                </button>
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
