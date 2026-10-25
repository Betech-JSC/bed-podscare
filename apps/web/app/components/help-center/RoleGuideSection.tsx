'use client';

import React from 'react';
import { Button, StatusTag, rolePermissions } from '@podscare/ui';
import type {
  RoleGuideConfig,
  StoreRoleKey,
  ModuleGuideItem,
  WorkflowStepItem,
  SpecialScenarioItem,
  RbacGuardrailItem,
} from './types';

export interface RoleGuideSectionProps {
  guide: RoleGuideConfig;
  currentUserRole: StoreRoleKey;
  searchQuery?: string;
  onNavigateModule: (href: string, moduleId: string) => void;
  onOpenOverviewTab?: () => void;
}

function matchesText(haystack: string | undefined, query: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(query);
}

export const RoleGuideSection: React.FC<RoleGuideSectionProps> = ({
  guide,
  currentUserRole,
  searchQuery = '',
  onNavigateModule,
  onOpenOverviewTab,
}) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isOwnRole = guide.roleKey === currentUserRole;
  const userAllowedModules = rolePermissions[currentUserRole] || [];

  const filteredModules: ModuleGuideItem[] = normalizedQuery
    ? guide.modules.filter(
        (m) =>
          matchesText(m.label, normalizedQuery) ||
          matchesText(m.id, normalizedQuery) ||
          matchesText(m.href, normalizedQuery) ||
          matchesText(m.group, normalizedQuery) ||
          matchesText(m.summary, normalizedQuery) ||
          m.keyActions.some((act) => matchesText(act, normalizedQuery)) ||
          (m.subSections &&
            m.subSections.some(
              (sub) =>
                matchesText(sub.title, normalizedQuery) ||
                matchesText(sub.description, normalizedQuery)
            ))
      )
    : guide.modules;

  const filteredWorkflow: WorkflowStepItem[] = normalizedQuery
    ? guide.dailyWorkflow.filter(
        (w) =>
          matchesText(w.title, normalizedQuery) ||
          matchesText(w.moduleLabel, normalizedQuery) ||
          matchesText(w.description, normalizedQuery) ||
          matchesText(w.handoverTo, normalizedQuery) ||
          matchesText(w.statusTransition?.to, normalizedQuery) ||
          w.checkpoints.some((cp) => matchesText(cp, normalizedQuery))
      )
    : guide.dailyWorkflow;

  const filteredScenarios: SpecialScenarioItem[] = normalizedQuery
    ? guide.specialScenarios.filter(
        (s) =>
          matchesText(s.title, normalizedQuery) ||
          matchesText(s.trigger, normalizedQuery) ||
          matchesText(s.statusLabel, normalizedQuery) ||
          matchesText(s.relatedModule, normalizedQuery) ||
          s.resolutionSteps.some((step) => matchesText(step, normalizedQuery))
      )
    : guide.specialScenarios;

  const filteredGuardrails: RbacGuardrailItem[] = normalizedQuery
    ? guide.rbacGuardrails.filter(
        (g) =>
          matchesText(g.ruleTitle, normalizedQuery) ||
          matchesText(g.policyCode, normalizedQuery) ||
          matchesText(g.description, normalizedQuery) ||
          matchesText(g.reason, normalizedQuery)
      )
    : guide.rbacGuardrails;

  const hasAnySearchMatch =
    filteredModules.length > 0 ||
    filteredWorkflow.length > 0 ||
    filteredScenarios.length > 0 ||
    filteredGuardrails.length > 0;

  return (
    <div className="space-y-6">
      {/* 1. Role Mission, Data Scope & Core Responsibilities Banner */}
      <div className="p-5 rounded-[12px] bg-[#f6f8f6] border border-[#dce6e0] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 pb-3.5 border-b border-[#e5ece8]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#176b51]">
                CẨM NANG VẬN HÀNH VAI TRÒ · {guide.badgeLabel}
              </span>
              {isOwnRole ? (
                <StatusTag type="ready" label="Vai trò của bạn" />
              ) : (
                <StatusTag type="gray" label="Đang xem tham khảo vai trò phối hợp" />
              )}
            </div>
            <h3 className="font-heading text-base sm:text-lg font-bold text-[#17231f] m-0">
              {guide.roleTitle}
            </h3>
            <p className="text-xs sm:text-sm text-[#4b5b54] m-0 leading-relaxed max-w-3xl">
              {guide.missionSummary}
            </p>
          </div>

          {onOpenOverviewTab && (
            <div className="flex-none">
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenOverviewTab}
                className="text-xs font-semibold"
              >
                Xem Tổng quan 6 bước
              </Button>
            </div>
          )}
        </div>

        {/* Scope & Financial Visibility Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-[9px] bg-white border border-[#e5ece8]">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a] mb-1">
              PHẠM VI DỮ LIỆU & KHÔNG GIAN LÀM VIỆC
            </div>
            <p className="text-xs text-[#17231f] m-0 leading-relaxed font-medium">
              {guide.dataScope}
            </p>
          </div>
          <div className="p-3 rounded-[9px] bg-white border border-[#e5ece8]">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a] mb-1">
              QUYỀN TRUY CẬP TÀI CHÍNH & GIÁ VỐN (RBAC)
            </div>
            <p className="text-xs text-[#17231f] m-0 leading-relaxed font-medium">
              {guide.financialVisibility}
            </p>
          </div>
        </div>

        {/* Core Responsibilities */}
        <div className="p-3.5 rounded-[9px] bg-white border border-[#e5ece8]">
          <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#176b51] mb-2">
            TRÁCH NHIỆM CỐT LÕI TRONG CHUỖI VẬN HÀNH
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {guide.coreResponsibilities.map((resp, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[#17231f]">
                <span className="w-5 h-5 rounded-[5px] bg-[#e9f4ef] text-[#176b51] font-heading font-bold text-[10px] grid place-items-center flex-none mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{resp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {normalizedQuery && !hasAnySearchMatch && (
        <div className="p-6 rounded-[10px] bg-[#fafbfa] border border-[#e9eeeb] text-center space-y-2">
          <p className="text-sm font-semibold text-[#17231f] m-0">
            Không tìm thấy nội dung khớp với từ khóa &ldquo;{searchQuery}&rdquo; trong tab {guide.tabLabel}.
          </p>
          <p className="text-xs text-[#81908a] m-0">
            Hãy thử từ khóa khác hoặc chuyển sang tab Tổng quan 6 bước / vai trò khác để tra cứu.
          </p>
        </div>
      )}

      {/* 2. Sidebar Modules Grid with RBAC Navigation Check */}
      {filteredModules.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#81908a]">
                DANH MỤC MODULE TRÊN SIDEBAR ({filteredModules.length}/{guide.modules.length} MODULE)
              </div>
              <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
                Chức năng từng module được cấp quyền cho {guide.tabLabel}
              </h4>
            </div>
            <span className="text-xs text-[#81908a]">
              Đối chiếu trực tiếp theo ma trận phân quyền rolePermissions.{guide.roleKey}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredModules.map((mod) => {
              const isAllowedForViewer = userAllowedModules.includes(mod.id);
              return (
                <div
                  key={mod.id}
                  className="p-4 rounded-[10px] bg-white border border-[#e5ece8] flex flex-col justify-between gap-3 shadow-[0_2px_5px_rgba(36,60,41,0.03)]"
                >
                  <div className="space-y-2.5">
                    {/* Module Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded-[5px] text-[9px] font-bold uppercase tracking-[0.8px] bg-[#e9f4ef] text-[#176b51]">
                            {mod.group}
                          </span>
                          <code className="text-[11px] font-mono text-[#81908a]">
                            {mod.href}
                          </code>
                        </div>
                        <h5 className="font-heading text-sm font-bold text-[#17231f] m-0">
                          {mod.label}
                        </h5>
                      </div>
                      <span className="px-2 py-0.5 rounded-[5px] text-[10px] font-mono font-semibold bg-[#f6f8f6] text-[#596962] border border-[#e9eeeb]">
                        id: {mod.id}
                      </span>
                    </div>

                    {/* Module Summary */}
                    <p className="text-xs text-[#4b5b54] m-0 leading-relaxed">
                      {mod.summary}
                    </p>

                    {/* Optional Sub-sections (e.g. Tech 3 workspace zones) */}
                    {mod.subSections && mod.subSections.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
                          Cấu trúc phân vùng trong module:
                        </div>
                        <div className="space-y-2">
                          {mod.subSections.map((sub, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2.5 rounded-[8px] bg-[#f6f8f6] border border-[#e5ece8] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-xs font-bold text-[#17231f]">
                                  {sub.title}
                                </strong>
                                {sub.badge && (
                                  <StatusTag
                                    type={sub.badgeType || 'progress'}
                                    label={sub.badge}
                                  />
                                )}
                              </div>
                              <p className="text-xs text-[#4b5b54] m-0 leading-relaxed">
                                {sub.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Actions */}
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a]">
                        Thao tác nghiệp vụ chính:
                      </div>
                      <ul className="m-0 pl-4 space-y-1 text-xs text-[#17231f]">
                        {mod.keyActions.map((action, aIdx) => (
                          <li key={aIdx} className="leading-relaxed">
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Module Footer with RBAC Navigation Guard */}
                  <div className="pt-3 border-t border-[#f0f3f1] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#81908a]">
                      Đường dẫn: <strong className="text-[#17231f]">{mod.href}</strong>
                    </span>
                    {isAllowedForViewer ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onNavigateModule(mod.href, mod.id)}
                        className="h-7 px-3 text-xs"
                      >
                        Đi tới module
                      </Button>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-[6px] text-[11px] font-semibold bg-[#f0f3f1] text-[#77847e] border border-[#e5ece8]">
                        Chỉ dành cho vai trò tương ứng
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Step-by-Step Daily Standard Operating Procedure (SOP) */}
      {filteredWorkflow.length > 0 && (
        <section className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#176b51]">
              QUY TRÌNH THAO TÁC CHUẨN HÀNG NGÀY (DAILY SOP WORKFLOW)
            </div>
            <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
              Hướng dẫn từng bước tác nghiệp trong ca của {guide.tabLabel}
            </h4>
          </div>

          <div className="space-y-3">
            {filteredWorkflow.map((wf) => (
              <div
                key={wf.step}
                className="p-4 rounded-[10px] bg-white border border-[#e5ece8] space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[#f0f3f1]">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-[6px] bg-[#176b51] text-white font-heading font-bold text-xs flex-none">
                      Bước {String(wf.step).padStart(2, '0')}
                    </span>
                    <div>
                      <h5 className="font-heading text-sm font-bold text-[#17231f] m-0">
                        {wf.title}
                      </h5>
                      <span className="text-[11px] text-[#81908a]">
                        Thực hiện tại: <strong className="text-[#17231f]">{wf.moduleLabel}</strong>
                      </span>
                    </div>
                  </div>
                  {wf.statusTransition && (
                    <div className="flex items-center gap-1.5 flex-none">
                      {wf.statusTransition.from && (
                        <>
                          <span className="text-[11px] font-mono text-[#81908a]">
                            {wf.statusTransition.from}
                          </span>
                          <span className="text-xs text-[#81908a]">-&gt;</span>
                        </>
                      )}
                      <StatusTag
                        type={wf.statusTransition.statusType || 'progress'}
                        label={wf.statusTransition.to}
                      />
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#4b5b54] m-0 leading-relaxed">
                  {wf.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {wf.checkpoints.map((cp, cpIdx) => (
                    <div
                      key={cpIdx}
                      className="p-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb] text-xs text-[#17231f] leading-relaxed"
                    >
                      <strong className="text-[#176b51] font-bold mr-1">
                        {wf.step}.{cpIdx + 1}
                      </strong>
                      {cp}
                    </div>
                  ))}
                </div>

                {wf.handoverTo && (
                  <div className="pt-2 border-t border-[#f0f3f1] text-[11px] text-[#596962]">
                    <strong className="font-semibold text-[#17231f]">Điểm chạm bàn giao: </strong>
                    {wf.handoverTo}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Special Scenarios & Exception Handling */}
      {filteredScenarios.length > 0 && (
        <section className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#b77a21]">
              XỬ LÝ TÌNH HUỐNG ĐẶC BIỆT & NGOẠI LỆ (SPECIAL SCENARIOS)
            </div>
            <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
              Cẩm nang xử lý các trường hợp phát sinh trong thực tế vận hành
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredScenarios.map((sc) => (
              <div
                key={sc.id}
                className="p-4 rounded-[10px] bg-[#fafbfa] border border-[#e5ece8] flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-heading text-sm font-bold text-[#17231f] m-0 leading-snug">
                      {sc.title}
                    </h5>
                    {sc.statusLabel && (
                      <StatusTag
                        type={sc.statusType || 'wait'}
                        label={sc.statusLabel}
                        className="flex-none"
                      />
                    )}
                  </div>

                  <div className="p-2.5 rounded-[7px] bg-white border border-[#e9eeeb] text-xs text-[#4b5b54]">
                    <strong className="font-semibold text-[#17231f]">Khi nào phát sinh: </strong>
                    {sc.trigger}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
                      Các bước xử lý chuẩn:
                    </div>
                    <ol className="m-0 pl-4 space-y-1 text-xs text-[#17231f] list-decimal">
                      {sc.resolutionSteps.map((step, sIdx) => (
                        <li key={sIdx} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {sc.relatedModule && (
                  <div className="pt-2 border-t border-[#e9eeeb] text-[11px] text-[#81908a]">
                    Module liên quan: <strong className="text-[#17231f]">{sc.relatedModule}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Security Rules & RBAC Guardrails */}
      {filteredGuardrails.length > 0 && (
        <section className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.05px] text-[#bc5b52]">
              QUY TẮC BẢO MẬT & GIỚI HẠN PHÂN QUYỀN (RBAC GUARDRAILS)
            </div>
            <h4 className="font-heading text-sm sm:text-base font-bold text-[#17231f] m-0">
              Các rào chắn an toàn dữ liệu và giới hạn quyền hạn bắt buộc tuân thủ
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredGuardrails.map((gr) => {
              const tagType =
                gr.severity === 'strict'
                  ? 'danger'
                  : gr.severity === 'warning'
                  ? 'wait'
                  : 'progress';
              const tagLabel =
                gr.severity === 'strict'
                  ? 'Bắt buộc nghiêm ngặt'
                  : gr.severity === 'warning'
                  ? 'Kiểm soát rủi ro'
                  : 'Quy chuẩn hệ thống';

              return (
                <div
                  key={gr.id}
                  className="p-4 rounded-[10px] bg-white border border-[#e5ece8] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {gr.policyCode && (
                        <code className="block text-[10px] font-mono font-bold text-[#81908a] mb-0.5">
                          [{gr.policyCode}]
                        </code>
                      )}
                      <h5 className="font-heading text-sm font-bold text-[#17231f] m-0">
                        {gr.ruleTitle}
                      </h5>
                    </div>
                    <StatusTag type={tagType} label={tagLabel} className="flex-none" />
                  </div>

                  <p className="text-xs text-[#17231f] m-0 leading-relaxed">
                    {gr.description}
                  </p>

                  <div className="p-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb] text-xs text-[#596962]">
                    <strong className="font-semibold text-[#17231f]">Lý do áp dụng: </strong>
                    {gr.reason}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
