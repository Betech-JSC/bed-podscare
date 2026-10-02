'use client';

import React from 'react';

interface WorkflowStepItem {
  number: number;
  title: string;
  description: string;
  tag: string;
}

const STEPS: WorkflowStepItem[] = [
  {
    number: 1,
    tag: 'Khởi tạo',
    title: 'Tiếp nhận thiết bị',
    description:
      'Tạo phiếu sửa chữa nhanh trong 30 giây, ghi nhận tình trạng ngoại quan, kiểm tra checklist sơ bộ và in biên nhận hoặc gửi tin nhắn SMS/Zalo cho khách.',
  },
  {
    number: 2,
    tag: 'Dự toán',
    title: 'Kiểm tra & Báo giá',
    description:
      'Kỹ thuật viên chẩn đoán lỗi chính xác theo bảng kiểm tra chuẩn, lập dự toán linh kiện và gửi báo giá minh bạch để khách hàng duyệt trước khi làm.',
  },
  {
    number: 3,
    tag: 'Thực thi',
    title: 'Sửa chữa & Kiểm định QC',
    description:
      'Xuất kho linh kiện theo đơn, kỹ thuật viên tiến hành xử lý, ghi chú quá trình sửa chữa và kiểm định chất lượng (QC) nghiêm ngặt trước khi đóng máy.',
  },
  {
    number: 4,
    tag: 'Bàn giao',
    title: 'Giao máy & Bảo hành',
    description:
      'Thanh toán tiện lợi qua mã VietQR động, bàn giao máy nguyên vẹn cho khách và hệ thống tự động kích hoạt tem bảo hành điện tử chống gian lận.',
  },
];

export const WorkflowSteps: React.FC = () => {
  return (
    <section id="workflow" className="py-20 sm:py-24 bg-[#f5faf7] scroll-mt-20 border-b border-[#e6ebe8]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-[720px] mx-auto mb-16">
          <div className="inline-block px-3.5 py-1.5 rounded-full bg-[#e7f3ee] text-[#176b58] text-[11px] font-extrabold uppercase tracking-wider mb-4">
            BẮT ĐẦU TRONG VÀI PHÚT
          </div>
          <h2 className="font-heading font-extrabold text-[32px] sm:text-[42px] text-[#102d35] leading-tight tracking-[-1.5px] mb-4">
            Từ lúc tiếp nhận đến khi giao máy
          </h2>
          <p className="text-[15px] sm:text-[16px] text-[#71817b] leading-relaxed">
            FIXO giúp chuẩn hóa toàn bộ quy trình vận hành tiệm sửa chữa qua 4 bước khoa học, nâng cao năng suất và tạo niềm tin tuyệt đối với khách hàng.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="bg-white rounded-2xl p-6 sm:p-7 border border-[#e6ebe8] shadow-xs relative flex flex-col justify-between hover:shadow-md hover:border-[#176b58]/40 transition-all group"
            >
              <div>
                {/* Step Number Badge */}
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-full bg-[#176b58] text-white flex items-center justify-center font-heading font-extrabold text-[16px] shadow-sm group-hover:scale-105 transition-transform">
                    {step.number}
                  </div>
                  <span className="text-[11px] font-bold text-[#176b58] bg-[#e7f3ee] px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {step.tag}
                  </span>
                </div>

                {/* Step Title */}
                <h3 className="font-heading font-bold text-[17px] sm:text-[18px] text-[#102d35] mb-2.5 leading-snug">
                  {step.title}
                </h3>

                {/* Step Description */}
                <p className="text-[13px] text-[#71817b] leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Progress Line Indicator */}
              <div className="mt-6 pt-4 border-t border-[#f0f3f1] flex items-center justify-between text-[11px] text-[#8a9691] font-medium">
                <span>Bước {step.number} / 4</span>
                <span className="text-[#176b58] font-bold">Quy chuẩn FIXO</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
