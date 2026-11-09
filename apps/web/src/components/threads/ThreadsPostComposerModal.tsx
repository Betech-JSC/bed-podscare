'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@podscare/ui';
import {
  THREADS_MAX_CHARS,
  THREADS_MAX_UNIQUE_LINKS,
  validateThreadsDraft,
  type CreateThreadsPostPayload,
  type ThreadsAccount,
  type ThreadsMediaType,
  type ThreadsPost,
  type ThreadsReplyControl,
} from '@/src/lib/threads-api';

export interface ThreadsPostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ThreadsAccount[];
  defaultAccountId?: number | null;
  existingPosts?: ThreadsPost[];
  onSubmitPost: (payload: CreateThreadsPostPayload) => Promise<void>;
}

interface ComposerStepItem {
  key: string;
  content_text: string;
  media_type: ThreadsMediaType;
  media_urls_raw: string;
  link_attachment: string;
  topic_tag: string;
  scheduled_at: string;
}

const DRAFT_STORAGE_KEY = 'podscare_threads_composer_draft_v1';
const RECENT_ACCOUNTS_STORAGE_KEY = 'podscare_threads_recent_accounts_v1';

function formatDateTimeLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function getDefaultDateTimeLocal(offsetMinutes = 45): string {
  return formatDateTimeLocal(new Date(Date.now() + offsetMinutes * 60_000));
}

function getTomorrowMorning0800(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return formatDateTimeLocal(d);
}

function getNextGoldenHourSlot(): { value: string; label: string } {
  const now = new Date();
  const goldenSlots: Array<[number, number]> = [
    [11, 30],
    [19, 30],
    [21, 0],
  ];

  for (const [hh, mm] of goldenSlots) {
    const candidate = new Date(now);
    candidate.setHours(hh, mm, 0, 0);
    if (candidate.getTime() > now.getTime() + 10 * 60_000) {
      return {
        value: formatDateTimeLocal(candidate),
        label: `Hôm nay ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 30, 0, 0);
  return {
    value: formatDateTimeLocal(tomorrow),
    label: 'Ngày mai 11:30',
  };
}

function createEmptyStep(index: number): ComposerStepItem {
  return {
    key: `step_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    content_text: '',
    media_type: 'TEXT',
    media_urls_raw: '',
    link_attachment: '',
    topic_tag: '',
    scheduled_at: index === 0 ? getDefaultDateTimeLocal(45) : '',
  };
}

function normalizeTextForDuplicateCheck(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getAccountIneligibilityReason(acc: ThreadsAccount): string | null {
  if (acc.status === 'needs_reauth') {
    return 'Cần cấp lại quyền OAuth';
  }
  if (acc.status === 'paused') {
    return 'Đang tạm dừng';
  }
  if (acc.status === 'disabled') {
    return 'Đã vô hiệu hóa';
  }
  if (acc.daily_post_cap > 0 && acc.published_today_count >= acc.daily_post_cap) {
    return `Đã hết hạn mức ${acc.published_today_count}/${acc.daily_post_cap} bài hôm nay`;
  }
  return null;
}

function getTokenRemainingDays(tokenExpiresAt: string | null): number | null {
  if (!tokenExpiresAt) return null;
  const expiresMs = new Date(tokenExpiresAt).getTime();
  if (Number.isNaN(expiresMs)) return null;
  const diffDays = Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays;
}

export const ThreadsPostComposerModal: React.FC<ThreadsPostComposerModalProps> = ({
  isOpen,
  onClose,
  accounts,
  defaultAccountId,
  existingPosts = [],
  onSubmitPost,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);

  const firstEligibleAccountId = useMemo(() => {
    const eligible = accounts.find((a) => getAccountIneligibilityReason(a) === null);
    return eligible?.id || accounts[0]?.id || 1;
  }, [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<number>(
    defaultAccountId || firstEligibleAccountId
  );
  const [accountSearchQuery, setAccountSearchQuery] = useState<string>('');
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState<boolean>(false);
  const [recentAccountIds, setRecentAccountIds] = useState<number[]>([1, 2, 18]);

  const [replyControl, setReplyControl] = useState<ThreadsReplyControl>('everyone');
  const [chainMode, setChainMode] = useState<'auto' | 'scheduled'>('auto');

  // Cấu hình bài hợp tác trả phí (thu gọn 1 dòng mặc định, chỉ mở rộng khi bật)
  const [isSponsored, setIsSponsored] = useState<boolean>(false);
  const [clientRef, setClientRef] = useState<string>('');
  const [sponsoredSuffix, setSponsoredSuffix] = useState<string>('');

  const [steps, setSteps] = useState<ComposerStepItem[]>(() => [createEmptyStep(0)]);
  const [touchedSteps, setTouchedSteps] = useState<Record<string, boolean>>({});
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({});
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [savedDraftAvailable, setSavedDraftAvailable] = useState<boolean>(false);

  // Đồng bộ tài khoản mặc định khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    setSubmitAttempted(false);
    setSubmitError(null);
    setShowDiscardConfirm(false);
    setIsAccountDropdownOpen(false);

    if (defaultAccountId) {
      setSelectedAccountId(defaultAccountId);
    } else if (
      accounts.length > 0 &&
      (!accounts.some((a) => a.id === selectedAccountId) ||
        getAccountIneligibilityReason(
          accounts.find((a) => a.id === selectedAccountId) || accounts[0]
        ) !== null)
    ) {
      setSelectedAccountId(firstEligibleAccountId);
    }
  }, [isOpen, defaultAccountId, accounts, firstEligibleAccountId, selectedAccountId]);

  // Đọc danh sách tài khoản gần dùng nhất và bản nháp lưu trong localStorage
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    try {
      const rawRecent = window.localStorage.getItem(RECENT_ACCOUNTS_STORAGE_KEY);
      if (rawRecent) {
        const parsed = JSON.parse(rawRecent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentAccountIds(parsed.map(Number).filter(Boolean).slice(0, 5));
        }
      }
      const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft);
        const hasDraftContent =
          Array.isArray(parsedDraft?.steps) &&
          parsedDraft.steps.some(
            (s: ComposerStepItem) =>
              (s.content_text && s.content_text.trim().length > 0) ||
              (s.media_urls_raw && s.media_urls_raw.trim().length > 0)
          );
        setSavedDraftAvailable(Boolean(hasDraftContent));
      } else {
        setSavedDraftAvailable(false);
      }
    } catch {
      // Bỏ qua lỗi đọc localStorage trong môi trường hạn chế
    }
  }, [isOpen]);

  const isDirty = useMemo(() => {
    return (
      steps.some(
        (s) =>
          s.content_text.trim().length > 0 ||
          s.media_urls_raw.trim().length > 0 ||
          s.link_attachment.trim().length > 0 ||
          s.topic_tag.trim().length > 0
      ) ||
      isSponsored ||
      clientRef.trim().length > 0 ||
      sponsoredSuffix.trim().length > 0
    );
  }, [steps, isSponsored, clientRef, sponsoredSuffix]);

  // Tự động lưu nháp vào localStorage khi người dùng nhập nội dung
  useEffect(() => {
    if (!isOpen || !isDirty || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        const payload = {
          selectedAccountId,
          replyControl,
          chainMode,
          isSponsored,
          clientRef,
          sponsoredSuffix,
          steps,
          savedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
        const now = new Date();
        setLastAutoSavedAt(
          `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        );
      } catch {
        // Ignore storage quota errors
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    isDirty,
    selectedAccountId,
    replyControl,
    chainMode,
    isSponsored,
    clientRef,
    sponsoredSuffix,
    steps,
  ]);

  const handleRestoreSavedDraft = () => {
    if (typeof window === 'undefined') return;
    try {
      const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!rawDraft) return;
      const parsed = JSON.parse(rawDraft);
      if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        setSteps(parsed.steps);
      }
      if (parsed.selectedAccountId) setSelectedAccountId(Number(parsed.selectedAccountId));
      if (parsed.replyControl) setReplyControl(parsed.replyControl);
      if (parsed.chainMode) setChainMode(parsed.chainMode);
      if (typeof parsed.isSponsored === 'boolean') setIsSponsored(parsed.isSponsored);
      if (typeof parsed.clientRef === 'string') setClientRef(parsed.clientRef);
      if (typeof parsed.sponsoredSuffix === 'string') setSponsoredSuffix(parsed.sponsoredSuffix);
      setSavedDraftAvailable(false);
    } catch {
      // Ignore parse error
    }
  };

  const handleClearSavedDraft = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    setSavedDraftAvailable(false);
    setLastAutoSavedAt(null);
  };

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId) || accounts[0] || null,
    [accounts, selectedAccountId]
  );

  const selectedAccountIneligibility = useMemo(
    () => (selectedAccount ? getAccountIneligibilityReason(selectedAccount) : null),
    [selectedAccount]
  );

  const filteredAccounts = useMemo(() => {
    const q = accountSearchQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (acc) =>
        acc.display_name.toLowerCase().includes(q) ||
        (acc.username || '').toLowerCase().includes(q) ||
        (acc.notes || '').toLowerCase().includes(q)
    );
  }, [accounts, accountSearchQuery]);

  const stepValidations = useMemo(() => {
    return steps.map((step, idx) => {
      const mediaUrls = step.media_urls_raw
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      return validateThreadsDraft({
        contentText: step.content_text,
        mediaType: step.media_type,
        mediaUrls,
        linkAttachment: step.link_attachment,
        topicTag: step.topic_tag,
        isSponsored: isSponsored,
        sponsoredSuffix: idx === 0 ? sponsoredSuffix : null,
      });
    });
  }, [steps, isSponsored, sponsoredSuffix]);

  // Kiểm tra trùng lặp nội dung trong 24 giờ qua (so với existingPosts và giữa các bước trong chuỗi)
  const duplicateWarningsByStep = useMemo(() => {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentExisting = existingPosts.filter((p) => {
      if (p.status === 'cancelled') return false;
      const refDate = p.scheduled_at || p.published_at || p.created_at;
      if (!refDate) return true;
      const ts = new Date(refDate).getTime();
      return Number.isNaN(ts) || ts >= cutoff24h;
    });

    return steps.map((_, idx) => {
      const norm = normalizeTextForDuplicateCheck(stepValidations[idx]?.effectiveText || '');
      if (norm.length < 12) return null;

      // Kiểm tra trùng với phần trước trong cùng chuỗi
      const dupStepIdx = steps.findIndex(
        (_, otherIdx) =>
          otherIdx < idx &&
          normalizeTextForDuplicateCheck(stepValidations[otherIdx]?.effectiveText || '') === norm
      );
      if (dupStepIdx !== -1) {
        return `Nội dung phần này đang trùng lặp với Phần #${dupStepIdx + 1} trong cùng chuỗi bài.`;
      }

      // Kiểm tra trùng với bài đã lên lịch/đăng trong 24h qua
      const matchedPost = recentExisting.find((p) => {
        const existingNorm = normalizeTextForDuplicateCheck(
          p.effective_text || p.content_text || ''
        );
        return existingNorm === norm;
      });
      if (matchedPost) {
        return `Cảnh báo trùng nội dung 24h: Văn bản này trùng với bài #${matchedPost.id} (@${
          matchedPost.account?.username || matchedPost.account_id
        }). Hệ thống chống đăng trùng (content_hash) có thể chặn bài này.`;
      }
      return null;
    });
  }, [steps, stepValidations, existingPosts]);

  // Kiểm tra thời gian hẹn đăng có nằm trong quá khứ không
  const scheduleTimeErrors = useMemo(() => {
    const nowGrace = Date.now() - 60_000;
    return steps.map((step, idx) => {
      if (idx > 0 && chainMode === 'auto') return null;
      if (!step.scheduled_at) return null;
      const ts = new Date(step.scheduled_at).getTime();
      if (Number.isNaN(ts)) return 'Định dạng thời gian hẹn đăng không hợp lệ.';
      if (ts < nowGrace) {
        return 'Thời gian hẹn đăng đang nằm trong quá khứ. Vui lòng chọn thời điểm trong tương lai.';
      }
      if (idx > 0 && chainMode === 'scheduled') {
        const prevTs = new Date(steps[idx - 1]?.scheduled_at || '').getTime();
        if (!Number.isNaN(prevTs) && ts <= prevTs) {
          return `Giờ hẹn của Phần #${idx + 1} phải diễn ra sau Phần #${idx}.`;
        }
      }
      return null;
    });
  }, [steps, chainMode]);

  const allStepsValid = useMemo(
    () =>
      stepValidations.every((v) => v.valid) &&
      scheduleTimeErrors.every((err) => err === null) &&
      selectedAccountIneligibility === null,
    [stepValidations, scheduleTimeErrors, selectedAccountIneligibility]
  );

  // Tổng hợp lý do cụ thể hiển thị ngay cạnh nút chính ở Sticky Footer
  const readinessSummary = useMemo(() => {
    if (selectedAccountIneligibility) {
      return {
        ready: false,
        type: 'error' as const,
        message: `Đang lỗi tài khoản: @${
          selectedAccount?.username || selectedAccount?.display_name || 'Chưa chọn'
        } (${selectedAccountIneligibility})`,
      };
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const val = stepValidations[i];
      const timeErr = scheduleTimeErrors[i];
      const mediaUrls = step.media_urls_raw
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);

      if (!val.effectiveText.trim() && mediaUrls.length === 0) {
        return {
          ready: false,
          type: 'missing' as const,
          message: `Còn thiếu: Nội dung văn bản hoặc media ở Phần #${i + 1}`,
        };
      }
      if (val.charCount > THREADS_MAX_CHARS) {
        return {
          ready: false,
          type: 'error' as const,
          message: `Đang lỗi: Phần #${i + 1} vượt quá ${THREADS_MAX_CHARS} ký tự (${val.charCount}/${THREADS_MAX_CHARS})`,
        };
      }
      if (val.uniqueUrls.length > THREADS_MAX_UNIQUE_LINKS) {
        return {
          ready: false,
          type: 'error' as const,
          message: `Đang lỗi: Phần #${i + 1} vượt quá ${THREADS_MAX_UNIQUE_LINKS} liên kết (${val.uniqueUrls.length}/${THREADS_MAX_UNIQUE_LINKS})`,
        };
      }
      if (!val.valid && val.errors.length > 0) {
        return {
          ready: false,
          type: 'error' as const,
          message: `Đang lỗi ở Phần #${i + 1}: ${val.errors[0]}`,
        };
      }
      if (timeErr) {
        return {
          ready: false,
          type: 'error' as const,
          message: `Đang lỗi lịch đăng Phần #${i + 1}: ${timeErr}`,
        };
      }
    }

    return {
      ready: true,
      type: 'ready' as const,
      message: 'Hợp lệ · Sẵn sàng lên lịch',
    };
  }, [
    selectedAccountIneligibility,
    selectedAccount,
    steps,
    stepValidations,
    scheduleTimeErrors,
  ]);

  const handleRequestClose = useCallback(() => {
    if (isDirty && !isSubmitting) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, isSubmitting, onClose]);

  const handleSelectAccount = (account: ThreadsAccount) => {
    const ineligibility = getAccountIneligibilityReason(account);
    if (ineligibility) return;
    setSelectedAccountId(account.id);
    setIsAccountDropdownOpen(false);
    if (typeof window !== 'undefined') {
      try {
        const nextRecent = [
          account.id,
          ...recentAccountIds.filter((id) => id !== account.id),
        ].slice(0, 5);
        setRecentAccountIds(nextRecent);
        window.localStorage.setItem(RECENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(nextRecent));
      } catch {
        // Ignore
      }
    }
  };

  const handleUpdateStep = (
    index: number,
    patch: Partial<ComposerStepItem>,
    markTouched = true
  ) => {
    setSteps((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (markTouched) {
          setTouchedSteps((prevTouched) => ({ ...prevTouched, [item.key]: true }));
        }
        return { ...item, ...patch };
      })
    );
    setSubmitError(null);
  };

  const handleAddThreadStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        ...createEmptyStep(prev.length),
        scheduled_at:
          chainMode === 'scheduled' ? getDefaultDateTimeLocal(60 + prev.length * 30) : '',
      },
    ]);
  };

  const handleDuplicateStep = (index: number) => {
    const source = steps[index];
    if (!source) return;
    const duplicated: ComposerStepItem = {
      ...source,
      key: `step_${Date.now()}_dup_${Math.random().toString(36).slice(2, 6)}`,
      scheduled_at:
        chainMode === 'scheduled'
          ? getDefaultDateTimeLocal(60 + (index + 1) * 30)
          : '',
    };
    setSteps((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, duplicated);
      return next;
    });
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= steps.length || fromIndex === toIndex) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      // Đảm bảo bước đầu tiên luôn có scheduled_at
      if (!next[0].scheduled_at) {
        next[0] = { ...next[0], scheduled_at: getDefaultDateTimeLocal(45) };
      }
      return next;
    });
  };

  const handleRemoveThreadStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = useCallback(
    async (targetStatus: 'scheduled' | 'draft') => {
      setSubmitAttempted(true);
      setSubmitError(null);

      // Khi lên lịch xuất bản (scheduled), kiểm tra toàn bộ điều kiện
      // Khi lưu nháp (draft), chỉ cần không vượt quá 500 ký tự và có ít nhất nội dung hoặc media
      if (!allStepsValid) {
        setSubmitError(readinessSummary.message);
        return;
      }

      const rootStep = steps[0];
      const rootMediaUrls = rootStep.media_urls_raw
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);

      setIsSubmitting(true);
      try {
        await onSubmitPost({
          account_id: selectedAccountId,
          content_text: rootStep.content_text,
          media_type: rootStep.media_type,
          media_urls: rootMediaUrls,
          link_attachment: rootStep.link_attachment.trim() || null,
          topic_tag: rootStep.topic_tag.trim() || null,
          reply_control: replyControl,
          is_sponsored: isSponsored,
          sponsored_suffix:
            isSponsored && sponsoredSuffix.trim() ? sponsoredSuffix.trim() : null,
          client_ref: isSponsored && clientRef.trim() ? clientRef.trim() : null,
          scheduled_at: rootStep.scheduled_at
            ? new Date(rootStep.scheduled_at).toISOString()
            : null,
          status: targetStatus,
          chain_mode: steps.length > 1 ? chainMode : 'auto',
          thread_steps: steps.map((step, idx) => ({
            content_text: step.content_text,
            media_type: step.media_type,
            media_urls: step.media_urls_raw
              .split('\n')
              .map((u) => u.trim())
              .filter(Boolean),
            link_attachment: step.link_attachment.trim() || null,
            topic_tag: step.topic_tag.trim() || null,
            scheduled_at:
              idx === 0
                ? step.scheduled_at
                  ? new Date(step.scheduled_at).toISOString()
                  : null
                : chainMode === 'auto'
                ? null
                : step.scheduled_at
                ? new Date(step.scheduled_at).toISOString()
                : null,
          })),
        });

        handleClearSavedDraft();
        setSteps([createEmptyStep(0)]);
        setTouchedSteps({});
        setCollapsedSteps({});
        setSubmitAttempted(false);
        setIsSponsored(false);
        setClientRef('');
        setSponsoredSuffix('');
        onClose();
      } catch (err: unknown) {
        setSubmitError(
          err instanceof Error ? err.message : 'Không thể lưu lịch bài đăng Threads.'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      allStepsValid,
      readinessSummary.message,
      steps,
      onSubmitPost,
      selectedAccountId,
      replyControl,
      isSponsored,
      sponsoredSuffix,
      clientRef,
      chainMode,
      onClose,
    ]
  );

  // Phím tắt bàn phím: Esc để đóng, Cmd/Ctrl + Enter để Lên lịch, Focus Trap trong Modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isAccountDropdownOpen) {
          setIsAccountDropdownOpen(false);
          return;
        }
        handleRequestClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting) {
          void handleSubmit('scheduled');
        }
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAccountDropdownOpen, handleRequestClose, isSubmitting, handleSubmit]);

  if (!isOpen) return null;

  const tokenRemainingDays = getTokenRemainingDays(
    selectedAccount?.token_expires_at || null
  );
  const goldenHourSuggestion = getNextGoldenHourSlot();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Soạn bài đăng hoặc chuỗi Multi-post Thread"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17231f]/60 p-2 sm:p-4 lg:p-6 overflow-hidden"
    >
      <div
        ref={modalRef}
        className="w-full max-w-6xl bg-[#ffffff] border border-[#dce4e0] rounded-[12px] shadow-modal overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* 1. STICKY HEADER */}
        <div className="px-5 py-3.5 border-b border-[#e2e9e4] bg-[#fafbfa] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div>
              <h2 className="font-heading text-[18px] font-bold text-[#17231f] leading-tight">
                Soạn thảo &amp; Lên lịch bài đăng Threads
              </h2>
              <p className="text-[13px] text-[#3d4f47] mt-0.5">
                Soạn bài đơn hoặc chuỗi nhiều phần nối tiếp · Tự động kiểm định giới hạn ký tự, liên kết và chống trùng lặp
              </p>
            </div>

            {/* Tóm tắt nhanh tài khoản đang chọn trên Header */}
            {selectedAccount && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-[#ffffff] border border-[#dce4e0]">
                <span className="w-6 h-6 rounded-full bg-[#176b51] text-[#ffffff] font-heading font-bold text-[12px] inline-flex items-center justify-center shrink-0">
                  {(selectedAccount.username || selectedAccount.display_name || 'P')
                    .charAt(0)
                    .toUpperCase()}
                </span>
                <span className="font-mono text-[13px] font-bold text-[#17231f]">
                  @{selectedAccount.username || 'chua_ket_noi'}
                </span>
                <span className="text-[#dce4e0]">|</span>
                <span
                  className={`text-[12px] font-semibold px-2 py-0.5 rounded ${
                    tokenRemainingDays !== null && tokenRemainingDays < 14
                      ? 'bg-[#faf3e7] text-[#9a6316]'
                      : 'bg-[#eaf5ef] text-[#176b51]'
                  }`}
                >
                  {tokenRemainingDays !== null
                    ? tokenRemainingDays > 0
                      ? `Token còn ${tokenRemainingDays} ngày`
                      : 'Token hết hạn'
                    : 'Chưa cấp OAuth'}
                </span>
                <span className="font-mono text-[12px] text-[#3d4f47]">
                  {selectedAccount.published_today_count}/{selectedAccount.daily_post_cap} bài hôm nay
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lastAutoSavedAt && (
              <span className="text-[12px] font-medium text-[#28805e] bg-[#eaf5ef] px-2.5 py-1 rounded-[6px]">
                Đã tự lưu nháp lúc {lastAutoSavedAt}
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Đóng cửa sổ soạn bài"
              className="h-8 px-2.5 rounded-[7px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#3d4f47] hover:bg-[#eef2f0] border border-[#dce4e0]"
            >
              <Icon name="close" size={14} />
              <span>Đóng</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[11px] font-mono bg-[#f0f3f1] text-[#3d4f47] rounded">
                Esc
              </kbd>
            </button>
          </div>
        </div>

        {/* Thanh thông báo khôi phục bản nháp nếu có hoặc cảnh báo xác nhận đóng khi chưa lưu */}
        {savedDraftAvailable && !isDirty && (
          <div className="px-5 py-2.5 bg-[#eaf5ef] border-b border-[#c8eadb] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-[13px] font-medium text-[#17231f]">
              Phát hiện bản nháp chưa hoàn tất từ phiên làm việc trước. Bạn có muốn khôi phục lại không?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreSavedDraft}
                className="h-7 px-3 rounded-[6px] bg-[#176b51] text-[#ffffff] text-[12px] font-semibold hover:bg-[#10583f]"
              >
                Khôi phục bản nháp
              </button>
              <button
                type="button"
                onClick={handleClearSavedDraft}
                className="h-7 px-2.5 rounded-[6px] bg-[#ffffff] border border-[#dce4e0] text-[#3d4f47] text-[12px] font-semibold hover:bg-[#f0f3f1]"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        )}

        {showDiscardConfirm && (
          <div
            role="alert"
            className="px-5 py-3 bg-[#faf3e7] border-b border-[#e2c699] flex flex-wrap items-center justify-between gap-3 shrink-0"
          >
            <div className="text-[13px] font-semibold text-[#7c4d0f]">
              Bạn đang có nội dung vừa soạn chưa lên lịch. Đóng cửa sổ ngay bây giờ hay tiếp tục chỉnh sửa? (Nội dung vẫn được tự lưu nháp trên trình duyệt)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="h-7 px-3 rounded-[6px] bg-[#ffffff] border border-[#d6b682] text-[#7c4d0f] text-[12px] font-semibold"
              >
                Tiếp tục soạn
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="h-7 px-3 rounded-[6px] bg-[#bc5b52] text-[#ffffff] text-[12px] font-semibold"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        )}

        {/* 2. BODY 2 CỘT CÓ SCROLL ĐỘC LẬP */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* CỘT TRÁI (7/12): TRÌNH SOẠN NỘI DUNG CHUỖI BÀI & KHUNG XEM TRƯỚC TRỰC QUAN */}
          <div className="lg:col-span-7 overflow-y-auto p-5 space-y-5 bg-[#ffffff]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-heading text-[15px] font-bold text-[#17231f]">
                  1. Nội dung bài viết &amp; Chuỗi nối tiếp
                </h3>
                <p className="text-[13px] text-[#3d4f47]">
                  Hỗ trợ kéo thả hoặc bấm mũi tên để sắp xếp thứ tự các phần trong chuỗi Thread
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-[6px] bg-[#f0f3f1] text-[13px] font-semibold text-[#17231f]">
                Tổng số phần: {steps.length}
              </span>
            </div>

            {/* Danh sách các thẻ bài trong chuỗi (có đường kẻ dọc nối các phần) */}
            <div className="relative space-y-4">
              {steps.map((step, index) => {
                const validation = stepValidations[index];
                const isTouched = Boolean(touchedSteps[step.key]);
                const isCollapsed = Boolean(collapsedSteps[step.key]);
                const dupWarning = duplicateWarningsByStep[index];
                const timeError = scheduleTimeErrors[index];

                const charCount = validation.charCount;
                const charOver = charCount > THREADS_MAX_CHARS;
                const charNearLimit =
                  !charOver && charCount >= Math.floor(THREADS_MAX_CHARS * 0.9); // >= 450

                const linkCount = validation.uniqueUrls.length;
                const linkOver = linkCount > THREADS_MAX_UNIQUE_LINKS;
                const linkNearLimit =
                  !linkOver && linkCount >= THREADS_MAX_UNIQUE_LINKS - 1; // >= 4

                // Chỉ hiển thị lỗi "rỗng" khi người dùng đã bấm Submit hoặc đã chạm và xóa trắng
                // Tuyệt đối không báo đỏ khi vừa mở modal (trạng thái Rỗng / Chưa chạm)
                const visibleErrors = validation.errors.filter((errMsg) => {
                  const isEmptyContentError = errMsg.includes(
                    'Bài đăng phải có nội dung văn bản hoặc ít nhất 1 đường dẫn media hợp lệ'
                  );
                  if (isEmptyContentError) {
                    return submitAttempted;
                  }
                  return isTouched || submitAttempted;
                });

                // Phát hiện URL trong văn bản để gợi ý gắn làm link_attachment 1 chạm
                const detectedUrlsInContent = validation.uniqueUrls.filter(
                  (u) => u !== step.link_attachment.trim() && /^https:\/\//i.test(u)
                );

                return (
                  <div
                    key={step.key}
                    draggable={steps.length > 1}
                    onDragStart={() => setDraggedStepIndex(index)}
                    onDragOver={(e) => {
                      if (steps.length > 1) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (draggedStepIndex !== null && draggedStepIndex !== index) {
                        handleMoveStep(draggedStepIndex, index);
                      }
                      setDraggedStepIndex(null);
                    }}
                    className={`relative rounded-[10px] bg-[#ffffff] border transition-colors ${
                      visibleErrors.length > 0 || (submitAttempted && timeError)
                        ? 'border-[#bc5b52] bg-[#fffdfc]'
                        : 'border-[#dce4e0] hover:border-[#176b51]/60'
                    } p-4 space-y-3.5`}
                  >
                    {/* Đường kẻ dọc liên kết các bài trong chuỗi */}
                    {index < steps.length - 1 && (
                      <div
                        aria-hidden="true"
                        className="hidden sm:block absolute left-7 -bottom-4 w-0.5 h-4 bg-[#176b51]/40"
                      />
                    )}

                    {/* Thanh tiêu đề từng phần */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-[6px] bg-[#176b51] text-[#ffffff] font-mono text-[12px] font-bold">
                          Phần #{index + 1}
                        </span>
                        <span className="text-[14px] font-bold text-[#17231f]">
                          {index === 0
                            ? 'Bài đăng gốc (Mở đầu chuỗi)'
                            : `Bài trả lời nối tiếp cho Phần #${index}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Bộ đếm ký tự trực tiếp: Xanh/Xám -> Vàng (>=450) -> Đỏ (>500) */}
                        <span
                          data-testid={`step-${index}-char-counter`}
                          title="Giới hạn tối đa 500 ký tự UTF-8 trên mỗi bài Threads"
                          className={`font-mono text-[12px] font-bold px-2 py-0.5 rounded ${
                            charOver
                              ? 'bg-[#fbefed] text-[#bc5b52] border border-[#bc5b52]/40'
                              : charNearLimit
                              ? 'bg-[#faf3e7] text-[#9a6316] border border-[#e2c699]'
                              : 'bg-[#f0f3f1] text-[#17231f]'
                          }`}
                        >
                          {charCount}/{THREADS_MAX_CHARS} ký tự
                        </span>

                        {/* Bộ đếm liên kết trực tiếp: Xanh/Xám -> Vàng (>=4) -> Đỏ (>5) */}
                        <span
                          data-testid={`step-${index}-link-counter`}
                          title="Tối đa 5 liên kết HTTP/HTTPS duy nhất trong mỗi bài"
                          className={`font-mono text-[12px] font-bold px-2 py-0.5 rounded ${
                            linkOver
                              ? 'bg-[#fbefed] text-[#bc5b52] border border-[#bc5b52]/40'
                              : linkNearLimit
                              ? 'bg-[#faf3e7] text-[#9a6316] border border-[#e2c699]'
                              : 'bg-[#f0f3f1] text-[#3d4f47]'
                          }`}
                        >
                          {linkCount}/{THREADS_MAX_UNIQUE_LINKS} liên kết
                        </span>

                        {/* Các nút thao tác quản lý bước trong chuỗi */}
                        {steps.length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveStep(index, index - 1)}
                              title="Chuyển phần này lên trên"
                              aria-label={`Chuyển phần ${index + 1} lên trên`}
                              className="h-7 px-2 rounded-[6px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] font-bold text-[#3d4f47] hover:bg-[#e9f4ef] disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={index === steps.length - 1}
                              onClick={() => handleMoveStep(index, index + 1)}
                              title="Chuyển phần này xuống dưới"
                              aria-label={`Chuyển phần ${index + 1} xuống dưới`}
                              className="h-7 px-2 rounded-[6px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] font-bold text-[#3d4f47] hover:bg-[#e9f4ef] disabled:opacity-40"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedSteps((prev) => ({
                                  ...prev,
                                  [step.key]: !prev[step.key],
                                }))
                              }
                              className="h-7 px-2.5 rounded-[6px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] font-semibold text-[#3d4f47] hover:bg-[#e9f4ef]"
                            >
                              {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDuplicateStep(index)}
                          title="Nhân bản phần này thành bước tiếp theo"
                          className="h-7 px-2.5 rounded-[6px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] font-semibold text-[#3d4f47] hover:bg-[#e9f4ef]"
                        >
                          Nhân bản
                        </button>

                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveThreadStep(index)}
                            className="h-7 px-2.5 rounded-[6px] bg-[#fbefed] text-[#bc5b52] text-[12px] font-semibold hover:opacity-90"
                          >
                            Xóa phần này
                          </button>
                        )}
                      </div>
                    </div>

                    {isCollapsed ? (
                      <div className="px-3 py-2 rounded-[7px] bg-[#f6f8f6] text-[13px] text-[#3d4f47] truncate">
                        {step.content_text.trim() || '(Chưa nhập nội dung văn bản)'}{' '}
                        <span className="font-mono text-[12px] text-[#176b51]">
                          [{step.media_type}]
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* Ô nhập nội dung */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label
                              htmlFor={`step-content-${index}`}
                              className="text-[13px] font-semibold text-[#17231f]"
                            >
                              Nội dung bài viết
                            </label>
                            <span
                              title="Tên trường kỹ thuật trên API"
                              className="font-mono text-[11px] text-[#495a52] bg-[#f0f3f1] px-1.5 py-0.5 rounded"
                            >
                              content_text
                            </span>
                          </div>
                          <textarea
                            id={`step-content-${index}`}
                            rows={3}
                            value={step.content_text}
                            onChange={(e) =>
                              handleUpdateStep(index, { content_text: e.target.value }, true)
                            }
                            onBlur={() =>
                              setTouchedSteps((prev) => ({ ...prev, [step.key]: true }))
                            }
                            placeholder="Nhập nội dung chia sẻ trên Threads (tối đa 500 ký tự và không quá 5 liên kết)..."
                            className="w-full p-3 rounded-[8px] bg-[#ffffff] border border-[#dce4e0] text-[14px] text-[#17231f] placeholder-[#5c6e66] focus:outline-none focus:border-[#176b51] focus:ring-2 focus:ring-[#176b51]/15 leading-relaxed"
                          />

                          {/* Chip gợi ý tự động gắn URL vừa gõ làm Liên kết đính kèm */}
                          {detectedUrlsInContent.length > 0 && !step.link_attachment.trim() && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="text-[12px] font-medium text-[#3d4f47]">
                                Phát hiện liên kết trong bài:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStep(
                                    index,
                                    { link_attachment: detectedUrlsInContent[0] },
                                    true
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#e9f4ef] border border-[#c8eadb] text-[#176b51] text-[12px] font-semibold hover:bg-[#176b51] hover:text-[#ffffff] transition-colors"
                              >
                                <span>+ Gắn làm liên kết đính kèm ({detectedUrlsInContent[0]})</span>
                              </button>
                            </div>
                          )}

                          {/* Cảnh báo sớm nếu trùng lặp nội dung 24h */}
                          {dupWarning && (
                            <div
                              role="status"
                              data-testid={`step-${index}-duplicate-warning`}
                              className="mt-2 p-2.5 rounded-[7px] bg-[#faf3e7] border border-[#e2c699] text-[13px] font-medium text-[#7c4d0f]"
                            >
                              {dupWarning}
                            </div>
                          )}
                        </div>

                        {/* Cấu hình Loại định dạng, Chủ đề và Liên kết đính kèm */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`step-media-type-${index}`}
                                className="text-[13px] font-semibold text-[#17231f]"
                              >
                                Định dạng bài
                              </label>
                              <span className="font-mono text-[11px] text-[#495a52]">
                                media_type
                              </span>
                            </div>
                            <select
                              id={`step-media-type-${index}`}
                              value={step.media_type}
                              onChange={(e) =>
                                handleUpdateStep(
                                  index,
                                  { media_type: e.target.value as ThreadsMediaType },
                                  true
                                )
                              }
                              className="w-full h-[36px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                            >
                              <option value="TEXT">Chỉ văn bản / Đính kèm link (TEXT)</option>
                              <option value="IMAGE">Hình ảnh đơn (IMAGE)</option>
                              <option value="VIDEO">Video ngắn (VIDEO)</option>
                              <option value="CAROUSEL">Album trượt 2–20 ảnh/video (CAROUSEL)</option>
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`step-topic-${index}`}
                                className="text-[13px] font-semibold text-[#17231f]"
                              >
                                Nhãn chủ đề
                              </label>
                              <span className="font-mono text-[11px] text-[#495a52]">
                                topic_tag
                              </span>
                            </div>
                            <input
                              id={`step-topic-${index}`}
                              type="text"
                              value={step.topic_tag}
                              onChange={(e) =>
                                handleUpdateStep(index, { topic_tag: e.target.value }, true)
                              }
                              placeholder="VD: PodsCareLab"
                              className="w-full h-[36px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`step-link-${index}`}
                                className="text-[13px] font-semibold text-[#17231f]"
                              >
                                Liên kết đính kèm
                              </label>
                              <span className="font-mono text-[11px] text-[#495a52]">
                                link_attachment
                              </span>
                            </div>
                            <input
                              id={`step-link-${index}`}
                              type="url"
                              value={step.link_attachment}
                              onChange={(e) =>
                                handleUpdateStep(
                                  index,
                                  { link_attachment: e.target.value },
                                  true
                                )
                              }
                              placeholder="https://podscare.vn/..."
                              className="w-full h-[36px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] font-mono text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                            />
                          </div>
                        </div>

                        {/* Danh sách URL Media khi chọn IMAGE / VIDEO / CAROUSEL */}
                        {step.media_type !== 'TEXT' && (
                          <div>
                            <label
                              htmlFor={`step-media-urls-${index}`}
                              className="block text-[13px] font-semibold text-[#17231f] mb-1"
                            >
                              Đường dẫn file ảnh / video công khai (mỗi dòng 1 URL bắt đầu bằng https://)
                            </label>
                            <textarea
                              id={`step-media-urls-${index}`}
                              rows={2}
                              value={step.media_urls_raw}
                              onChange={(e) =>
                                handleUpdateStep(
                                  index,
                                  { media_urls_raw: e.target.value },
                                  true
                                )
                              }
                              placeholder="https://cdn.podscare.vn/threads/image-01.jpg"
                              className="w-full p-2.5 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] font-mono text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                            />
                          </div>
                        )}

                        {/* Hẹn giờ riêng cho bài con khi chọn chế độ Hẹn giờ riêng từng phần */}
                        {index > 0 && chainMode === 'scheduled' && (
                          <div>
                            <label
                              htmlFor={`step-schedule-${index}`}
                              className="block text-[13px] font-semibold text-[#17231f] mb-1"
                            >
                              Thời điểm hẹn đăng riêng cho Phần #{index + 1} (sau Phần #{index})
                            </label>
                            <input
                              id={`step-schedule-${index}`}
                              type="datetime-local"
                              value={step.scheduled_at}
                              onChange={(e) =>
                                handleUpdateStep(
                                  index,
                                  { scheduled_at: e.target.value },
                                  true
                                )
                              }
                              className="w-full sm:w-[260px] h-[36px] px-3 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] font-mono text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                            />
                          </div>
                        )}

                        {index > 0 && chainMode === 'auto' && (
                          <div className="text-[13px] text-[#176b51] bg-[#eaf5ef] px-3 py-2 rounded-[7px] font-medium">
                            Tự động nối chuỗi: Phần #{index + 1} sẽ tự động đăng sau 30–60 giây ngay khi Phần #{index} xuất bản thành công.
                          </div>
                        )}

                        {/* Chỉ hiện thông báo lỗi khi người dùng đã chạm vào bước này hoặc bấm Submit */}
                        {(visibleErrors.length > 0 || (submitAttempted && timeError)) && (
                          <div
                            role="alert"
                            className="p-3 rounded-[7px] bg-[#fbefed] border border-[#bc5b52]/40 text-[13px] text-[#bc5b52] space-y-1 font-medium"
                          >
                            {visibleErrors.map((errMsg, errIdx) => (
                              <div key={errIdx}>• {errMsg}</div>
                            ))}
                            {submitAttempted && timeError && <div>• {timeError}</div>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Thanh nút "+ Thêm phần nối tiếp" cố định ở cuối chuỗi */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleAddThreadStep}
                className="h-[38px] px-4 rounded-[8px] bg-[#e9f4ef] border border-[#176b51]/30 text-[#176b51] hover:bg-[#176b51] hover:text-[#ffffff] text-[13px] font-bold transition-colors inline-flex items-center gap-2"
              >
                <Icon name="plus" size={14} />
                <span>+ Thêm phần nối tiếp (Multi-post Thread)</span>
              </button>
              <span className="text-[13px] text-[#3d4f47]">
                Mẹo: Nhấn <kbd className="px-1.5 py-0.5 rounded bg-[#f0f3f1] font-mono text-[12px]">⌘/Ctrl + Enter</kbd> để lên lịch nhanh
              </span>
            </div>

            {/* KHUNG XEM TRƯỚC GIAO DIỆN THREADS (LIVE THREADS PREVIEW) */}
            <div className="p-4 rounded-[10px] bg-[#f6f8f6] border border-[#dce4e0] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#28805e]" />
                  <h4 className="font-heading text-[14px] font-bold text-[#17231f]">
                    Xem trước hiển thị trên Threads (Live Preview)
                  </h4>
                </div>
                <span className="text-[12px] font-medium text-[#3d4f47]">
                  {steps.length > 1 ? `Chuỗi ${steps.length} bài nối tiếp` : 'Bài đăng đơn'}
                </span>
              </div>

              <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#e2e9e4] space-y-4">
                {steps.map((step, idx) => {
                  const val = stepValidations[idx];
                  const mediaUrls = step.media_urls_raw
                    .split('\n')
                    .map((u) => u.trim())
                    .filter(Boolean);

                  return (
                    <div key={`preview_${step.key}`} className="flex items-start gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-8 h-8 rounded-full bg-[#176b51] text-[#ffffff] font-heading font-bold text-[13px] flex items-center justify-center">
                          {(
                            selectedAccount?.username ||
                            selectedAccount?.display_name ||
                            'P'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        {idx < steps.length - 1 && (
                          <div className="w-0.5 h-12 bg-[#dce4e0] my-1.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[13px] text-[#17231f]">
                            {selectedAccount?.username || 'podscare.vn'}
                          </span>
                          {step.topic_tag.trim() && (
                            <span className="text-[12px] font-semibold text-[#176b51]">
                              · #{step.topic_tag.trim()}
                            </span>
                          )}
                          {idx === 0 && isSponsored && (
                            <span className="px-2 py-0.5 rounded bg-[#f2eff8] text-[#5e517a] text-[11px] font-semibold">
                              Hợp tác trả phí
                            </span>
                          )}
                          <span className="text-[12px] text-[#495a52] ml-auto font-mono">
                            {idx === 0 && step.scheduled_at
                              ? new Date(step.scheduled_at).toLocaleString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: '2-digit',
                                })
                              : idx > 0 && chainMode === 'auto'
                              ? '+30s nối tiếp'
                              : 'Bản xem trước'}
                          </span>
                        </div>

                        <p className="text-[14px] text-[#17231f] whitespace-pre-wrap break-words leading-relaxed">
                          {val?.effectiveText || (
                            <span className="italic text-[#5c6e66]">
                              Nội dung Phần #{idx + 1} sẽ hiển thị trực tiếp tại đây khi bạn gõ...
                            </span>
                          )}
                        </p>

                        {step.media_type !== 'TEXT' && (
                          <div className="p-2.5 rounded-[8px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] text-[#3d4f47] flex items-center justify-between">
                            <span className="font-semibold text-[#17231f]">
                              Đính kèm {step.media_type} ({mediaUrls.length} file)
                            </span>
                            <span className="font-mono text-[11px] truncate max-w-[220px]">
                              {mediaUrls[0] || 'Chưa nhập URL https://'}
                            </span>
                          </div>
                        )}

                        {step.link_attachment.trim() && (
                          <div className="p-2.5 rounded-[8px] bg-[#f0f6f3] border border-[#c8eadb] text-[12px] text-[#176b51] font-mono truncate">
                            [Link] {step.link_attachment.trim()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (5/12): CÀI ĐẶT ĐĂNG BÀI, CHỌN TÀI KHOẢN, LỊCH HẸN & HỢP TÁC TRẢ PHÍ */}
          <div className="lg:col-span-5 overflow-y-auto p-5 space-y-4 bg-[#fafbfa] border-t lg:border-t-0 lg:border-l border-[#e2e9e4]">
            <div>
              <h3 className="font-heading text-[15px] font-bold text-[#17231f]">
                2. Cài đặt xuất bản &amp; Lịch hẹn
              </h3>
              <p className="text-[13px] text-[#3d4f47]">
                Kiểm soát kênh đăng, khung giờ vàng và quyền phản hồi
              </p>
            </div>

            {/* KHỐI 1: CHỌN TÀI KHOẢN XUẤT BẢN (Searchable + Chip Gần dùng nhất + Chặn chọn tài khoản lỗi/tạm dừng) */}
            <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#dce4e0] space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="composer-account-select"
                  className="text-[13px] font-bold text-[#17231f]"
                >
                  Tài khoản xuất bản
                </label>
                <span className="text-[12px] font-semibold text-[#176b51]">
                  {accounts.filter((a) => getAccountIneligibilityReason(a) === null).length}/
                  {accounts.length} kênh sẵn sàng
                </span>
              </div>

              {/* Chip chọn nhanh các tài khoản gần dùng nhất */}
              {recentAccountIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-[#3d4f47]">Gần dùng:</span>
                  {recentAccountIds.map((id) => {
                    const acc = accounts.find((a) => a.id === id);
                    if (!acc) return null;
                    const ineligibleReason = getAccountIneligibilityReason(acc);
                    const isSelected = acc.id === selectedAccountId;
                    return (
                      <button
                        key={`recent_${acc.id}`}
                        type="button"
                        disabled={Boolean(ineligibleReason)}
                        title={
                          ineligibleReason
                            ? `Không thể chọn: ${ineligibleReason}`
                            : `${acc.display_name} (${acc.published_today_count}/${acc.daily_post_cap} bài hôm nay)`
                        }
                        onClick={() => handleSelectAccount(acc)}
                        className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold border transition-colors ${
                          isSelected
                            ? 'bg-[#176b51] text-[#ffffff] border-[#176b51]'
                            : ineligibleReason
                            ? 'bg-[#f0f3f1] text-[#77847e] border-[#dce4e0] opacity-60 cursor-not-allowed line-through'
                            : 'bg-[#f6f8f6] text-[#17231f] border-[#dce4e0] hover:border-[#176b51]'
                        }`}
                      >
                        @{acc.username || acc.display_name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Select đồng bộ chuẩn Accessibility + Khoá chặt (disabled) các tài khoản paused/needs_reauth/hết quota */}
              <select
                id="composer-account-select"
                aria-label="Tài khoản xuất bản"
                value={selectedAccountId}
                onChange={(e) => {
                  const target = accounts.find((a) => a.id === Number(e.target.value));
                  if (target) handleSelectAccount(target);
                }}
                className="w-full h-[38px] px-3 rounded-[8px] bg-[#ffffff] border border-[#dce4e0] text-[13px] font-semibold text-[#17231f] focus:outline-none focus:border-[#176b51]"
              >
                {accounts.map((acc) => {
                  const reason = getAccountIneligibilityReason(acc);
                  return (
                    <option
                      key={acc.id}
                      value={acc.id}
                      disabled={Boolean(reason)}
                    >
                      {acc.display_name} (@{acc.username || 'chua_ket_noi'}) ·{' '}
                      {reason
                        ? `[Không khả dụng: ${reason}]`
                        : `${acc.published_today_count}/${acc.daily_post_cap} bài hôm nay`}
                    </option>
                  );
                })}
              </select>

              {/* Nút mở bộ tìm kiếm nhanh trong 20 tài khoản */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  className="w-full h-[34px] px-3 rounded-[7px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px] font-semibold text-[#3d4f47] hover:border-[#176b51] flex items-center justify-between"
                >
                  <span>Tìm nhanh theo tên kênh, @username hoặc chủ đề...</span>
                  <Icon name={isAccountDropdownOpen ? 'chevronDown' : 'search'} size={14} />
                </button>

                {isAccountDropdownOpen && (
                  <div className="mt-2 p-2.5 rounded-[8px] bg-[#ffffff] border border-[#dce4e0] shadow-sm space-y-2">
                    <input
                      type="search"
                      value={accountSearchQuery}
                      onChange={(e) => setAccountSearchQuery(e.target.value)}
                      placeholder="Gõ @username, chi nhánh hoặc chủ đề (VD: ANC, Lab, Sài Gòn)..."
                      className="w-full h-[34px] px-2.5 rounded-[6px] bg-[#f6f8f6] border border-[#dce4e0] text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                    />
                    <div className="max-h-[190px] overflow-y-auto divide-y divide-[#eef2f0]">
                      {filteredAccounts.map((acc) => {
                        const reason = getAccountIneligibilityReason(acc);
                        const remDays = getTokenRemainingDays(acc.token_expires_at);
                        const isSelected = acc.id === selectedAccountId;
                        return (
                          <button
                            key={`dropdown_${acc.id}`}
                            type="button"
                            disabled={Boolean(reason)}
                            onClick={() => handleSelectAccount(acc)}
                            className={`w-full text-left p-2 rounded-[6px] flex items-start justify-between gap-2 transition-colors ${
                              isSelected
                                ? 'bg-[#e9f4ef]'
                                : reason
                                ? 'opacity-60 cursor-not-allowed bg-[#fafbfa]'
                                : 'hover:bg-[#f6f8f6]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-[#17231f] truncate">
                                {acc.display_name}{' '}
                                <span className="font-mono text-[12px] text-[#176b51]">
                                  @{acc.username}
                                </span>
                              </div>
                              {acc.notes && (
                                <div className="text-[12px] text-[#3d4f47] truncate">
                                  {acc.notes}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {reason ? (
                                <span className="inline-block px-2 py-0.5 rounded bg-[#fbefed] text-[#bc5b52] text-[11px] font-bold">
                                  {reason}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded bg-[#eaf5ef] text-[#176b51] font-mono text-[11px] font-bold">
                                  {acc.published_today_count}/{acc.daily_post_cap} bài ·{' '}
                                  {remDays !== null ? `${remDays}d` : 'OAuth'}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* KHỐI 2: CHẾ ĐỘ CHUỖI BÀI NỐI TIẾP (CHỈ HIỆN KHI CÓ TỪ 2 PHẦN TRỞ LÊN) */}
            {steps.length >= 2 && (
              <div className="p-4 rounded-[10px] bg-[#e9f4ef] border border-[#b8e2cf] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-[#176b51]">
                    Chế độ đăng chuỗi ({steps.length} phần)
                  </span>
                  <span className="font-mono text-[11px] text-[#176b51] bg-[#ffffff] px-2 py-0.5 rounded">
                    chain_mode
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChainMode('auto')}
                    className={`py-2 px-3 rounded-[7px] text-[12px] font-bold border text-left transition-colors ${
                      chainMode === 'auto'
                        ? 'bg-[#176b51] text-[#ffffff] border-[#176b51]'
                        : 'bg-[#ffffff] text-[#17231f] border-[#dce4e0]'
                    }`}
                  >
                    <div>Tự động nối tiếp 30–60s</div>
                    <div
                      className={`text-[11px] font-normal mt-0.5 ${
                        chainMode === 'auto' ? 'text-[#e2f5ec]' : 'text-[#3d4f47]'
                      }`}
                    >
                      Đăng bài con ngay khi bài gốc xong
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChainMode('scheduled')}
                    className={`py-2 px-3 rounded-[7px] text-[12px] font-bold border text-left transition-colors ${
                      chainMode === 'scheduled'
                        ? 'bg-[#176b51] text-[#ffffff] border-[#176b51]'
                        : 'bg-[#ffffff] text-[#17231f] border-[#dce4e0]'
                    }`}
                  >
                    <div>Hẹn giờ riêng từng phần</div>
                    <div
                      className={`text-[11px] font-normal mt-0.5 ${
                        chainMode === 'scheduled' ? 'text-[#e2f5ec]' : 'text-[#3d4f47]'
                      }`}
                    >
                      Đặt mốc giờ cụ thể cho mỗi phần
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* KHỐI 3: THỜI GIAN ĐĂNG & CÁC NÚT CHỌN NHANH (CUSTOM QUICK DATE-TIME PICKER) */}
            <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#dce4e0] space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="composer-root-scheduled-at"
                  className="text-[13px] font-bold text-[#17231f]"
                >
                  Thời điểm hẹn đăng {steps.length > 1 ? 'bài mở đầu (#1)' : ''}
                </label>
                <span className="font-mono text-[11px] text-[#3d4f47] bg-[#f0f3f1] px-2 py-0.5 rounded">
                  GMT+7 · Asia/Ho_Chi_Minh
                </span>
              </div>

              {/* 4 Nút chọn nhanh thời gian */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStep(0, { scheduled_at: getDefaultDateTimeLocal(3) }, false)
                  }
                  className="h-8 px-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#dce4e0] hover:border-[#176b51] text-[12px] font-semibold text-[#17231f] text-left truncate"
                >
                  Bây giờ (+3 phút)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStep(0, { scheduled_at: getDefaultDateTimeLocal(60) }, false)
                  }
                  className="h-8 px-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#dce4e0] hover:border-[#176b51] text-[12px] font-semibold text-[#17231f] text-left truncate"
                >
                  +1 giờ tới
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStep(0, { scheduled_at: getTomorrowMorning0800() }, false)
                  }
                  className="h-8 px-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#dce4e0] hover:border-[#176b51] text-[12px] font-semibold text-[#17231f] text-left truncate"
                >
                  Sáng mai 08:00
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStep(0, { scheduled_at: goldenHourSuggestion.value }, false)
                  }
                  title="Tự động chọn khung giờ tương tác cao tiếp theo (11:30, 19:30 hoặc 21:00)"
                  className="h-8 px-2.5 rounded-[7px] bg-[#e9f4ef] border border-[#b8e2cf] hover:bg-[#176b51] hover:text-[#ffffff] text-[12px] font-bold text-[#176b51] text-left truncate transition-colors"
                >
                  Giờ đẹp ({goldenHourSuggestion.label})
                </button>
              </div>

              <input
                id="composer-root-scheduled-at"
                type="datetime-local"
                value={steps[0]?.scheduled_at || ''}
                onChange={(e) =>
                  handleUpdateStep(0, { scheduled_at: e.target.value }, false)
                }
                className={`w-full h-[38px] px-3 rounded-[8px] bg-[#ffffff] border font-mono text-[13px] text-[#17231f] focus:outline-none ${
                  scheduleTimeErrors[0]
                    ? 'border-[#bc5b52] bg-[#fbefed]/30'
                    : 'border-[#dce4e0] focus:border-[#176b51]'
                }`}
              />

              {selectedAccount && (
                <div className="text-[12px] text-[#3d4f47] flex items-center justify-between">
                  <span>
                    Khung giờ hoạt động kênh: {selectedAccount.active_hours_start} –{' '}
                    {selectedAccount.active_hours_end}
                  </span>
                  <span className="font-mono">scheduled_at</span>
                </div>
              )}

              {scheduleTimeErrors[0] && (
                <div className="p-2.5 rounded-[7px] bg-[#fbefed] border border-[#bc5b52]/40 text-[12px] font-semibold text-[#bc5b52]">
                  {scheduleTimeErrors[0]}
                </div>
              )}
            </div>

            {/* KHỐI 4: QUYỀN PHẢN HỒI (reply_control) */}
            <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#dce4e0] space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="composer-reply-control"
                  className="text-[13px] font-bold text-[#17231f]"
                >
                  Ai có thể trả lời bài viết này?
                </label>
                <span className="font-mono text-[11px] text-[#495a52] bg-[#f0f3f1] px-1.5 py-0.5 rounded">
                  reply_control
                </span>
              </div>
              <select
                id="composer-reply-control"
                value={replyControl}
                onChange={(e) => setReplyControl(e.target.value as ThreadsReplyControl)}
                className="w-full h-[38px] px-3 rounded-[8px] bg-[#ffffff] border border-[#dce4e0] text-[13px] font-medium text-[#17231f] focus:outline-none focus:border-[#176b51]"
              >
                <option value="everyone">Mọi người trên Threads</option>
                <option value="accounts_you_follow">Tài khoản bạn đang theo dõi</option>
                <option value="mentioned_only">Chỉ những người được nhắc tên trong bài</option>
              </select>
            </div>

            {/* KHỐI 5: THU GỌN "ĐÂY LÀ BÀI HỢP TÁC TRẢ PHÍ" THÀNH 1 DÒNG MẶC ĐỊNH */}
            <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#dce4e0] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSponsored}
                    onChange={(e) => setIsSponsored(e.target.checked)}
                    className="w-4 h-4 rounded border-[#dce4e0] text-[#176b51] focus:ring-[#176b51]"
                  />
                  <span className="text-[13px] font-bold text-[#17231f]">
                    Đây là bài hợp tác trả phí
                  </span>
                </label>
                <span
                  title="Trường đánh dấu bài tài trợ trên hệ thống"
                  className="font-mono text-[11px] text-[#495a52] bg-[#f0f3f1] px-2 py-0.5 rounded"
                >
                  is_sponsored
                </span>
              </div>

              {isSponsored && (
                <div className="pt-3 border-t border-[#e2e9e4] space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="composer-client-ref"
                        className="text-[13px] font-semibold text-[#17231f]"
                      >
                        Mã đối tác / Chiến dịch
                      </label>
                      <span className="font-mono text-[11px] text-[#495a52]">client_ref</span>
                    </div>
                    <input
                      id="composer-client-ref"
                      type="text"
                      value={clientRef}
                      onChange={(e) => setClientRef(e.target.value)}
                      placeholder="VD: BRAND_AUDIOFOAM_Q4"
                      className="w-full h-[36px] px-3 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] font-mono text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="composer-sponsored-suffix"
                        className="text-[13px] font-semibold text-[#17231f]"
                      >
                        Hậu tố hiển thị cuối bài (Tùy chọn)
                      </label>
                      <span className="font-mono text-[11px] text-[#495a52]">
                        sponsored_suffix
                      </span>
                    </div>
                    <input
                      id="composer-sponsored-suffix"
                      type="text"
                      value={sponsoredSuffix}
                      onChange={(e) => setSponsoredSuffix(e.target.value)}
                      placeholder="Để trống để giữ nguyên 100% văn bản gốc, hoặc nhập #Sponsored"
                      className="w-full h-[36px] px-3 rounded-[7px] bg-[#ffffff] border border-[#dce4e0] text-[13px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {[
                        { label: 'Không gắn hậu tố', val: '' },
                        { label: '#Sponsored', val: '#Sponsored' },
                        { label: '#Ad', val: '#Ad' },
                        { label: '[Hợp tác trả phí]', val: '[Hợp tác trả phí]' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setSponsoredSuffix(preset.val)}
                          className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold border transition-colors ${
                            sponsoredSuffix === preset.val
                              ? 'bg-[#176b51] text-[#ffffff] border-[#176b51]'
                              : 'bg-[#f6f8f6] text-[#3d4f47] border-[#dce4e0] hover:bg-[#e9f4ef]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {sponsoredSuffix.trim() !== '' && (
                    <div className="p-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#dce4e0] text-[12px]">
                      <div className="font-semibold text-[#176b51]">
                        Xem trước câu chữ cuối bài sau khi gắn hậu tố:
                      </div>
                      <p className="mt-1 font-mono text-[#17231f] whitespace-pre-wrap break-words">
                        {stepValidations[0]?.effectiveText || sponsoredSuffix.trim()}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {submitError && (
              <div
                role="alert"
                className="p-3 rounded-[8px] bg-[#fbefed] border border-[#bc5b52] text-[13px] font-semibold text-[#bc5b52]"
              >
                {submitError}
              </div>
            )}
          </div>
        </div>

        {/* 3. STICKY FOOTER (HIỂN THỊ TRẠNG THÁI RÕ RÀNG CẠNH NÚT CHÍNH) */}
        <div className="px-5 py-3.5 border-t border-[#e2e9e4] bg-[#fafbfa] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          {/* Lý do cụ thể hiển thị ngay ở Sticky Footer */}
          <div
            data-testid="composer-footer-status"
            className="flex items-center gap-2 min-w-0"
          >
            {readinessSummary.ready ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-[20px] bg-[#eaf5ef] border border-[#b8e2cf] text-[#176b51] text-[13px] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#28805e]" />
                <span>{readinessSummary.message}</span>
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-[20px] text-[13px] font-semibold ${
                  readinessSummary.type === 'error'
                    ? 'bg-[#fbefed] border border-[#bc5b52]/30 text-[#bc5b52]'
                    : 'bg-[#faf3e7] border border-[#e2c699] text-[#7c4d0f]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    readinessSummary.type === 'error' ? 'bg-[#bc5b52]' : 'bg-[#b77a21]'
                  }`}
                />
                <span className="truncate">{readinessSummary.message}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRequestClose}
              className="h-[38px] px-4 rounded-[8px] bg-[#ffffff] border border-[#dce4e0] text-[#3d4f47] text-[13px] font-semibold hover:bg-[#f0f3f1]"
            >
              Hủy
            </button>

            <button
              type="button"
              disabled={isSubmitting || !allStepsValid}
              title={!allStepsValid ? readinessSummary.message : 'Lưu vào danh sách bản nháp'}
              onClick={() => void handleSubmit('draft')}
              className="h-[38px] px-4 rounded-[8px] bg-[#ffffff] border border-[#176b51] text-[#176b51] text-[13px] font-semibold hover:bg-[#e9f4ef] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Lưu bản nháp
            </button>

            <button
              type="button"
              disabled={isSubmitting || !allStepsValid}
              title={!allStepsValid ? readinessSummary.message : 'Lên lịch xuất bản tự động'}
              onClick={() => void handleSubmit('scheduled')}
              className="h-[38px] px-5 rounded-[8px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <span>
                {isSubmitting
                  ? 'Đang lưu lịch...'
                  : steps.length > 1
                  ? `Lên lịch chuỗi ${steps.length} bài`
                  : 'Lên lịch bài đăng'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreadsPostComposerModal;
