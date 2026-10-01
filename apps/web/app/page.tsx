'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@podscare/ui';
import { usePodsCare } from './providers';

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = usePodsCare();

  const [trackQuery, setTrackQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = trackQuery.trim();
    if (!query) return;
    router.push(`/track?code=${encodeURIComponent(query)}`);
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#1c302b] flex flex-col font-sans selection:bg-[#c8eadb] selection:text-[#176b51]">
      {/* 1. STICKY HEADER */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#e5ece8] shadow-xs">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-[70px] flex items-center justify-between gap-4">
          {/* Logo Brand */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <img
              src="/logo.png"
              alt="FixQ Logo"
              className="w-10 h-10 rounded-[10px] object-cover shadow-sm flex-none"
            />
            <div>
              <span className="font-heading font-extrabold text-[22px] tracking-[-1px] text-[#1c302b] block leading-none">
                FixQ
              </span>
              <span className="block text-[9px] tracking-[1.3px] text-[#819089] font-bold mt-1 uppercase">
                REPAIR OPERATING SYSTEM
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-semibold text-[#516059]">
            <button
              type="button"
              onClick={() => scrollToSection('services')}
              className="hover:text-[#176b51] transition-colors"
            >
              Dịch vụ Lab
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('process')}
              className="hover:text-[#176b51] transition-colors"
            >
              Quy trình QC 14 bước
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('track-widget')}
              className="hover:text-[#176b51] transition-colors"
            >
              Tra cứu đơn
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('branches')}
              className="hover:text-[#176b51] transition-colors"
            >
              Mạng lưới Chi nhánh
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/track')}
              className="h-[38px] px-3.5 rounded-[7px] text-[12px] font-semibold text-[#516059] bg-white border border-[#e5ece8] hover:bg-[#f6f8f6] hover:border-[#b7ccc0] transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              <Icon name="search" size={15} />
              <span>Tra cứu đơn</span>
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="h-[38px] px-4 rounded-[7px] text-[12px] font-bold text-white bg-[#176b51] hover:bg-[#10583f] border border-[#176b51] transition-colors inline-flex items-center gap-2 shadow-sm"
              >
                <Icon name="dashboard" size={15} />
                <span>Vào trang điều hành →</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="h-[38px] px-4 rounded-[7px] text-[12px] font-bold text-white bg-[#176b51] hover:bg-[#10583f] border border-[#176b51] transition-colors inline-flex items-center gap-2 shadow-sm"
              >
                <span>Vào ca làm việc →</span>
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-[8px] border border-[#e5ece8] text-[#516059] hover:bg-[#f6f8f6]"
            aria-label="Toggle menu"
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#e5ece8] px-4 pt-3 pb-5 space-y-3">
            <button
              type="button"
              onClick={() => scrollToSection('services')}
              className="block w-full text-left py-2 text-sm font-semibold text-[#516059]"
            >
              Dịch vụ Lab
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('process')}
              className="block w-full text-left py-2 text-sm font-semibold text-[#516059]"
            >
              Quy trình QC 14 bước
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('track-widget')}
              className="block w-full text-left py-2 text-sm font-semibold text-[#516059]"
            >
              Tra cứu đơn hàng
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('branches')}
              className="block w-full text-left py-2 text-sm font-semibold text-[#516059]"
            >
              Mạng lưới Chi nhánh
            </button>
            <div className="pt-3 border-t border-[#f0f3f1] flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push('/track');
                }}
                className="w-full h-10 rounded-[7px] border border-[#e5ece8] text-sm font-semibold text-[#516059] flex items-center justify-center gap-2"
              >
                <Icon name="search" size={16} />
                <span>Tra cứu đơn hàng</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push(isAuthenticated ? '/dashboard' : '/login');
                }}
                className="w-full h-10 rounded-[7px] bg-[#176b51] text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <span>{isAuthenticated ? 'Vào trang điều hành →' : 'Vào ca làm việc →'}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden border-b border-[#e5ece8]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7">
              {/* Eyebrow Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[20px] bg-[#e9f4ef] border border-[#c8eadb] text-[#176b51] text-[11px] font-bold tracking-[1.1px] uppercase mb-6 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#176b51] animate-pulse" />
                HỆ ĐIỀU HÀNH SỬA CHỮA THIẾT BỊ ÂM THANH & APPLE
              </div>

              {/* Main Headline */}
              <h1 className="font-heading font-extrabold text-[34px] sm:text-[44px] md:text-[50px] leading-[1.15] tracking-[-1.5px] text-[#17231f] mb-6">
                Chuẩn Mực Phòng Lab <br />
                <span className="text-[#176b51]">Phục Hồi Âm Thanh</span> & Phần Cứng Apple
              </h1>

              {/* Core Value Proposition */}
              <p className="text-[15px] sm:text-[16px] text-[#55665f] leading-relaxed mb-8 max-w-[620px]">
                Quy trình vận hành khép kín chuẩn lab kỹ thuật y sinh: Đo phổ tần âm học chuyên dụng,
                bóc tách linh kiện định danh không vết mở, và kiểm định chất lượng nghiêm ngặt 14 bước
                trước khi xuất xưởng.
              </p>

              {/* Dual Action CTAs */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-10">
                <button
                  type="button"
                  onClick={() => router.push(isAuthenticated ? '/dashboard' : '/login')}
                  className="h-[48px] px-6 rounded-[8px] bg-[#176b51] hover:bg-[#10583f] text-white font-heading font-bold text-sm tracking-wide transition-all shadow-sm hover:shadow inline-flex items-center gap-2.5"
                >
                  <Icon name="arrow" size={17} />
                  <span>{isAuthenticated ? 'Vào trang điều hành →' : 'Bắt đầu ca làm việc →'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('track-widget')}
                  className="h-[48px] px-6 rounded-[8px] bg-white hover:bg-[#fafcfb] text-[#1c302b] border border-[#e2e9e4] hover:border-[#b7ccc0] font-semibold text-sm transition-all shadow-xs inline-flex items-center gap-2"
                >
                  <Icon name="search" size={17} />
                  <span>Tra cứu tiến độ sửa chữa</span>
                </button>
              </div>

              {/* Credibility Stats Bar */}
              <div className="pt-8 border-t border-[#e9eeeb] grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <b className="block font-heading font-extrabold text-[26px] tracking-[-1px] text-[#176b51]">
                    12.500+
                  </b>
                  <span className="block text-xs text-[#758780] font-medium mt-0.5">
                    Máy đã phục hồi chuẩn
                  </span>
                </div>
                <div>
                  <b className="block font-heading font-extrabold text-[26px] tracking-[-1px] text-[#176b51]">
                    14 Bước
                  </b>
                  <span className="block text-xs text-[#758780] font-medium mt-0.5">
                    Kiểm định QC âm học
                  </span>
                </div>
                <div>
                  <b className="block font-heading font-extrabold text-[26px] tracking-[-1px] text-[#176b51]">
                    100%
                  </b>
                  <span className="block text-xs text-[#758780] font-medium mt-0.5">
                    Linh kiện định danh
                  </span>
                </div>
                <div>
                  <b className="block font-heading font-extrabold text-[26px] tracking-[-1px] text-[#176b51]">
                    &lt; 2 Giờ
                  </b>
                  <span className="block text-xs text-[#758780] font-medium mt-0.5">
                    SLA xử lý tiêu chuẩn
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Mockup Card (Live Acoustic & Hardware Inspection Console) */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-[14px] border border-[#e5ece8] shadow-[0_12px_38px_rgba(28,49,34,0.06)] p-5 sm:p-6 relative">
                {/* Header Mockup */}
                <div className="flex items-center justify-between pb-4 border-b border-[#edf1ee] mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-[9px] bg-[#e9f4ef] text-[#176b51] grid place-items-center">
                      <Icon name="headphones" size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="text-sm font-bold text-[#1c302b]">AirPods Pro (Gen 2)</b>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-[#edf2ef] text-[#4a5852]">
                          A2931
                        </span>
                      </div>
                      <span className="text-xs text-[#819089]">Mã phiếu: PC-2024-8902 · Quận 1</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-[10px] font-bold text-[#28805e] bg-[#eaf5ef] border border-[#cbe6d7]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#28805e]" />
                    QC ĐẠT 14/14
                  </span>
                </div>

                {/* Acoustic Spectrum Chart Simulation */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-[#44554e] flex items-center gap-1.5">
                      <Icon name="volume" size={14} className="text-[#176b51]" />
                      Đo Phổ Tần Số Âm Học (20Hz - 20kHz)
                    </span>
                    <span className="text-[10px] text-[#819089] font-mono">Độ lệch L/R: 0.1 dB</span>
                  </div>

                  <div className="h-32 w-full bg-[#f9fbf9] rounded-[8px] border border-[#eef3f0] p-2 relative flex flex-col justify-end">
                    {/* SVG Graphic Curves */}
                    <svg
                      viewBox="0 0 300 100"
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      {/* Grid Lines */}
                      <line x1="0" y1="25" x2="300" y2="25" stroke="#e5ece8" strokeDasharray="3 3" />
                      <line x1="0" y1="50" x2="300" y2="50" stroke="#e5ece8" strokeDasharray="3 3" />
                      <line x1="0" y1="75" x2="300" y2="75" stroke="#e5ece8" strokeDasharray="3 3" />

                      {/* Reference Target Curve (Muted) */}
                      <path
                        d="M 0 65 Q 50 45, 100 50 T 200 40 T 300 45"
                        fill="none"
                        stroke="#b5c7bd"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />

                      {/* Measured Frequency Response (Calm Jade Solid) */}
                      <path
                        d="M 0 63 Q 50 44, 100 49 T 200 39 T 300 44"
                        fill="none"
                        stroke="#176b51"
                        strokeWidth="2.5"
                      />

                      {/* Accent Points */}
                      <circle cx="100" cy="49" r="3.5" fill="#176b51" />
                      <circle cx="200" cy="39" r="3.5" fill="#176b51" />
                    </svg>

                    <div className="flex justify-between text-[9px] text-[#8fa098] font-mono pt-1">
                      <span>20 Hz</span>
                      <span>250 Hz</span>
                      <span>1 kHz</span>
                      <span>4 kHz</span>
                      <span>20 kHz</span>
                    </div>
                  </div>
                </div>

                {/* 4-Item Diagnostic Check Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                  <div className="p-2.5 rounded-[8px] bg-[#f8faf8] border border-[#edf2ef]">
                    <span className="text-[10px] text-[#7d8e86] block">Khử ồn chủ động (ANC)</span>
                    <strong className="text-[#1c302b] font-bold text-[12px] flex items-center gap-1 mt-0.5">
                      <Icon name="check" size={13} className="text-[#176b51]" /> -32 dB (Chuẩn Lab)
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-[8px] bg-[#f8faf8] border border-[#edf2ef]">
                    <span className="text-[10px] text-[#7d8e86] block">Dung lượng Cell Pin</span>
                    <strong className="text-[#1c302b] font-bold text-[12px] flex items-center gap-1 mt-0.5">
                      <Icon name="check" size={13} className="text-[#176b51]" /> 100% Sức khỏe Pin
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-[8px] bg-[#f8faf8] border border-[#edf2ef]">
                    <span className="text-[10px] text-[#7d8e86] block">Áp suất buồng âm</span>
                    <strong className="text-[#1c302b] font-bold text-[12px] flex items-center gap-1 mt-0.5">
                      <Icon name="check" size={13} className="text-[#176b51]" /> Kín khí đạt 100%
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-[8px] bg-[#f8faf8] border border-[#edf2ef]">
                    <span className="text-[10px] text-[#7d8e86] block">Microphone Beamforming</span>
                    <strong className="text-[#1c302b] font-bold text-[12px] flex items-center gap-1 mt-0.5">
                      <Icon name="check" size={13} className="text-[#176b51]" /> SNR 68 dB rõ nét
                    </strong>
                  </div>
                </div>

                {/* Lab Certificate Footnote */}
                <div className="pt-3 border-t border-[#edf1ee] flex items-center justify-between text-[11px] text-[#778880]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#176b51]" />
                    <span>Chứng nhận bởi Trạm QC · Chi nhánh Q1</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#176b51] font-bold">ESD SAFE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SHOWCASE DỊCH VỤ CHUYÊN SÂU */}
      <section id="services" className="py-16 md:py-24 bg-white border-b border-[#e5ece8]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-[700px] mx-auto mb-14">
            <span className="text-[11px] font-bold tracking-[1.2px] text-[#176b51] uppercase bg-[#e9f4ef] px-3 py-1 rounded-[20px] inline-block mb-3">
              DANH MỤC PHỤC HỒI CHUYÊN SÂU
            </span>
            <h2 className="font-heading font-extrabold text-[28px] sm:text-[36px] tracking-[-1px] text-[#17231f]">
              Chuyên Gia Hàng Đầu Về Thiết Bị Âm Thanh & Apple
            </h2>
            <p className="text-sm sm:text-base text-[#65766f] mt-3">
              Mỗi thiết bị đều được áp dụng quy trình vi phẫu phòng sạch, bảo tồn tối đa ngoại quan gốc và phục hồi hoàn toàn thông số âm học của nhà sản xuất.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Service 1: AirPods & TWS */}
            <div className="rounded-[12px] border border-[#e5ece8] bg-[#fbfdfb] p-6 hover:border-[#176b51]/40 transition-all flex flex-col justify-between shadow-xs">
              <div>
                <div className="w-12 h-12 rounded-[10px] bg-[#e9f4ef] text-[#176b51] grid place-items-center mb-5">
                  <Icon name="headphones" size={24} />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-[#17231f] mb-2">
                  AirPods & Tai nghe TWS
                </h3>
                <p className="text-xs text-[#6e7f77] leading-relaxed mb-4">
                  Chuyên trị các ca khó trên AirPods 2, 3, Pro 1/2 và các dòng True Wireless cao cấp.
                </p>
                <ul className="space-y-2 text-xs text-[#43534c] mb-6">
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Thay pin vi mô cell zin không để lại vết mở vỏ nhựa</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Sửa rè loa, nghẹt màng loa, mất cân bằng âm lượng L/R</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Xử lý case sạc không vào điện, phục hồi bản lề lỏng</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Hiệu chỉnh chip ANC chống ồn chủ động & âm thanh không gian</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-[#edf2ee] flex items-center justify-between text-xs">
                <span className="text-[#7d8f87]">Thời gian: <strong>45 - 90 phút</strong></span>
                <span className="text-[#176b51] font-bold">Bảo hành 6 - 12 tháng</span>
              </div>
            </div>

            {/* Service 2: Apple Watch & Smartwatch */}
            <div className="rounded-[12px] border border-[#e5ece8] bg-[#fbfdfb] p-6 hover:border-[#176b51]/40 transition-all flex flex-col justify-between shadow-xs">
              <div>
                <div className="w-12 h-12 rounded-[10px] bg-[#e9f4ef] text-[#176b51] grid place-items-center mb-5">
                  <Icon name="watch" size={24} />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-[#17231f] mb-2">
                  Apple Watch & Smartwatch
                </h3>
                <p className="text-xs text-[#6e7f77] leading-relaxed mb-4">
                  Phục hồi Apple Watch Series 4 đến Series 9 & Ultra với chuẩn kháng nước nhà máy.
                </p>
                <ul className="space-y-2 text-xs text-[#43534c] mb-6">
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Ép kính cong Retina OLED bằng máy hút chân không chuyên dụng</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Thay pin dung lượng cao, dán keo gioăng chịu áp suất nước</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Sửa lỗi sạc không nhận, nóng máy, liệt phím Digital Crown</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Phục hồi cảm biến nhịp tim và nắp lưng gốm Ceramic</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-[#edf2ee] flex items-center justify-between text-xs">
                <span className="text-[#7d8f87]">Thời gian: <strong>60 - 120 phút</strong></span>
                <span className="text-[#176b51] font-bold">Bảo hành 6 tháng</span>
              </div>
            </div>

            {/* Service 3: Over-Ear High-End */}
            <div className="rounded-[12px] border border-[#e5ece8] bg-[#fbfdfb] p-6 hover:border-[#176b51]/40 transition-all flex flex-col justify-between shadow-xs">
              <div>
                <div className="w-12 h-12 rounded-[10px] bg-[#e9f4ef] text-[#176b51] grid place-items-center mb-5">
                  <Icon name="volume" size={24} />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-[#17231f] mb-2">
                  Tai Nghe Trùm Đầu High-End
                </h3>
                <p className="text-xs text-[#6e7f77] leading-relaxed mb-4">
                  Dành cho AirPods Max, Sony WH-1000XM4/XM5, Bose QuietComfort & Studio Monitors.
                </p>
                <ul className="space-y-2 text-xs text-[#43534c] mb-6">
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Sửa lỗi gãy bản lề trục xoay, đứt cáp tín hiệu âm thanh</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Khắc phục lỗi hú rít buồng âm ANC, chập chờn cảm biến đầu</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Thay pin kép dung lượng gốc cho thời lượng nghe 30+ giờ</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#176b51] font-bold">✓</span>
                    <span>Thay thế headband lưới thở và đệm tai Memory Foam khử mùi</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-[#edf2ee] flex items-center justify-between text-xs">
                <span className="text-[#7d8f87]">Thời gian: <strong>1 - 3 giờ</strong></span>
                <span className="text-[#176b51] font-bold">Bảo hành 6 - 12 tháng</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. QUY TRÌNH 4 GIAI ĐOẠN CHUẨN PHÒNG LAB */}
      <section id="process" className="py-16 md:py-24 bg-[#f6f8f6] border-b border-[#e5ece8]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-[700px] mx-auto mb-14">
            <span className="text-[11px] font-bold tracking-[1.2px] text-[#176b51] uppercase bg-[#e9f4ef] px-3 py-1 rounded-[20px] inline-block mb-3">
              QUY TRÌNH 4 BƯỚC KHÉP KÍN
            </span>
            <h2 className="font-heading font-extrabold text-[28px] sm:text-[36px] tracking-[-1px] text-[#17231f]">
              Quy Trình Sửa Chữa Minh Bạch & Kiểm Định 14 Bước
            </h2>
            <p className="text-sm sm:text-base text-[#65766f] mt-3">
              Mọi thiết bị tiếp nhận đều được gắn mã định danh barcode, lập biên bản chẩn đoán điện tử và kiểm định độc lập trước khi giao trả.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 shadow-xs relative">
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-[8px] bg-[#176b51] text-white font-heading font-bold text-sm grid place-items-center">
                  01
                </span>
                <span className="text-[11px] font-mono text-[#819089] uppercase">Tiếp nhận</span>
              </div>
              <h4 className="font-heading font-bold text-base text-[#17231f] mb-2">
                Chẩn Đoán Đa Điểm
              </h4>
              <p className="text-xs text-[#62736b] leading-relaxed">
                Soi kính nhiệt vi mạch, đo sóng âm acoustic 12 hạng mục và ghi nhận hiện trạng ban đầu bằng ảnh macro độ phân giải cao.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 shadow-xs relative">
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-[8px] bg-[#176b51] text-white font-heading font-bold text-sm grid place-items-center">
                  02
                </span>
                <span className="text-[11px] font-mono text-[#819089] uppercase">Báo giá</span>
              </div>
              <h4 className="font-heading font-bold text-base text-[#17231f] mb-2">
                Báo Giá Điện Tử Minh Bạch
              </h4>
              <p className="text-xs text-[#62736b] leading-relaxed">
                Tạo phiếu báo giá chi tiết từng mã linh kiện kèm thời gian bảo hành. Khách hàng xem xét và duyệt sửa chữa trực tuyến qua SMS/QR.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 shadow-xs relative">
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-[8px] bg-[#176b51] text-white font-heading font-bold text-sm grid place-items-center">
                  03
                </span>
                <span className="text-[11px] font-mono text-[#819089] uppercase">Thao tác</span>
              </div>
              <h4 className="font-heading font-bold text-base text-[#17231f] mb-2">
                Vi Phẫu Phòng Lab ESD
              </h4>
              <p className="text-xs text-[#62736b] leading-relaxed">
                Kỹ thuật viên thao tác trong phòng sạch chống tĩnh điện ESD, bóc tách bằng gia nhiệt chính xác và hàn vi mạch kính hiển vi 40x.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-[12px] border border-[#e5ece8] p-5 shadow-xs relative">
              <div className="flex items-center justify-between mb-4">
                <span className="w-8 h-8 rounded-[8px] bg-[#176b51] text-white font-heading font-bold text-sm grid place-items-center">
                  04
                </span>
                <span className="text-[11px] font-mono text-[#819089] uppercase">Nghiệm thu</span>
              </div>
              <h4 className="font-heading font-bold text-base text-[#17231f] mb-2">
                Kiểm Định QC 14 Bước
              </h4>
              <p className="text-xs text-[#62736b] leading-relaxed">
                Chuyên viên QC độc lập kiểm tra phổ âm, xuyên âm ANC, áp suất kín khí, sạc xả pin và cấp tem bảo hành số điện tử.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. WIDGET TRA CỨU TIẾN ĐỘ NHANH TRỰC TIẾP TRÊN TRANG CHỦ */}
      <section id="track-widget" className="py-16 md:py-20 bg-white border-b border-[#e5ece8]">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6">
          <div className="bg-[#f7faf8] rounded-[16px] border border-[#dce8e1] p-6 sm:p-10 shadow-sm text-center">
            <div className="w-12 h-12 rounded-[12px] bg-[#176b51] text-white grid place-items-center mx-auto mb-4">
              <Icon name="search" size={22} />
            </div>

            <h2 className="font-heading font-extrabold text-[24px] sm:text-[30px] text-[#17231f] mb-2">
              Tra Cứu Tiến Độ Sửa Chữa Trực Tuyến
            </h2>
            <p className="text-xs sm:text-sm text-[#61736b] max-w-[540px] mx-auto mb-6">
              Nhập mã tiếp nhận sửa chữa hoặc số điện thoại khách hàng để theo dõi tiến độ xử lý thời gian thực.
            </p>

            {/* Tracking Search Form */}
            <form onSubmit={handleTrackSubmit} className="max-w-[560px] mx-auto flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={trackQuery}
                  onChange={(e) => setTrackQuery(e.target.value)}
                  placeholder="Nhập mã phiếu (PC-xxxx) hoặc SĐT..."
                  className="w-full h-12 px-4 rounded-[8px] bg-white border border-[#ccd9d1] focus:border-[#176b51] focus:ring-2 focus:ring-[#176b51]/15 text-sm text-[#1c302b] placeholder-[#8ea097] outline-none transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                className="h-12 px-6 rounded-[8px] bg-[#176b51] hover:bg-[#10583f] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
              >
                <span>Tra cứu ngay</span>
                <Icon name="arrow" size={16} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 6. CAM KẾT & MẠNG LƯỚI CHI NHÁNH */}
      <section id="branches" className="py-16 md:py-24 bg-[#f6f8f6] border-b border-[#e5ece8]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-[700px] mx-auto mb-14">
            <span className="text-[11px] font-bold tracking-[1.2px] text-[#176b51] uppercase bg-[#e9f4ef] px-3 py-1 rounded-[20px] inline-block mb-3">
              MẠNG LƯỚI PHÒNG LAB
            </span>
            <h2 className="font-heading font-extrabold text-[28px] sm:text-[36px] tracking-[-1px] text-[#17231f]">
              Hệ Thống Chi Nhánh & Trạm Tiếp Nhận
            </h2>
            <p className="text-sm sm:text-base text-[#65766f] mt-3">
              Được trang bị máy đo sóng âm chuẩn quốc tế, buồng kiểm định khử ồn ANC và đội ngũ kỹ thuật viên được đào tạo chuyên sâu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[1240px] mx-auto">
            {/* Branch 1: Q1 */}
            <div className="bg-white rounded-[14px] border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#176b51]" />
                  <span className="font-mono text-xs font-bold text-[#176b51] uppercase tracking-wide">
                    CHI NHÁNH TRUNG TÂM
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#eaf5ef] text-[#28805e]">
                  Đang mở cửa
                </span>
              </div>

              <h3 className="font-heading font-bold text-[20px] text-[#17231f] mb-3">
                PodsCare · Chi nhánh Quận 1
              </h3>

              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Địa chỉ:</span>
                  <span>135B Trần Hưng Đạo, Phường Cầu Ông Lãnh, Quận 1, TP. Hồ Chí Minh</span>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Hotline:</span>
                  <a href="tel:0901888222" className="text-[#176b51] font-bold hover:underline">
                    0901.888.222
                  </a>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Giờ làm việc:</span>
                  <span>08:30 - 20:30 (Tất cả các ngày trong tuần)</span>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Năng lực:</span>
                  <span>Trạm Lab Phục hồi âm học & Vi phẫu mạch chuyên sâu</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#edf1ee] flex items-center justify-between text-xs">
                <span className="text-[#819089]">Hỗ trợ kỹ thuật: 24/7 qua Hotline</span>
                <button
                  type="button"
                  onClick={() => router.push('/track')}
                  className="text-[#176b51] font-bold hover:underline"
                >
                  Tra cứu đơn Q1 →
                </button>
              </div>
            </div>

            {/* Branch 2: Q3 */}
            <div className="bg-white rounded-[14px] border border-[#e5ece8] p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#176b51]" />
                  <span className="font-mono text-xs font-bold text-[#176b51] uppercase tracking-wide">
                    CHI NHÁNH PHỤ TRÁCH
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#eaf5ef] text-[#28805e]">
                  Đang mở cửa
                </span>
              </div>

              <h3 className="font-heading font-bold text-[20px] text-[#17231f] mb-3">
                PodsCare · Chi nhánh Quận 3
              </h3>

              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Địa chỉ:</span>
                  <span>246 Cách Mạng Tháng 8, Phường 10, Quận 3, TP. Hồ Chí Minh</span>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Hotline:</span>
                  <a href="tel:0901888333" className="text-[#176b51] font-bold hover:underline">
                    0901.888.333
                  </a>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Giờ làm việc:</span>
                  <span>08:30 - 20:30 (Tất cả các ngày trong tuần)</span>
                </div>
                <div className="grid grid-cols-[85px_1fr] gap-2 items-baseline text-sm text-[#52635b]">
                  <span className="font-semibold text-[#1c302b]">Năng lực:</span>
                  <span>Trạm Sửa chữa nhanh & Trung tâm bảo hành phụ kiện</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#edf1ee] flex items-center justify-between text-xs">
                <span className="text-[#819089]">Hỗ trợ kỹ thuật: 24/7 qua Hotline</span>
                <button
                  type="button"
                  onClick={() => router.push('/track')}
                  className="text-[#176b51] font-bold hover:underline"
                >
                  Tra cứu đơn Q3 →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FOOTER CHUYÊN NGHIỆP & CỔNG NHÂN SỰ NỘI BỘ */}
      <footer className="mt-auto bg-[#17231f] text-[#a4b4ad] pt-14 pb-10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-[#293a34]">
            {/* Col 1: Brand Info */}
            <div className="md:col-span-4">
              <div className="flex items-center gap-2.5 mb-4">
                <img
                  src="/logo.png"
                  alt="FixQ Logo"
                  className="w-8 h-8 rounded-[8px] object-cover shadow-xs flex-none"
                />
                <span className="font-heading font-extrabold text-[20px] text-white">FixQ</span>
              </div>
              <p className="text-xs text-[#8c9f96] leading-relaxed mb-4 max-w-[320px]">
                Hệ điều hành sửa chữa thiết bị âm thanh & Apple chuyên nghiệp.
                Tiêu chuẩn phòng lab vi phẫu, linh kiện định danh và kiểm định chất lượng 14 bước độc lập.
              </p>
              <div className="text-xs text-[#7d9087]">
                Hotline tổng đài: <b className="text-white">1900 888 999</b>
              </div>
            </div>

            {/* Col 2: Services */}
            <div className="md:col-span-3">
              <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">
                Dịch Vụ Phục Hồi
              </h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#services" className="hover:text-white transition-colors">Sửa chữa & Thay pin AirPods</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Ép kính & Thay pin Apple Watch</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Phục hồi tai nghe High-End Over-Ear</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Hiệu chuẩn buồng âm chống ồn ANC</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Xử lý sạc không vào & bo mạch Case</a></li>
              </ul>
            </div>

            {/* Col 3: Portal Links */}
            <div className="md:col-span-2">
              <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">
                Khách Hàng
              </h4>
              <ul className="space-y-2 text-xs">
                <li><button type="button" onClick={() => router.push('/track')} className="hover:text-white transition-colors">Tra cứu đơn hàng</button></li>
                <li><a href="#process" className="hover:text-white transition-colors">Quy trình kiểm định QC</a></li>
                <li><a href="#branches" className="hover:text-white transition-colors">Địa chỉ chi nhánh</a></li>
                <li><a href="#branches" className="hover:text-white transition-colors">Chính sách bảo hành</a></li>
              </ul>
            </div>

            {/* Col 4: Dedicated Staff Portal Gateway Card */}
            <div className="md:col-span-3">
              <div className="rounded-[10px] bg-[#1d2d27] border border-[#2b3f37] p-4 text-left">
                <span className="text-[10px] font-bold text-[#c8eadb] tracking-wider uppercase block mb-1">
                  DÀNH CHO NHÂN SỰ NỘI BỘ
                </span>
                <p className="text-xs text-[#8c9f96] mb-3">
                  Cổng đăng nhập hệ điều hành PodsCare dành cho Kỹ thuật viên, Quản trị viên và CSKH tiếp nhận.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="w-full h-9 rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>Cổng đăng nhập ca làm việc →</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6e8077]">
            <p className="m-0">© 2024 PodsCare Repair OS. Tất cả quyền được bảo lưu.</p>
            <p className="m-0">Tiêu chuẩn kỹ thuật phòng lab kiểm định thiết bị âm thanh & Apple.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
