'use client';

import React from 'react';
import { StatusTag, Button } from '@podscare/ui';
import type { OrderStatusType } from '@podscare/types';
import {
  STORE_ROLE_LABELS,
  STORE_ROLE_ORDER,
  type StoreRoleKey,
} from './types';

export interface SystemOverviewSectionProps {
  onSelectRoleTab?: (role: StoreRoleKey) => void;
  onNavigateModule?: (href: string, moduleId: string) => void;
  allowedModuleIds?: string[];
  searchQuery?: string;
}

interface StageItem {
  stageNumber: string;
  title: string;
  primaryRoles: StoreRoleKey[];
  moduleName: string;
  moduleId: string;
  moduleHref: string;
  fsmBadgeLabel: string;
  fsmBadgeType: OrderStatusType;
  fsmCodeFlow: string;
  summary: string;
  deliverables: string[];
  handoverNote: string;
}

interface FsmBranchItem {
  id: string;
  code: string;
  title: string;
  statusLabel: string;
  statusType: OrderStatusType;
  flowPath: string;
  involvedRoles: StoreRoleKey[];
  triggerCondition: string;
  systemMechanism: string;
  outcome: string;
}

interface HandoverMatrixRow {
  touchpoint: string;
  fromRole: string;
  toRole: string;
  fsmTransition: string;
  statusType: OrderStatusType;
  systemGuardrail: string;
}

const SIX_STAGES: StageItem[] = [
  {
    stageNumber: '01',
    title: 'Mở ca làm việc & Khai báo quỹ đầu ca',
    primaryRoles: ['cskh', 'admin'],
    moduleName: 'Sổ quỹ & Ca trực',
    moduleId: 'shifts',
    moduleHref: '/shifts',
    fsmBadgeLabel: 'Ca trực Đang mở',
    fsmBadgeType: 'ready',
    fsmCodeFlow: 'shift: closed -> open',
    summary:
      'Trước khi phát sinh giao dịch thu tiền sửa chữa, nhận cọc hoặc chi phí vận hành tại cửa hàng, nhân sự trực quầy mở ca làm việc và kiểm đếm tiền mặt thực tế đầu ca.',
    deliverables: [
      'Ghi nhận số dư tiền mặt đầu ca chính xác vào Sổ quỹ ca trực.',
      'Kích hoạt quyền tạo phiếu thu tiền mặt và phiếu chi nội bộ trong ca.',
      'Đồng bộ trạng thái ca trực lên thanh công cụ Topbar toàn cửa hàng.',
    ],
    handoverNote:
      'Sẵn sàng tiếp nhận thiết bị khách hàng và ghi nhận dòng tiền phát sinh trong ngày.',
  },
  {
    stageNumber: '02',
    title: 'Tiếp nhận Thiết bị, Chẩn đoán sơ bộ & Báo giá',
    primaryRoles: ['cskh'],
    moduleName: 'Tổng quan / Đơn sửa chữa',
    moduleId: 'repairs',
    moduleHref: '/repairs',
    fsmBadgeLabel: 'Chờ kỹ thuật',
    fsmBadgeType: 'wait',
    fsmCodeFlow: 'received -> inspecting / waiting_approval -> waiting_tech',
    summary:
      'Lễ tân / CSKH tra cứu SĐT khách hàng (hệ thống tự động lọc ký tự ẩn Unicode từ Zalo/Danh bạ), chọn dòng thiết bị Apple, ghi nhận ngoại quan độc lập từng bộ phận (Tai trái, Tai phải, Hộp sạc, Đồng hồ) và báo giá dự kiến.',
    deliverables: [
      'Khởi tạo mã đơn sửa chữa (RO-...) thông qua Bàn tiếp nhận nhanh hoặc Wizard chi tiết.',
      'In Phiếu tiếp nhận A4 2 liên (1 liên giao khách, 1 liên kẹp máy) hoặc Phiếu nhiệt K80.',
      'Chuyển trạng thái đơn sang Chờ kỹ thuật (waiting_tech) sau khi khách đồng ý sửa.',
    ],
    handoverNote:
      'CSKH bàn giao thiết bị vật lý kèm phiếu tiếp nhận vào Hàng đợi chờ sửa của Kỹ thuật viên.',
  },
  {
    stageNumber: '03',
    title: 'Sửa chữa Chuyên sâu & Phối hợp Linh kiện',
    primaryRoles: ['tech', 'inventory'],
    moduleName: 'Không gian Kỹ thuật & Kho',
    moduleId: 'tech',
    moduleHref: '/tech',
    fsmBadgeLabel: 'Đang sửa / Chờ QC',
    fsmBadgeType: 'progress',
    fsmCodeFlow: 'waiting_tech -> assigned -> in_repair <-> waiting_parts -> waiting_qc',
    summary:
      'Kỹ thuật viên nhận đơn từ Hàng đợi vào Bàn làm việc cá nhân, ghi nhận chẩn đoán kỹ thuật chi tiết cho từng thành phần phần cứng, bóc tách linh kiện kho sử dụng hoặc gửi phiếu Yêu cầu linh kiện đặc biệt cho Thủ kho.',
    deliverables: [
      'Ghi nhận kết quả chẩn đoán và danh sách linh kiện SKU thực tế lắp vào máy.',
      'Hỗ trợ Bàn giao đơn giữa ca cho kỹ thuật viên khác nếu hết ca mà máy chưa hoàn tất.',
      'Bấm Hoàn thành sửa để đẩy đơn sang trạng thái Chờ QC (waiting_qc).',
    ],
    handoverNote:
      'Kỹ thuật viên chuyển thiết bị đã sửa xong sang bàn Kiểm định Chất lượng (QC).',
  },
  {
    stageNumber: '04',
    title: 'Kiểm định Chất lượng Độc lập (QC Gate)',
    primaryRoles: ['qc'],
    moduleName: 'Kiểm định QC',
    moduleId: 'qc',
    moduleHref: '/qc',
    fsmBadgeLabel: 'Chờ trả khách',
    fsmBadgeType: 'ready',
    fsmCodeFlow: 'waiting_qc -> ready_for_return (hoặc rework_needed)',
    summary:
      'Nhân sự QC độc lập kiểm tra toàn diện chất lượng thiết bị sau sửa chữa dựa trên yêu cầu ban đầu của khách, ghi chú của kỹ thuật viên và bộ Checklist tiêu chuẩn riêng cho từng dòng máy Apple.',
    deliverables: [
      'Kiểm tra Âm thanh, Mic đàm thoại, Chống ồn ANC/Transparency, Cảm biến, Pin, Sạc và Ngoại quan.',
      'Nếu đạt chuẩn 100%: Duyệt QC Đạt để chuyển đơn sang Chờ trả khách (ready_for_return).',
      'Nếu phát hiện lỗi: Đánh dấu Không đạt / Yêu cầu làm lại (rework_needed) kèm lý do bắt buộc.',
    ],
    handoverNote:
      'Khi QC Đạt, hệ thống phát thông báo cho CSKH liên hệ khách đến nhận máy và thanh toán.',
  },
  {
    stageNumber: '05',
    title: 'Thu tiền (Tiền mặt / VietQR SePay / COD) & Trả máy',
    primaryRoles: ['cskh'],
    moduleName: 'Đơn sửa chữa & Thanh toán',
    moduleId: 'repairs',
    moduleHref: '/repairs',
    fsmBadgeLabel: 'Hoàn tất trả máy',
    fsmBadgeType: 'ready',
    fsmCodeFlow: 'ready_for_return / waiting_pickup -> completed',
    summary:
      'CSKH đối soát tổng chi phí đơn hàng với khách. Hệ thống thực thi rào chắn thanh toán (Payment Guardrails): bắt buộc hoàn tất thu tiền hoặc gán COD Giao nhận hợp lệ trước khi mở khóa thao tác Trả máy.',
    deliverables: [
      'Thu tiền mặt tại quầy hoặc sinh mã động VietQR (SePay) tự động xác nhận giao dịch realtime.',
      'Hoặc thiết lập phương thức Giao nhận COD đối với khách ở xa.',
      'Bấm Trả máy / Hoàn tất (completed) và xuất phiếu bảo hành kiêm biên nhận thanh toán.',
    ],
    handoverNote:
      'Khách hàng nhận lại thiết bị; hệ thống tự động kích hoạt chuỗi tác vụ hậu xử lý.',
  },
  {
    stageNumber: '06',
    title: 'Hậu xử lý Tự động, Khấu trừ Tồn kho & Kiểm toán',
    primaryRoles: ['admin', 'inventory'],
    moduleName: 'Kho, Bảo hành, Sổ quỹ & Audit',
    moduleId: 'audit',
    moduleHref: '/audit',
    fsmBadgeLabel: 'Đồng bộ Tự động',
    fsmBadgeType: 'new',
    fsmCodeFlow: 'completed -> inventory_deducted + warranty_active + ledger_recorded + audit_logged',
    summary:
      'Ngay tại thời điểm đơn hàng chuyển sang trạng thái Hoàn tất (completed), Backend Laravel thực thi nguyên tử (atomic & idempotent) 4 nghiệp vụ hậu xử lý mà nhân viên không cần nhập lặp lại.',
    deliverables: [
      'Tự động trừ tồn kho linh kiện theo định mức thực dùng và chốt Giá vốn hàng bán (COGS).',
      'Tự động kích hoạt thời hạn Bảo hành điện tử theo từng hạng mục linh kiện/dịch vụ.',
      'Tự động ghi nhận doanh thu vào Sổ quỹ ca trực và lưu vết Nhật ký kiểm toán (Audit Log).',
    ],
    handoverNote:
      'Quản trị viên (Admin) giám sát Lợi nhuận ròng, KPI nhân sự và đối soát Sổ quỹ cuối ngày.',
  },
];

const FSM_BRANCHES: FsmBranchItem[] = [
  {
    id: 'waiting_parts',
    code: 'NHÁNH RẼ 01 · WAITING_PARTS',
    title: 'Luồng Yêu cầu Linh kiện Đặc biệt ngoài danh mục hoặc hết tồn kho',
    statusLabel: 'Chờ linh kiện (waiting_parts)',
    statusType: 'wait',
    flowPath: 'in_repair -> waiting_parts -> [Thủ kho Duyệt & Nhập hàng] -> in_repair',
    involvedRoles: ['tech', 'inventory'],
    triggerCondition:
      'Kỹ thuật viên đang sửa máy phát hiện cần linh kiện đặc thù chưa có trong kho hoặc số lượng tồn kho bằng 0.',
    systemMechanism:
      'Kỹ thuật viên tạo phiếu tại SpecialPartsRequestModal. Đơn tự động chuyển sang trạng thái Chờ linh kiện (waiting_parts) và đẩy thông báo sang module Kho & Mua hàng (/inventory) của Thủ kho.',
    outcome:
      'Ngay khi Thủ kho đặt mua và xác nhận Nhập kho cho yêu cầu đó, hệ thống tự động giải phóng đơn về trạng thái Đang sửa (in_repair) để Kỹ thuật viên lắp ráp hoàn tất.',
  },
  {
    id: 'rework_needed',
    code: 'NHÁNH RẼ 02 · REWORK_NEEDED',
    title: 'Luồng QC Từ chối Nghiệm thu & Trả ngược về Bàn Kỹ thuật',
    statusLabel: 'Yêu cầu làm lại (rework_needed)',
    statusType: 'danger',
    flowPath: 'waiting_qc -> rework_needed -> in_repair -> waiting_qc',
    involvedRoles: ['qc', 'tech'],
    triggerCondition:
      'Nhân viên Kiểm định QC phát hiện lỗi chưa khắc phục triệt để (ví dụ: tai nghe còn rè khi bật ANC, sạc không đều, vỏ hở keo).',
    systemMechanism:
      'QC chọn Không đạt / Yêu cầu làm lại và bắt buộc nhập ghi chú lỗi chi tiết. Hệ thống khóa chiều chuyển sang Chờ trả khách và trả đơn về trạng thái rework_needed.',
    outcome:
      'Đơn xuất hiện nổi bật với nhãn Yêu cầu làm lại tại Bàn làm việc của Kỹ thuật viên phụ trách kèm nguyên nhân lỗi của QC để xử lý lại và gửi duyệt QC lần tiếp theo.',
  },
  {
    id: 'warranty_refund',
    code: 'NHÁNH RẼ 03 · WARRANTY & REFUND',
    title: 'Luồng Tiếp nhận Bảo hành (Rework) & Hoàn tiền (Refund) sau khi trả máy',
    statusLabel: 'Bảo hành / Hoàn tiền',
    statusType: 'progress',
    flowPath: 'completed -> warranty_claim (rework) HOẶC refund_processed (audit & ledger)',
    involvedRoles: ['cskh', 'tech', 'admin'],
    triggerCondition:
      'Khách hàng mang thiết bị đã Hoàn tất quay lại cửa hàng trong thời hạn bảo hành điện tử do tái phát lỗi kỹ thuật.',
    systemMechanism:
      'CSKH tra cứu hạn bảo hành tại module Bảo hành (/warranty) hoặc đơn gốc để mở ca Tiếp nhận bảo hành (Rework) gắn liền lịch sử sửa chữa trước đó. Nếu bất khả kháng cần hoàn tiền, thực hiện qua RefundModal.',
    outcome:
      'Khi hoàn tiền, hệ thống tự động khấu trừ Doanh thu thực thu, tạo phiếu chi hoàn tiền trên Sổ quỹ ca trực và lưu bảng đối chiếu Before / After Diff trong Nhật ký kiểm toán (/audit).',
  },
];

const HANDOVER_MATRIX: HandoverMatrixRow[] = [
  {
    touchpoint: '1. Khai báo mở ca đầu ngày',
    fromRole: 'Lễ tân / CSKH hoặc Admin',
    toRole: 'Hệ thống Sổ quỹ (/shifts)',
    fsmTransition: 'shift: closed -> open',
    statusType: 'ready',
    systemGuardrail: 'Chặn mọi thao tác thu/chi tiền mặt nếu chưa có ca trực đang mở.',
  },
  {
    touchpoint: '2. Tiếp nhận máy & chốt báo giá',
    fromRole: 'Lễ tân / CSKH (cskh)',
    toRole: 'Kỹ thuật viên (tech)',
    fsmTransition: 'received -> waiting_tech',
    statusType: 'wait',
    systemGuardrail: 'Chuẩn hóa SĐT Unicode; ghi nhận tình trạng riêng từng bộ phận thiết bị.',
  },
  {
    touchpoint: '3. Nhận máy & bóc tách linh kiện',
    fromRole: 'Kỹ thuật viên (tech)',
    toRole: 'Thủ kho (inventory)',
    fsmTransition: 'waiting_tech -> in_repair <-> waiting_parts',
    statusType: 'progress',
    systemGuardrail: 'Ẩn 100% giá bán/doanh thu đối với role Kỹ thuật viên (Financial RBAC).',
  },
  {
    touchpoint: '4. Hoàn thành sửa & gửi nghiệm thu',
    fromRole: 'Kỹ thuật viên (tech)',
    toRole: 'Kiểm định QC (qc)',
    fsmTransition: 'in_repair -> waiting_qc',
    statusType: 'wait',
    systemGuardrail: 'Bắt buộc có thông tin chẩn đoán kỹ thuật trước khi chuyển sang Chờ QC.',
  },
  {
    touchpoint: '5. Nghiệm thu chất lượng độc lập',
    fromRole: 'Kiểm định QC (qc)',
    toRole: 'CSKH (Đạt) hoặc Tech (Lỗi)',
    fsmTransition: 'waiting_qc -> ready_for_return | rework_needed',
    statusType: 'ready',
    systemGuardrail: 'Bắt buộc nhập lý do lỗi cụ thể nếu đánh dấu Không đạt (rework_needed).',
  },
  {
    touchpoint: '6. Thu tiền, trả máy & hậu xử lý',
    fromRole: 'Lễ tân / CSKH (cskh)',
    toRole: 'Hệ thống & Quản trị viên (admin)',
    fsmTransition: 'ready_for_return -> completed',
    statusType: 'new',
    systemGuardrail: 'Rào chắn thanh toán (Đủ tiền / SePay VietQR / COD) & trừ kho Idempotent.',
  },
];

export const SystemOverviewSection: React.FC<SystemOverviewSectionProps> = ({
  onSelectRoleTab,
  onNavigateModule,
  allowedModuleIds = [],
  searchQuery = '',
}) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredStages = normalizedQuery
    ? SIX_STAGES.filter(
        (stage) =>
          stage.title.toLowerCase().includes(normalizedQuery) ||
          stage.summary.toLowerCase().includes(normalizedQuery) ||
          stage.moduleName.toLowerCase().includes(normalizedQuery) ||
          stage.fsmCodeFlow.toLowerCase().includes(normalizedQuery) ||
          stage.deliverables.some((d) => d.toLowerCase().includes(normalizedQuery))
      )
    : SIX_STAGES;

  const filteredBranches = normalizedQuery
    ? FSM_BRANCHES.filter(
        (branch) =>
          branch.title.toLowerCase().includes(normalizedQuery) ||
          branch.flowPath.toLowerCase().includes(normalizedQuery) ||
          branch.triggerCondition.toLowerCase().includes(normalizedQuery) ||
          branch.systemMechanism.toLowerCase().includes(normalizedQuery) ||
          branch.outcome.toLowerCase().includes(normalizedQuery)
      )
    : FSM_BRANCHES;

  const filteredMatrix = normalizedQuery
    ? HANDOVER_MATRIX.filter(
        (row) =>
          row.touchpoint.toLowerCase().includes(normalizedQuery) ||
          row.fromRole.toLowerCase().includes(normalizedQuery) ||
          row.toRole.toLowerCase().includes(normalizedQuery) ||
          row.fsmTransition.toLowerCase().includes(normalizedQuery) ||
          row.systemGuardrail.toLowerCase().includes(normalizedQuery)
      )
    : HANDOVER_MATRIX;

  return (
    <div className="space-y-6">
      {/* 1. Architecture Summary Banner */}
      <div className="p-5 rounded-[12px] bg-[#f6f8f6] border border-[#dce6e0]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#e5ece8]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#176b51] mb-1">
              KIẾN TRÚC VẬN HÀNH KHÉP KÍN · END-TO-END REPAIR OS
            </div>
            <h3 className="font-heading text-base sm:text-lg font-bold text-[#17231f] m-0">
              Bức tranh tổng thể 6 giai đoạn vận hành xưởng sửa chữa thiết bị Apple
            </h3>
            <p className="text-xs sm:text-sm text-[#596962] mt-1 mb-0 leading-relaxed max-w-3xl">
              Mọi đơn sửa chữa trong FIXO Repair OS đều đi qua máy trạng thái (Repair Order FSM) kiểm soát chặt chẽ giữa 5 vai trò cấp cửa hàng. Không bộ phận nào có thể bỏ qua bước kiểm định chất lượng (QC) hoặc trả máy khi chưa hoàn tất đối soát thanh toán.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-none">
            <StatusTag type="ready" label="6 Giai đoạn Chuẩn" />
            <StatusTag type="progress" label="5 Vai trò Cửa hàng" />
            <StatusTag type="wait" label="3 Nhánh rẽ FSM" />
          </div>
        </div>

        {/* Role Quick Jump Bar */}
        <div className="pt-3.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#596962]">
            Chọn nhanh cẩm nang chi tiết theo từng vị trí vận hành:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {STORE_ROLE_ORDER.map((roleKey) => (
              <button
                key={roleKey}
                type="button"
                onClick={() => onSelectRoleTab?.(roleKey)}
                className="px-2.5 py-1.5 rounded-[7px] text-xs font-semibold bg-white text-[#17231f] border border-[#dce6e0] hover:border-[#176b51] hover:bg-[#e9f4ef] hover:text-[#176b51] transition-colors cursor-pointer"
              >
                {STORE_ROLE_LABELS[roleKey]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 6-Stage End-to-End Pipeline */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#81908a]">
              LUỒNG CHÍNH (MAIN WORKFLOW)
            </div>
            <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
              Chu trình 6 giai đoạn xử lý đơn hàng từ tiếp nhận đến hậu xử lý tự động
            </h4>
          </div>
          <span className="text-xs text-[#81908a]">
            Nhấp vào tên vai trò trên từng giai đoạn để xem hướng dẫn thao tác chi tiết
          </span>
        </div>

        {filteredStages.length === 0 ? (
          <div className="p-6 rounded-[10px] bg-[#fafbfa] border border-[#e9eeeb] text-center text-xs text-[#81908a]">
            Không có giai đoạn nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStages.map((stage) => {
              const canAccessModule = allowedModuleIds.includes(stage.moduleId);
              return (
                <div
                  key={stage.stageNumber}
                  className="p-4 rounded-[10px] bg-white border border-[#e5ece8] flex flex-col justify-between gap-3 shadow-[0_2px_5px_rgba(36,60,41,0.03)]"
                >
                  <div className="space-y-2.5">
                    {/* Stage Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-[7px] bg-[#176b51] text-white font-heading font-bold text-xs grid place-items-center flex-none">
                          {stage.stageNumber}
                        </span>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a]">
                            GIAI ĐOẠN {stage.stageNumber} · {stage.moduleName}
                          </span>
                          <h5 className="font-heading text-sm font-bold text-[#17231f] m-0 leading-snug">
                            {stage.title}
                          </h5>
                        </div>
                      </div>
                      <StatusTag
                        type={stage.fsmBadgeType}
                        label={stage.fsmBadgeLabel}
                        className="flex-none"
                      />
                    </div>

                    {/* FSM Code & Responsible Roles */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb]">
                      <code className="text-[11px] font-mono font-semibold text-[#176b51]">
                        {stage.fsmCodeFlow}
                      </code>
                      <div className="flex flex-wrap items-center gap-1">
                        {stage.primaryRoles.map((rKey) => (
                          <button
                            key={rKey}
                            type="button"
                            onClick={() => onSelectRoleTab?.(rKey)}
                            className="px-2 py-0.5 rounded-[5px] text-[10px] font-bold bg-[#e9f4ef] text-[#176b51] border border-[#cde2d6] hover:bg-[#176b51] hover:text-white transition-colors cursor-pointer"
                          >
                            {STORE_ROLE_LABELS[rKey]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[#4b5b54] m-0 leading-relaxed">
                      {stage.summary}
                    </p>

                    {/* Key Deliverables */}
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a]">
                        Kết quả & Ràng buộc tại giai đoạn này:
                      </div>
                      <ul className="m-0 pl-4 space-y-1 text-xs text-[#17231f]">
                        {stage.deliverables.map((item, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Handover Footer */}
                  <div className="pt-2.5 border-t border-[#f0f3f1] flex items-center justify-between gap-2">
                    <div className="text-[11px] text-[#596962]">
                      <strong className="font-semibold text-[#17231f]">Bàn giao tiếp theo: </strong>
                      {stage.handoverNote}
                    </div>
                    {canAccessModule && onNavigateModule && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onNavigateModule(stage.moduleHref, stage.moduleId)}
                        className="flex-none text-[11px] h-7 px-2.5"
                      >
                        Mở module
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Three Special FSM Branching Flows */}
      <section className="space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#b77a21]">
            LUỒNG RẼ NHÁNH ĐẶC BIỆT (FSM EXCEPTION & BRANCHING FLOWS)
          </div>
          <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
            3 nhánh rẽ nghiệp vụ trọng yếu: Chờ linh kiện, QC yêu cầu làm lại & Bảo hành / Hoàn tiền
          </h4>
        </div>

        {filteredBranches.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {filteredBranches.map((branch) => (
              <div
                key={branch.id}
                className="p-4 rounded-[10px] bg-[#fafbfa] border border-[#e5ece8] flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#81908a]">
                      {branch.code}
                    </span>
                    <StatusTag type={branch.statusType} label={branch.statusLabel} />
                  </div>

                  <h5 className="font-heading text-sm font-bold text-[#17231f] m-0 leading-snug">
                    {branch.title}
                  </h5>

                  <div className="px-2.5 py-1.5 rounded-[6px] bg-white border border-[#e9eeeb]">
                    <code className="text-[11px] font-mono font-semibold text-[#176b51] break-words">
                      {branch.flowPath}
                    </code>
                  </div>

                  <div className="space-y-1.5 text-xs text-[#4b5b54]">
                    <div>
                      <strong className="font-semibold text-[#17231f]">Khi nào kích hoạt: </strong>
                      {branch.triggerCondition}
                    </div>
                    <div>
                      <strong className="font-semibold text-[#17231f]">Cơ chế xử lý: </strong>
                      {branch.systemMechanism}
                    </div>
                    <div>
                      <strong className="font-semibold text-[#17231f]">Đầu ra: </strong>
                      {branch.outcome}
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#e9eeeb] flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.7px] text-[#81908a]">
                    Bộ phận phối hợp:
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {branch.involvedRoles.map((rKey) => (
                      <button
                        key={rKey}
                        type="button"
                        onClick={() => onSelectRoleTab?.(rKey)}
                        className="px-2 py-0.5 rounded-[5px] text-[10px] font-semibold bg-white text-[#17231f] border border-[#dce6e0] hover:border-[#176b51] hover:text-[#176b51] transition-colors cursor-pointer"
                      >
                        {STORE_ROLE_LABELS[rKey]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Cross-Department Handover Matrix */}
      <section className="space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#81908a]">
            MA TRẬN PHỐI HỢP LIÊN BỘ PHẬN (CROSS-ROLE HANDOVER MATRIX)
          </div>
          <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
            Bảng đối chiếu điểm chạm bàn giao và rào chắn kiểm soát tự động
          </h4>
        </div>

        <div className="rounded-[10px] border border-[#e5ece8] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f6f8f6] border-b border-[#e5ece8] text-[10px] font-bold uppercase tracking-[0.8px] text-[#596962]">
                  <th className="py-2.5 px-3">Điểm chạm quy trình</th>
                  <th className="py-2.5 px-3">Vai trò khởi tạo</th>
                  <th className="py-2.5 px-3">Vai trò tiếp nhận</th>
                  <th className="py-2.5 px-3">Chuyển trạng thái FSM</th>
                  <th className="py-2.5 px-3">Rào chắn kiểm soát (System Guardrail)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f1] text-xs">
                {filteredMatrix.map((row, index) => (
                  <tr key={index} className="hover:bg-[#fafbfa]">
                    <td className="py-2.5 px-3 font-semibold text-[#17231f]">
                      {row.touchpoint}
                    </td>
                    <td className="py-2.5 px-3 text-[#4b5b54]">{row.fromRole}</td>
                    <td className="py-2.5 px-3 text-[#4b5b54]">{row.toRole}</td>
                    <td className="py-2.5 px-3">
                      <StatusTag type={row.statusType} label={row.fsmTransition} />
                    </td>
                    <td className="py-2.5 px-3 text-[#4b5b54] leading-relaxed">
                      {row.systemGuardrail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
