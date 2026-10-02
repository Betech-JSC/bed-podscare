'use client';

import React from 'react';

export const DashboardMockup: React.FC = () => {
  return (
    <div className="relative w-full max-w-[680px] lg:max-w-none mx-auto pt-4 pb-8 sm:pr-8 select-none">
      {/* Soft Ambient Glow */}
      <div
        className="absolute -top-10 -right-10 w-[300px] h-[300px] bg-[#176b58]/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* macOS Web Console Frame */}
      <div className="relative bg-white rounded-2xl border border-[#dfe7e3] shadow-[0_25px_70px_rgba(16,37,31,0.12)] overflow-hidden">
        {/* Window Topbar */}
        <div className="h-10 bg-[#f8faf9] px-4 flex items-center justify-between border-b border-[#e6ebe8]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block border border-[#e0443e]/40" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block border border-[#dea123]/40" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block border border-[#1aab29]/40" />
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-white border border-[#e6ebe8] rounded-md text-[11px] font-medium text-[#71817b] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#176b58] animate-pulse" />
            <span>app.fixo.com.vn/dashboard</span>
          </div>

          <div className="w-12" />
        </div>

        {/* Dashboard Window Body */}
        <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[150px_1fr] min-h-[380px] sm:min-h-[420px]">
          {/* Dark Forest Sidebar */}
          <aside className="bg-[#102d35] p-3 sm:p-4 text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-5 px-1 pt-1">
                <div className="w-6 h-6 rounded-md bg-[#176b58] flex items-center justify-center font-heading font-extrabold text-[10px] text-white">
                  FX
                </div>
                <span className="font-heading font-extrabold text-[14px] tracking-tight">
                  FIXO OS
                </span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#176b58] text-white font-semibold shadow-xs">
                  <span>◈</span>
                  <span>Tổng quan</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>▣</span>
                  <span>Đơn sửa chữa</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>♙</span>
                  <span>Khách hàng</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>◉</span>
                  <span>Sản phẩm</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>◇</span>
                  <span>Linh kiện kho</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>✓</span>
                  <span>Bảo hành</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>₫</span>
                  <span>Thu chi</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[#b7c8c2] hover:text-white transition-colors">
                  <span>▥</span>
                  <span>Báo cáo</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#1e444e] text-[10px] text-[#7d9990] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span>Hệ thống online</span>
            </div>
          </aside>

          {/* Main Dashboard Canvas */}
          <main className="p-3 sm:p-5 bg-[#fbfcfb] overflow-hidden flex flex-col justify-between">
            {/* Top Bar Header */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-heading font-extrabold text-[16px] sm:text-[18px] text-[#102d35] leading-tight">
                    Tổng quan vận hành
                  </h3>
                  <p className="text-[11px] text-[#71817b]">Hôm nay, 02/10/2026</p>
                </div>
                <span className="text-[10px] font-semibold bg-white border border-[#e6ebe8] text-[#52615c] px-2.5 py-1 rounded-md shadow-xs">
                  Tháng 10/2026
                </span>
              </div>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mb-4">
                <div className="bg-white p-2.5 rounded-lg border border-[#e6ebe8] shadow-xs">
                  <span className="text-[9px] font-medium text-[#71817b] block">Doanh thu</span>
                  <span className="font-heading font-extrabold text-[14px] sm:text-[15px] text-[#102d35] block leading-tight mt-0.5">
                    24.500.000đ
                  </span>
                  <span className="text-[9px] font-bold text-[#176b58] block mt-0.5">↑ 12%</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-[#e6ebe8] shadow-xs">
                  <span className="text-[9px] font-medium text-[#71817b] block">Đơn sửa</span>
                  <span className="font-heading font-extrabold text-[14px] sm:text-[15px] text-[#102d35] block leading-tight mt-0.5">
                    56 đơn
                  </span>
                  <span className="text-[9px] font-bold text-[#176b58] block mt-0.5">↑ 20%</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-[#e6ebe8] shadow-xs">
                  <span className="text-[9px] font-medium text-[#71817b] block">Khách mới</span>
                  <span className="font-heading font-extrabold text-[14px] sm:text-[15px] text-[#102d35] block leading-tight mt-0.5">
                    38 khách
                  </span>
                  <span className="text-[9px] font-bold text-[#176b58] block mt-0.5">↑ 15%</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-[#e6ebe8] shadow-xs">
                  <span className="text-[9px] font-medium text-[#71817b] block">Linh kiện tồn</span>
                  <span className="font-heading font-extrabold text-[14px] sm:text-[15px] text-[#102d35] block leading-tight mt-0.5">
                    320 mã
                  </span>
                  <span className="text-[9px] font-medium text-[#84918d] block mt-0.5">Đủ cung ứng</span>
                </div>
              </div>

              {/* 2 Charts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-2.5">
                {/* Bar Chart: Doanh thu theo ngày */}
                <div className="bg-white p-3 rounded-lg border border-[#e6ebe8] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-[#102d35]">Doanh thu theo ngày</span>
                    <span className="text-[9px] text-[#84918d]">10 ngày qua</span>
                  </div>

                  {/* Pure CSS Bars */}
                  <div className="h-[95px] flex items-end justify-between gap-1.5 pt-2 pb-1 border-b border-[#f0f3f1]">
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '32%' }} title="Ngày 1" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '45%' }} title="Ngày 2" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '40%' }} title="Ngày 3" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '60%' }} title="Ngày 4" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '52%' }} title="Ngày 5" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '70%' }} title="Ngày 6" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '78%' }} title="Ngày 7" />
                    <div className="w-full bg-[#b8e4d3] hover:bg-[#176b58] transition-colors rounded-t-sm" style={{ height: '68%' }} title="Ngày 8" />
                    <div className="w-full bg-[#176b58] rounded-t-sm" style={{ height: '88%' }} title="Ngày 9" />
                    <div className="w-full bg-[#176b58] rounded-t-sm" style={{ height: '96%' }} title="Hôm nay" />
                  </div>
                  <div className="flex justify-between text-[8px] text-[#84918d] pt-1">
                    <span>N1</span>
                    <span>N5</span>
                    <span className="font-bold text-[#176b58]">Hôm nay</span>
                  </div>
                </div>

                {/* Donut Chart: Tình trạng đơn hàng */}
                <div className="bg-white p-3 rounded-lg border border-[#e6ebe8] shadow-xs flex flex-col items-center justify-between">
                  <div className="w-full flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-[#102d35]">Tình trạng đơn</span>
                    <span className="text-[9px] text-[#176b58] font-bold">56 đơn</span>
                  </div>

                  {/* Pure CSS Conic Gradient Donut */}
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center my-1"
                    style={{
                      background:
                        'conic-gradient(#176b58 0% 65%, #3b82f6 65% 82%, #f59e0b 82% 94%, #e2e8f0 94% 100%)',
                    }}
                  >
                    <div className="w-12 h-12 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                      <span className="text-[12px] font-heading font-extrabold text-[#102d35] leading-none">
                        56
                      </span>
                      <span className="text-[7px] text-[#71817b] uppercase mt-0.5">Tổng</span>
                    </div>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-[#52615c] pt-1 border-t border-[#f0f3f1]">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
                      <span>Xong (65%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                      <span>Sửa (17%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span>Linh kiện (12%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#e2e8f0]" />
                      <span>Khác (6%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Floating 3D Mobile Frame */}
      <div className="hidden sm:block absolute -right-4 -bottom-6 w-[175px] bg-[#111d21] rounded-[26px] p-2 shadow-[0_25px_50px_rgba(0,0,0,0.28)] border-2 border-white/20 transition-transform hover:-translate-y-1">
        <div className="bg-white rounded-[20px] overflow-hidden min-h-[295px] flex flex-col">
          {/* Mobile Status Bar & Notch */}
          <div className="pt-2 px-3 pb-1 flex justify-between items-center text-[7px] font-bold text-[#102d35]">
            <span>9:41</span>
            <div className="w-10 h-2 bg-[#111d21] rounded-full mx-auto" />
            <span>5G 100%</span>
          </div>

          <div className="px-3 pt-1 pb-1.5 flex items-center justify-between border-b border-[#f0f3f1]">
            <span className="text-[10px] font-heading font-extrabold text-[#102d35]">
              Đơn sửa chữa
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#176b58]" />
          </div>

          {/* Search Box */}
          <div className="m-2 px-2 py-1 bg-[#f4f7f5] rounded-md border border-[#e6ebe8] text-[8px] text-[#84918d] flex items-center gap-1">
            <span>🔍</span>
            <span className="truncate">Tìm mã đơn, tên khách...</span>
          </div>

          {/* 3 Realtime Repair Tickets */}
          <div className="px-2 space-y-1.5 pb-2">
            <div className="p-1.5 bg-white rounded-lg border border-[#e6ebe8] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] font-extrabold text-[#102d35]">
                  #FX26-00983
                </span>
                <span className="text-[7px] font-bold text-[#176b58] bg-[#dff5e9] px-1.5 py-0.5 rounded">
                  Đang sửa
                </span>
              </div>
              <p className="text-[8px] font-medium text-[#263631] mt-0.5 truncate">
                Nguyễn Văn A · iPhone 13 Pro
              </p>
            </div>

            <div className="p-1.5 bg-white rounded-lg border border-[#e6ebe8] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] font-extrabold text-[#102d35]">
                  #FX26-00982
                </span>
                <span className="text-[7px] font-bold text-[#059669] bg-[#ecfdf5] px-1.5 py-0.5 rounded">
                  Hoàn tất
                </span>
              </div>
              <p className="text-[8px] font-medium text-[#263631] mt-0.5 truncate">
                Trần Thị B · MacBook Air M1
              </p>
            </div>

            <div className="p-1.5 bg-white rounded-lg border border-[#e6ebe8] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] font-extrabold text-[#102d35]">
                  #FX26-00981
                </span>
                <span className="text-[7px] font-bold text-[#d97706] bg-[#fef3c7] px-1.5 py-0.5 rounded">
                  Chờ linh kiện
                </span>
              </div>
              <p className="text-[8px] font-medium text-[#263631] mt-0.5 truncate">
                Lê Minh C · AirPods Pro 2
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
