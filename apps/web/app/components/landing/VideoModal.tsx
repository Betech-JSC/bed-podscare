'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SceneInfo {
  id: number;
  label: string;
  badge: string;
  timeRange: string;
  title: string;
  description: string;
}

const SCENES: SceneInfo[] = [
  {
    id: 0,
    label: '1. Tiếp nhận',
    badge: 'Chờ Kỹ Thuật nhận (waiting_tech)',
    timeRange: '00:00 - 00:30',
    title: 'Tiếp nhận & Tạo phiếu tức thì',
    description: 'Nhận diện khách cũ, quét Serial/IMEI, in phiếu tiếp nhận kèm mã QR trong 15 giây.',
  },
  {
    id: 1,
    label: '2. Kỹ Thuật Nhận sản phẩm',
    badge: 'Đang sửa chữa (in_repair)',
    timeRange: '00:30 - 01:00',
    title: 'Kỹ Thuật Nhận Sản Phẩm',
    description: 'Hệ thống tự động phát sóng đơn sửa chữa tới Kỹ Thuật trực bàn, tự động trừ kho linh kiện.',
  },
  {
    id: 2,
    label: '3. Nghiệm thu QC',
    badge: 'Sẵn sàng giao trả (ready_for_return)',
    timeRange: '01:00 - 01:30',
    title: 'Nghiệm thu QC Pass chuẩn xưởng',
    description: 'Kỹ Thuật hoàn tất thay thế, đối chiếu 4 tiêu chí kiểm định và đóng dấu QC Passed điện tử.',
  },
  {
    id: 3,
    label: '4. Bảo hành & VietQR',
    badge: 'Hoàn tất & Bàn giao (completed)',
    timeRange: '01:30 - 02:00',
    title: 'Thanh toán VietQR SePay & Tem E-Warranty',
    description: 'Sinh mã QR động SePay nhận tiền tự động, kích hoạt tem bảo hành 06 tháng gửi Zalo.',
  },
];

export const VideoModal: React.FC<VideoModalProps> = ({ isOpen, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0); // 0 to 120 seconds
  const totalDuration = 120; // 2 minutes

  // Calculate current scene index based on currentTime (each scene is 30s)
  const currentSceneIndex = useMemo(() => {
    return Math.min(3, Math.floor(currentTime / 30));
  }, [currentTime]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isOpen]);

  // Keyboard accessibility and body lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Timeline playback simulation (0.5s virtual time per 100ms real time -> 24s full run)
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const timer = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return +(prev + 0.5).toFixed(1);
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, totalDuration]);

  if (!isOpen) return null;

  // Format mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercentage = (currentTime / totalDuration) * 100;

  const handleSelectScene = (sceneIndex: number) => {
    setCurrentTime(sceneIndex * 30);
    setIsPlaying(true);
  };

  const handleRestart = () => {
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    setCurrentTime(+(newPercent * totalDuration).toFixed(1));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-tour-title"
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#d6dfda] overflow-hidden flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e6ebe8] bg-[#f8faf9] flex-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#102d35] text-white flex items-center justify-center font-heading font-extrabold text-[12px] shadow-sm">
              FX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="live-tour-title" className="font-heading font-bold text-[15px] sm:text-[16px] text-[#102d35] leading-tight">
                  Sân Khấu Trải Nghiệm FIXO Repair OS
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide uppercase bg-[#e7f3ee] text-[#176b58] border border-[#c4e6d4]">
                  Live Interactive Tour
                </span>
              </div>
              <p className="text-[11px] sm:text-[12px] text-[#71817b] mt-0.5">
                Mô phỏng chu trình khép kín: Tiếp nhận ➔ Kỹ Thuật Nhận sản phẩm ➔ Nghiệm thu QC ➔ Tem QR & VietQR
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-[#e6ebe8] text-[#52615c] hover:bg-[#f0f3f1] hover:text-[#102d35] flex items-center justify-center transition-colors"
              aria-label="Đóng cửa sổ"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* 4 Fast-Switch Scene Chips Navigation */}
        <div className="px-4 py-2.5 bg-[#f4f7f5] border-b border-[#e2eae5] flex items-center gap-2 overflow-x-auto no-scrollbar flex-none">
          <span className="text-[11px] font-bold text-[#556962] whitespace-nowrap hidden md:inline">
            Chuyển cảnh nhanh:
          </span>
          {SCENES.map((scene) => {
            const isActive = currentSceneIndex === scene.id;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => handleSelectScene(scene.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#176b58] text-white shadow-sm ring-2 ring-[#176b58]/20'
                    : 'bg-white text-[#475752] border border-[#dce5e0] hover:bg-[#eaf1ed] hover:text-[#102d35]'
                }`}
              >
                <span>{scene.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Interactive Live Theater Stage (Main Viewport) */}
        <div className="relative flex-1 bg-[#102d35] text-white overflow-hidden min-h-[380px] sm:min-h-[420px] flex flex-col justify-between">
          {/* Subtle Ambient Backing Grid */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#176b58 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* Top Status & Timestamp in Player */}
          <div className="relative z-10 px-5 pt-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-[#176b58] text-white text-[10px] font-bold tracking-wider uppercase">
                {SCENES[currentSceneIndex].label}
              </span>
              <span className="text-[12px] text-[#b8ccc4] font-medium hidden sm:inline">
                {SCENES[currentSceneIndex].title}
              </span>
            </div>

            <div className="flex items-center gap-2.5 bg-black/40 px-3 py-1 rounded-full text-[11px] text-[#c9ded7] border border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
              <span className="font-mono font-semibold">
                {formatTime(currentTime)} / 02:00
              </span>
            </div>
          </div>

          {/* Stage Content Area: Dynamic Scenes */}
          <div className="relative z-10 p-4 sm:p-6 flex items-center justify-center flex-1">
            {/* SCENE 0: TIẾP NHẬN & TẠO PHIẾU TỨC THÌ */}
            {currentSceneIndex === 0 && (
              <div className="w-full max-w-xl bg-white text-[#102d35] rounded-xl shadow-2xl border border-white/20 p-5 animate-in fade-in zoom-in-95 duration-300">
                {/* Header Ticket Bar */}
                <div className="flex items-center justify-between border-b border-[#e6ebe8] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#176b58]" />
                    <span className="font-heading font-extrabold text-[14px] text-[#102d35]">
                      PHIẾU TIẾP NHẬN THÔNG MINH
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#f4f7f5] text-[#52615c] text-[11px] font-mono font-bold">
                      #RO-2026-0889
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#faf3e7] text-[#a4722f] border border-[#f1e1c3] animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-ping" />
                    Chờ Kỹ thuật nhận sản phẩm (waiting_tech)
                  </span>
                </div>

                {/* Customer & Device Meta Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] bg-[#f8faf9] p-3 rounded-lg border border-[#e6ebe8] mb-3">
                  <div>
                    <span className="text-[#71817b] block text-[10px] uppercase font-bold">
                      Khách hàng
                    </span>
                    <strong className="text-[#102d35] text-[13px]">Anh Hoàng Nam</strong>
                    <span className="text-[#52615c] block text-[11px]">0912.839.xxx (Khách quen 3 lần)</span>
                  </div>
                  <div>
                    <span className="text-[#71817b] block text-[10px] uppercase font-bold">
                      Thiết bị tiếp nhận
                    </span>
                    <strong className="text-[#102d35] text-[13px]">iPhone 13 Pro Max (128GB)</strong>
                    <span className="text-[#bc5b52] font-semibold block text-[11px]">
                      Tình trạng: Pin chai 74%, phồng nhẹ
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71817b] block text-[10px] uppercase font-bold">
                      Dịch vụ chỉ định
                    </span>
                    <span className="text-[#176b58] font-bold block">
                      Thay Pin Pisen Zin + Dán ron kháng nước
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71817b] block text-[10px] uppercase font-bold">
                      Chi phí dự kiến & Thời gian
                    </span>
                    <strong className="text-[#102d35] text-[14px]">450.000 đ</strong>
                    <span className="text-[#52615c] block text-[11px]">Hẹn trả: 30 phút</span>
                  </div>
                </div>

                {/* Receipt Output Simulation with Barcode & QR */}
                <div className="flex items-center justify-between pt-2 border-t border-dashed border-[#d8e0dc]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-[#e7f3ee] text-[#176b58] flex items-center justify-center">
                      <Icon name="qr" size={24} />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-[#102d35] block">
                        Đã in phiếu & nhả mã vạch POS
                      </span>
                      <span className="text-[10px] text-[#71817b] block">
                        Tự động gửi tin nhắn biên nhận qua SMS / Zalo ZNS
                      </span>
                    </div>
                  </div>

                  {/* Mock Barcode Graphic */}
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-0.5 h-6">
                      <span className="w-1 h-full bg-[#102d35]" />
                      <span className="w-0.5 h-full bg-[#102d35]" />
                      <span className="w-1.5 h-full bg-[#102d35]" />
                      <span className="w-0.5 h-full bg-[#102d35]" />
                      <span className="w-1 h-full bg-[#102d35]" />
                      <span className="w-2 h-full bg-[#102d35]" />
                      <span className="w-0.5 h-full bg-[#102d35]" />
                      <span className="w-1.5 h-full bg-[#102d35]" />
                    </div>
                    <span className="text-[9px] font-mono text-[#71817b] mt-0.5">RO-2026-0889</span>
                  </div>
                </div>
              </div>
            )}

            {/* SCENE 1: KỸ THUẬT NHẬN SẢN PHẨM (00:30 - 01:00) */}
            {currentSceneIndex === 1 && (
              <div className="w-full max-w-xl bg-white text-[#102d35] rounded-xl shadow-2xl border border-white/20 p-5 animate-in fade-in zoom-in-95 duration-300">
                {/* Header Dispatch Bar */}
                <div className="flex items-center justify-between border-b border-[#e6ebe8] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#10b981]" />
                    </span>
                    <span className="font-heading font-extrabold text-[14px] text-[#102d35]">
                      ĐIỀU PHỐI TIẾP NHẬN SẢN PHẨM
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#edf4f8] text-[#437a9d] border border-[#d1e5f0]">
                    Đang sửa chữa (in_repair)
                  </span>
                </div>

                {/* Ting-Ting Sound Wave & Dispatch Alert Box */}
                <div className="bg-[#102d35] text-white p-4 rounded-xl relative overflow-hidden mb-3">
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-mono text-[#b8ccc4]">Tiếp nhận sản phẩm mới</span>
                        <span className="px-2 py-0.5 rounded bg-[#f59e0b] text-[#102d35] text-[10px] font-black uppercase">
                          ⚡ Cần xử lý ngay
                        </span>
                      </div>
                      <h4 className="font-heading font-extrabold text-[16px] text-white">
                        iPhone 13 Pro Max — Thay Pin Pisen Zin
                      </h4>
                      <p className="text-[11px] text-[#8ea79e] mt-0.5">
                        Định mức thời gian: 25 phút | Bàn giao hẹn: 14:45
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-[#176b58] text-white flex items-center justify-center text-lg animate-bounce">
                      ⚡
                    </div>
                  </div>

                  {/* Dynamic Action Trigger: Button lights up then auto-accepts */}
                  <div className="mt-3 pt-3 border-t border-white/10 relative z-10">
                    {currentTime % 30 < 12 ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-[#b8ccc4] flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-ping" />
                          Hệ thống đang phát chuông ting-ting điều phối sản phẩm sửa chữa tới 4 Kỹ Thuật...
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentTime(Math.floor(currentTime / 30) * 30 + 13)}
                          className="px-4 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-[12px] font-extrabold shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>⚡ Nhận máy ngay</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-[#176b58]/80 p-2.5 rounded-lg border border-[#34d399]/30 text-[12px]">
                        <div className="w-6 h-6 rounded-full bg-[#34d399] text-[#102d35] flex items-center justify-center font-bold text-xs">
                          ✓
                        </div>
                        <div>
                          <strong className="text-white block font-heading">
                            Kỹ Thuật Tuấn K. (Bàn Kỹ Thuật 02) đã nhận sản phẩm!
                          </strong>
                          <span className="text-[#d1fae5] text-[11px]">
                            Đã tự động khóa đơn và cập nhật tiến độ cho Lễ tân
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warehouse Auto Deduction Notification */}
                <div className="flex items-center justify-between text-[11px] bg-[#f8faf9] p-3 rounded-lg border border-[#e6ebe8]">
                  <div className="flex items-center gap-2">
                    <Icon name="inventory" size={16} className="text-[#176b58]" />
                    <span className="text-[#52615c]">
                      Tự động xuất kho: <strong className="text-[#102d35]">1x Pin iPhone 13 Pro Max</strong>
                    </span>
                  </div>
                  <span className="text-[#176b58] font-mono font-bold bg-[#e7f3ee] px-2 py-0.5 rounded">
                    Vị trí: Kệ A3-12
                  </span>
                </div>
              </div>
            )}

            {/* SCENE 2: HOÀN TẤT & NGHIỆM THU QC PASS */}
            {currentSceneIndex === 2 && (
              <div className="w-full max-w-xl bg-white text-[#102d35] rounded-xl shadow-2xl border border-white/20 p-5 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                {/* Header Inspection Bar */}
                <div className="flex items-center justify-between border-b border-[#e6ebe8] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Icon name="qc" size={18} className="text-[#176b58]" />
                    <span className="font-heading font-extrabold text-[14px] text-[#102d35]">
                      BIÊN BẢN KIỂM ĐỊNH KỸ THUẬT (QC)
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#eaf5ef] text-[#28805e] border border-[#c4e6d4]">
                    Sẵn sàng giao trả (ready_for_return)
                  </span>
                </div>

                {/* 4 Inspection Checkpoints Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#f8faf9] border border-[#e6ebe8] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#102d35] block">1. Dung lượng Pin 100%</span>
                      <span className="text-[#71817b] text-[10px]">Chu kỳ sạc 0 lần, IC ổn định</span>
                    </div>
                    <span className="text-[#176b58] font-bold bg-[#e7f3ee] px-2 py-0.5 rounded">
                      ✓ ĐẠT
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f8faf9] border border-[#e6ebe8] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#102d35] block">2. Face ID & Camera</span>
                      <span className="text-[#71817b] text-[10px]">Nhận diện nhanh, kính sạch</span>
                    </div>
                    <span className="text-[#176b58] font-bold bg-[#e7f3ee] px-2 py-0.5 rounded">
                      ✓ ĐẠT
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f8faf9] border border-[#e6ebe8] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#102d35] block">3. Cảm ứng & TrueTone</span>
                      <span className="text-[#71817b] text-[10px]">Đã sao chép mã hiển thị Zin</span>
                    </div>
                    <span className="text-[#176b58] font-bold bg-[#e7f3ee] px-2 py-0.5 rounded">
                      ✓ ĐẠT
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#f8faf9] border border-[#e6ebe8] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#102d35] block">4. Ron kháng nước</span>
                      <span className="text-[#71817b] text-[10px]">Ép nhiệt kín 100% theo chuẩn</span>
                    </div>
                    <span className="text-[#176b58] font-bold bg-[#e7f3ee] px-2 py-0.5 rounded">
                      ✓ ĐẠT
                    </span>
                  </div>
                </div>

                {/* Rubber Stamp "QC PASSED" Animation Overlay */}
                <div className="relative pt-2 border-t border-[#e6ebe8] flex items-center justify-between">
                  <div className="text-[11px] text-[#52615c]">
                    <span>Chữ ký Kỹ Thuật: </span>
                    <strong className="text-[#102d35]">Tuấn K. (Bàn 02)</strong>
                    <span className="block text-[10px] text-[#71817b]">Ký điện tử lúc 14:38</span>
                  </div>

                  {/* Stamp Graphic */}
                  <div className="inline-flex flex-col items-center justify-center border-2 border-[#176b58] text-[#176b58] px-3.5 py-1.5 rounded-lg rotate-[-6deg] bg-[#eaf5ef]/90 shadow-sm animate-in zoom-in-75 duration-300">
                    <span className="text-[9px] font-black tracking-widest uppercase">
                      ★ FIXO VERIFIED ★
                    </span>
                    <span className="text-[13px] font-heading font-black tracking-tight">
                      QC PASSED
                    </span>
                    <span className="text-[8px] font-bold tracking-wider uppercase">
                      ĐẠT CHUẨN XUẤT XƯỞNG
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SCENE 3: BẢO HÀNH QR & THANH TOÁN SEPAY */}
            {currentSceneIndex === 3 && (
              <div className="w-full max-w-xl bg-white text-[#102d35] rounded-xl shadow-2xl border border-white/20 p-5 animate-in fade-in zoom-in-95 duration-300">
                {/* Header Payment & Warranty Bar */}
                <div className="flex items-center justify-between border-b border-[#e6ebe8] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Icon name="payments" size={18} className="text-[#176b58]" />
                    <span className="font-heading font-extrabold text-[14px] text-[#102d35]">
                      THANH TOÁN SEPAY & BẢO HÀNH ĐIỆN TỬ
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#176b58] text-white">
                    Hoàn tất & Bàn giao (completed)
                  </span>
                </div>

                {/* 2 Columns: Left VietQR, Right Warranty Badge */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {/* Left: Dynamic VietQR SePay */}
                  <div className="bg-[#f8faf9] p-3 rounded-lg border border-[#e6ebe8] flex flex-col items-center text-center">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-black uppercase text-[#176b58] bg-[#e7f3ee] px-2 py-0.5 rounded">
                        VietQR • SePay Auto
                      </span>
                    </div>

                    {/* QR Code Graphic Frame */}
                    <div className="w-24 h-24 bg-white p-2 rounded-lg border border-[#ccd5d1] shadow-xs flex items-center justify-center relative mb-2">
                      <Icon name="qr" size={68} className="text-[#102d35]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 rounded bg-[#176b58] text-white flex items-center justify-center font-bold text-[9px]">
                          FX
                        </div>
                      </div>
                    </div>

                    <strong className="text-[15px] font-extrabold text-[#176b58] leading-tight">
                      450.000 đ
                    </strong>
                    <span className="text-[10px] font-mono text-[#71817b]">
                      ND: FIXO RO0889
                    </span>
                  </div>

                  {/* Right: Electronic Warranty Card */}
                  <div className="bg-[#102d35] text-white p-3.5 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-[#8ea79e] mb-2">
                        <span>TEM ĐIỆN TỬ</span>
                        <span className="font-mono text-[#34d399]">BH-2026-0889</span>
                      </div>
                      <strong className="block text-[13px] text-white font-heading">
                        Bảo hành Pin Pisen 06 Tháng
                      </strong>
                      <span className="text-[11px] text-[#b8ccc4] block mt-1">
                        Hạn bảo hành: <strong className="text-[#34d399]">14/10/2026</strong>
                      </span>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/10 text-[10px] text-[#8ea79e] flex items-center gap-1.5">
                      <Icon name="check" size={14} className="text-[#34d399]" />
                      <span>Đã gửi Zalo ZNS tra cứu cho khách</span>
                    </div>
                  </div>
                </div>

                {/* Live Webhook Toast Notification */}
                <div className="flex items-center justify-between bg-[#ecfdf5] border border-[#a7f3d0] p-2.5 rounded-lg text-[11px] text-[#065f46]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
                    <strong>Ting! Webhook SePay: Nhận 450.000đ thành công</strong>
                  </div>
                  <span className="font-mono text-[10px] text-[#047857]">MBBank • 14:32:05</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Player Video Controls & Timeline Bar */}
          <div className="relative z-10 px-5 pb-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-4 flex-none">
            {/* Clickable Timeline Bar */}
            <div
              className="w-full h-2 bg-white/20 hover:h-2.5 rounded-full mb-3 overflow-hidden cursor-pointer transition-all relative"
              onClick={handleSeek}
              title="Nhấn để tua đến thời điểm"
            >
              <div
                className="h-full bg-[#176b58] rounded-full transition-all duration-150"
                style={{ width: `${progressPercentage}%` }}
              />
              {/* Scene Milestone Dividers at 25%, 50%, 75% */}
              <div className="absolute top-0 bottom-0 left-1/4 w-0.5 bg-white/40 pointer-events-none" />
              <div className="absolute top-0 bottom-0 left-2/4 w-0.5 bg-white/40 pointer-events-none" />
              <div className="absolute top-0 bottom-0 left-3/4 w-0.5 bg-white/40 pointer-events-none" />
            </div>

            {/* Controls Bar */}
            <div className="flex items-center justify-between text-[12px] text-[#b8ccc4]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isPlaying ? '⏸ Tạm dừng' : '▶ Tiếp tục phát'}
                </button>

                <button
                  type="button"
                  onClick={handleRestart}
                  className="text-[#b8ccc4] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                  title="Xem lại từ đầu"
                >
                  <span>↺ Xem lại từ đầu</span>
                </button>

                <span className="font-mono text-[11px] text-[#8ea79e] hidden sm:inline">
                  {formatTime(currentTime)} / 02:00
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#8ea79e] hidden md:inline">
                  Tốc độ tour: Chuẩn 24s mô phỏng
                </span>
                <span className="text-white font-semibold text-[11px] px-2 py-0.5 rounded bg-black/40 border border-white/10">
                  FIXO Engine v2.4
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions and Direct Conversion CTA */}
        <div className="p-4 sm:p-5 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#e6ebe8] flex-none">
          <div className="text-left w-full sm:w-auto">
            <span className="text-[11px] text-[#71817b] block">
              Bạn muốn áp dụng chu trình này cho cửa hàng của mình?
            </span>
            <strong className="text-[13px] text-[#102d35]">
              Khởi tạo tài khoản chỉ mất 60 giây, không cần thẻ tín dụng.
            </strong>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-[9px] border border-[#e6ebe8] text-[#263631] text-[13px] font-bold hover:bg-[#f6f8f6] transition-colors text-center cursor-pointer"
            >
              Đóng lại
            </button>
            <Link
              href="/register?plan=trial"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-[9px] bg-[#176b58] hover:bg-[#10583f] text-white text-[13px] font-bold shadow-[0_8px_20px_rgba(23,107,88,0.2)] transition-all text-center whitespace-nowrap cursor-pointer"
            >
              Dùng thử miễn phí 14 ngày →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
