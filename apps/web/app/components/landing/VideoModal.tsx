'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'workflow'>('overview');

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#e6ebe8] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e6ebe8] bg-[#f8faf9]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#102d35] text-white flex items-center justify-center font-heading font-extrabold text-[12px]">
              FX
            </div>
            <div>
              <h3 id="video-modal-title" className="font-heading font-bold text-[16px] text-[#102d35] leading-tight">
                Giới thiệu Giải pháp Quản lý FIXO Repair OS
              </h3>
              <p className="text-[12px] text-[#71817b]">
                Trải nghiệm 2 phút khám phá toàn bộ quy trình vận hành cửa hàng thông minh
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-[#e6ebe8] text-[#52615c] hover:bg-[#f0f3f1] hover:text-[#102d35] flex items-center justify-center transition-colors"
            aria-label="Đóng video"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Video Player Presentation Area */}
        <div className="relative aspect-video w-full bg-[#102d35] text-white flex flex-col justify-between overflow-hidden">
          {/* Subtle Ambient Effect */}
          <div className="absolute inset-0 bg-radial-at-c from-[#176b58]/20 via-transparent to-black/60 pointer-events-none" />

          {/* Top Bar inside Player */}
          <div className="relative z-10 px-6 pt-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-[#176b58] text-white text-[11px] font-bold">
                HD 1080p
              </span>
              <span className="text-[12px] text-[#b7c8c2] font-mono">
                FIXO REPAIR OS DEMO
              </span>
            </div>

            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full text-[11px] text-[#b7c8c2]">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
              <span>Bản Demo Trực Tuyến</span>
            </div>
          </div>

          {/* Center Play Interaction / Demo Simulation */}
          <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
            {!isPlaying ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsPlaying(true)}
                  className="w-20 h-20 rounded-full bg-[#176b58] text-white flex items-center justify-center shadow-[0_10px_35px_rgba(23,107,88,0.5)] hover:scale-105 hover:bg-[#10583f] transition-all group mb-4"
                  aria-label="Phát video"
                >
                  <span className="text-3xl ml-1 group-hover:scale-110 transition-transform">▶</span>
                </button>
                <h4 className="font-heading font-extrabold text-[20px] text-white mb-2">
                  Khám phá sức mạnh FIXO Repair OS
                </h4>
                <p className="text-[13px] text-[#b7c8c2] leading-relaxed">
                  Xem cách quản lý hơn 50.000 đơn sửa chữa mỗi tháng, kiểm soát linh kiện chính xác và kích hoạt bảo hành điện tử nhanh chóng.
                </p>
              </>
            ) : (
              <div className="bg-black/60 backdrop-blur-md p-6 rounded-xl border border-white/10 text-left w-full space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-[13px] font-bold text-[#b8e4d3]">
                    ▶ Đang phát: Module Vận hành & Tiếp nhận
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="text-[11px] text-[#b7c8c2] hover:text-white underline"
                  >
                    Tạm dừng
                  </button>
                </div>
                <div className="space-y-2 text-[12px] text-[#e5ece8]">
                  <p>✓ <strong>00:15</strong> — Tiếp nhận thiết bị, quét mã Serial/IMEI và in phiếu tức thì.</p>
                  <p>✓ <strong>00:45</strong> — Kỹ thuật viên báo giá, xuất linh kiện kho và cập nhật tiến độ.</p>
                  <p>✓ <strong>01:15</strong> — Kiểm định chất lượng (QC) và khách hàng ký nhận điện tử.</p>
                  <p>✓ <strong>01:50</strong> — Kích hoạt bảo hành qua mã QR và báo cáo doanh thu tự động.</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Video Progress Control Bar */}
          <div className="relative z-10 px-6 pb-4 bg-gradient-to-t from-black/80 to-transparent pt-6">
            {/* Timeline Progress */}
            <div className="w-full h-1.5 bg-white/20 rounded-full mb-3 overflow-hidden cursor-pointer">
              <div
                className={`h-full bg-[#176b58] rounded-full transition-all duration-300 ${
                  isPlaying ? 'w-3/4' : 'w-1/4'
                }`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#b7c8c2]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="text-white hover:text-[#b8e4d3] transition-colors"
                >
                  {isPlaying ? '⏸ Tạm dừng' : '▶ Bắt đầu'}
                </button>
                <span>{isPlaying ? '01:30 / 02:00' : '00:00 / 02:00'}</span>
              </div>

              <div className="flex items-center gap-4">
                <span>🔊 Âm lượng: 100%</span>
                <span className="text-white font-semibold">FIXO Technology</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with Feature Tabs and Action */}
        <div className="p-6 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#e6ebe8]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                activeTab === 'overview'
                  ? 'bg-[#176b58] text-white'
                  : 'bg-[#f4f7f5] text-[#52615c] hover:bg-[#e6ebe8]'
              }`}
            >
              Tổng quan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('features')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                activeTab === 'features'
                  ? 'bg-[#176b58] text-white'
                  : 'bg-[#f4f7f5] text-[#52615c] hover:bg-[#e6ebe8]'
              }`}
            >
              8 Module cốt lõi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workflow')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                activeTab === 'workflow'
                  ? 'bg-[#176b58] text-white'
                  : 'bg-[#f4f7f5] text-[#52615c] hover:bg-[#e6ebe8]'
              }`}
            >
              Quy trình 4 bước
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-[9px] border border-[#e6ebe8] text-[#263631] text-[13px] font-bold hover:bg-[#f6f8f6] transition-colors text-center"
            >
              Đóng lại
            </button>
            <Link
              href="/register?plan=trial"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[13px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] transition-all text-center"
            >
              Dùng thử miễn phí 14 ngày →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
