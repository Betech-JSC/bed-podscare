'use client';

import React, { useMemo, useState } from 'react';
import type {
  CreateThreadsAccountPayload,
  ThreadsAccount,
  ThreadsAccountStatus,
  UpdateThreadsAccountPayload,
} from '@/src/lib/threads-api';

export interface ThreadsAccountTableProps {
  accounts: ThreadsAccount[];
  statusFilter?: string;
  onStatusFilterChange?: (nextStatus: string) => void;
  onCreateAccount: (payload: CreateThreadsAccountPayload) => Promise<void>;
  onUpdateAccount: (id: number, payload: UpdateThreadsAccountPayload) => Promise<void>;
  onToggleStatus: (account: ThreadsAccount) => Promise<void>;
  onRefreshToken: (account: ThreadsAccount) => Promise<void>;
  onRequestOAuthUrl: (account: ThreadsAccount) => Promise<{ authorize_url: string; state: string }>;
  onSelectAccountForComposer?: (account: ThreadsAccount) => void;
}

const STATUS_META: Record<
  ThreadsAccountStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: 'Đang hoạt động',
    badgeClass: 'text-[#28805e] bg-[#eaf5ef]',
    dotClass: 'bg-[#28805e]',
  },
  needs_reauth: {
    label: 'Cần kết nối lại OAuth',
    badgeClass: 'text-[#b77a21] bg-[#faf3e7]',
    dotClass: 'bg-[#b77a21]',
  },
  paused: {
    label: 'Đang tạm dừng',
    badgeClass: 'text-[#77847e] bg-[#f0f3f1]',
    dotClass: 'bg-[#77847e]',
  },
  disabled: {
    label: 'Đã vô hiệu hóa',
    badgeClass: 'text-[#bc5b52] bg-[#fbefed]',
    dotClass: 'bg-[#bc5b52]',
  },
};

function computeDaysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return null;
  const diffMs = ts - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatShortDate(iso: string | null): string {
  if (!iso) return 'Chưa cấp';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export const ThreadsAccountTable: React.FC<ThreadsAccountTableProps> = ({
  accounts,
  statusFilter = 'all',
  onStatusFilterChange,
  onCreateAccount,
  onUpdateAccount,
  onToggleStatus,
  onRefreshToken,
  onRequestOAuthUrl,
  onSelectAccountForComposer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [localStatusFilter, setLocalStatusFilter] = useState<string>(statusFilter);
  const [busyAccountId, setBusyAccountId] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<ThreadsAccount | null>(null);
  const [editCap, setEditCap] = useState<number>(8);
  const [editStartHour, setEditStartHour] = useState<string>('08:00');
  const [editEndHour, setEditEndHour] = useState<string>('22:00');
  const [editAppGroup, setEditAppGroup] = useState<string>('primary_dev_app');
  const [editNotes, setEditNotes] = useState<string>('');

  const [isAddOpen, setIsAddOpen] = useState<boolean>(() => accounts.length === 0);
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newAppGroup, setNewAppGroup] = useState<string>('primary_dev_app');
  const [newDailyCap, setNewDailyCap] = useState<number>(8);
  const [newNotes, setNewNotes] = useState<string>('');
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [oauthDialogData, setOauthDialogData] = useState<{
    account: ThreadsAccount;
    authorize_url: string;
    state: string;
    copied?: boolean;
  } | null>(null);

  const effectiveStatusFilter = onStatusFilterChange ? statusFilter : localStatusFilter;

  const handleFilterClick = (next: string) => {
    setLocalStatusFilter(next);
    onStatusFilterChange?.(next);
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (effectiveStatusFilter !== 'all' && acc.status !== effectiveStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = acc.display_name.toLowerCase().includes(q);
        const matchUser = (acc.username || '').toLowerCase().includes(q);
        const matchNotes = (acc.notes || '').toLowerCase().includes(q);
        const matchGroup = acc.app_group.toLowerCase().includes(q);
        return matchName || matchUser || matchNotes || matchGroup;
      }
      return true;
    });
  }, [accounts, effectiveStatusFilter, searchQuery]);

  const handleOpenEdit = (acc: ThreadsAccount) => {
    setEditingAccount(acc);
    setEditCap(acc.daily_post_cap || 8);
    setEditStartHour(acc.active_hours_start || '08:00');
    setEditEndHour(acc.active_hours_end || '22:00');
    setEditAppGroup(acc.app_group || 'primary_dev_app');
    setEditNotes(acc.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setBusyAccountId(editingAccount.id);
    setInlineError(null);
    try {
      await onUpdateAccount(editingAccount.id, {
        daily_post_cap: Math.max(1, Math.min(50, Number(editCap) || 8)),
        active_hours_start: editStartHour,
        active_hours_end: editEndHour,
        app_group: editAppGroup.trim() || 'primary_dev_app',
        notes: editNotes.trim() || null,
      });
      setEditingAccount(null);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Không thể cập nhật cấu hình tài khoản.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim()) return;
    setIsSubmittingNew(true);
    setInlineError(null);
    try {
      await onCreateAccount({
        display_name: newDisplayName.trim(),
        username: newUsername.trim().replace(/^@/, '') || null,
        app_group: newAppGroup.trim() || 'primary_dev_app',
        daily_post_cap: Math.max(1, Math.min(50, Number(newDailyCap) || 8)),
        notes: newNotes.trim() || null,
      });
      setNewDisplayName('');
      setNewUsername('');
      setNewNotes('');
      setIsAddOpen(false);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Không thể tạo tài khoản Threads.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleClickOAuth = async (acc: ThreadsAccount) => {
    setBusyAccountId(acc.id);
    setInlineError(null);
    try {
      const res = await onRequestOAuthUrl(acc);
      setOauthDialogData({
        account: acc,
        authorize_url: res.authorize_url,
        state: res.state,
        copied: false,
      });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Không thể khởi tạo liên kết OAuth.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleClickRefresh = async (acc: ThreadsAccount) => {
    setBusyAccountId(acc.id);
    setInlineError(null);
    try {
      await onRefreshToken(acc);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Không thể làm mới token OAuth.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleClickToggle = async (acc: ThreadsAccount) => {
    setBusyAccountId(acc.id);
    setInlineError(null);
    try {
      await onToggleStatus(acc);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Không thể chuyển đổi trạng thái tài khoản.');
    } finally {
      setBusyAccountId(null);
    }
  };

  return (
    <div className="bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] overflow-hidden">
      {inlineError && (
        <div
          role="alert"
          className="px-4 py-3 bg-[#fbefed] border-b border-[#bc5b52]/30 flex items-center justify-between gap-3 text-[12px] font-medium text-[#bc5b52]"
        >
          <span>{inlineError}</span>
          <button
            type="button"
            onClick={() => setInlineError(null)}
            className="h-6 px-2 rounded bg-[#ffffff] border border-[#bc5b52]/30 text-[11px] font-semibold text-[#bc5b52]"
          >
            Đóng
          </button>
        </div>
      )}
      {/* Thanh công cụ lọc và thêm tài khoản */}
      <div className="p-4 border-b border-[#e9eeeb] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-[#fafbfa]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-[16px] font-bold text-[#17231f] mr-2">
            Mạng lưới 20 Tài khoản Threads ({accounts.length}/20)
          </h2>
          {(
            [
              { key: 'all', label: `Tất cả (${accounts.length})` },
              {
                key: 'active',
                label: `Hoạt động (${accounts.filter((a) => a.status === 'active').length})`,
              },
              {
                key: 'needs_reauth',
                label: `Cần kết nối lại (${
                  accounts.filter((a) => a.status === 'needs_reauth').length
                })`,
              },
              {
                key: 'paused',
                label: `Tạm dừng (${accounts.filter((a) => a.status === 'paused').length})`,
              },
            ] as const
          ).map((tab) => {
            const active = effectiveStatusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleFilterClick(tab.key)}
                className={`h-7 px-2.5 rounded-[7px] text-[11px] font-semibold transition-colors ${
                  active
                    ? 'bg-[#176b51] text-[#ffffff] border border-[#176b51]'
                    : 'bg-[#ffffff] text-[#516059] border border-[#e2e9e4] hover:bg-[#e9f4ef] hover:text-[#176b51]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên kênh, @username, nhóm app..."
            aria-label="Tìm kiếm tài khoản Threads"
            className="h-[34px] w-full sm:w-[250px] px-3 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f] placeholder-[#81908a] focus:outline-none focus:border-[#176b51]"
          />
          <button
            type="button"
            onClick={() => setIsAddOpen((prev) => !prev)}
            disabled={accounts.length >= 20 && !isAddOpen}
            className="h-[34px] px-3 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] disabled:opacity-50 text-[12px] font-semibold transition-colors"
          >
            {isAddOpen ? 'Đóng biểu mẫu' : 'Thêm tài khoản Threads'}
          </button>
        </div>
      </div>

      {/* Biểu mẫu thêm tài khoản mới (khi cần bổ sung vào mạng lưới 20 kênh) */}
      {isAddOpen && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 bg-[#e9f4ef]/50 border-b border-[#e9eeeb] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Tên định danh nội bộ
            </label>
            <input
              type="text"
              required
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="VD: PodsCare Official 21"
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Tên người dùng (@username)
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="VD: podscare.mienbac"
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Nhóm Meta App (app_group)
            </label>
            <select
              value={newAppGroup}
              onChange={(e) => setNewAppGroup(e.target.value)}
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
            >
              <option value="primary_dev_app">primary_dev_app (Threads Tester)</option>
              <option value="app_group_2">app_group_2 (Meta App mở rộng)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Trần bài đăng/ngày (daily_post_cap)
            </label>
            <input
              type="number"
              min={1}
              max={25}
              value={newDailyCap}
              onChange={(e) => setNewDailyCap(Number(e.target.value))}
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmittingNew}
              className="h-[34px] px-3 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[12px] font-semibold"
            >
              {isSubmittingNew ? 'Đang lưu...' : 'Lưu tài khoản'}
            </button>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] text-[12px] font-semibold"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Hộp thoại hiển thị link ủy quyền OAuth 2.0 */}
      {oauthDialogData && (
        <div
          role="region"
          aria-label="Liên kết ủy quyền Meta Threads OAuth 2.0"
          className="p-4 bg-[#faf3e7] border-b border-[#e5d5b5] flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-[#17231f]">
              Liên kết ủy quyền OAuth 2.0 cho {oauthDialogData.account.display_name} (@
              {oauthDialogData.account.username || 'chưa đồng bộ'})
            </span>
            <button
              type="button"
              onClick={() => setOauthDialogData(null)}
              className="h-7 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[11px] font-semibold text-[#516059]"
            >
              Đóng
            </button>
          </div>
          <p className="text-[11px] text-[#516059]">
            Đảm bảo tài khoản đã được chấp nhận quyền Threads Tester trong Meta App Development Mode,
            sau đó mở liên kết dưới đây để cấp Long-Lived Token 60 ngày (được mã hóa chuẩn AES-256-GCM):
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={oauthDialogData.authorize_url}
              className="flex-1 h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] font-mono text-[11px] text-[#17231f]"
            />
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(oauthDialogData.authorize_url);
                  setOauthDialogData((prev) => (prev ? { ...prev, copied: true } : null));
                }
              }}
              className="h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#176b51] text-[#176b51] text-[11px] font-semibold hover:bg-[#e9f4ef]"
            >
              {oauthDialogData.copied ? 'Đã sao chép URL' : 'Sao chép link OAuth'}
            </button>
            <a
              href={oauthDialogData.authorize_url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-[34px] px-3 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[11px] font-semibold inline-flex items-center justify-center"
            >
              Mở trang ủy quyền Threads
            </a>
          </div>
        </div>
      )}

      {/* Biểu mẫu chỉnh sửa cấu hình tài khoản */}
      {editingAccount && (
        <form
          onSubmit={handleSaveEdit}
          className="p-4 bg-[#f6f8f6] border-b border-[#e9eeeb] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
        >
          <div className="lg:col-span-2">
            <div className="text-[11px] font-bold text-[#176b51] uppercase tracking-[0.5px]">
              Cấu hình hạn mức & khung giờ
            </div>
            <div className="text-[13px] font-bold text-[#17231f] truncate">
              {editingAccount.display_name} (@{editingAccount.username})
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Giới hạn bài/ngày (Cap)
            </label>
            <input
              type="number"
              min={1}
              max={25}
              value={editCap}
              onChange={(e) => setEditCap(Number(e.target.value))}
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Khung giờ hoạt động
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={editStartHour}
                onChange={(e) => setEditStartHour(e.target.value)}
                className="w-full h-[34px] px-2 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
              />
              <span className="text-[11px] text-[#81908a]">-</span>
              <input
                type="time"
                value={editEndHour}
                onChange={(e) => setEditEndHour(e.target.value)}
                className="w-full h-[34px] px-2 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#17231f] mb-1">
              Nhóm Meta App
            </label>
            <select
              value={editAppGroup}
              onChange={(e) => setEditAppGroup(e.target.value)}
              className="w-full h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
            >
              <option value="primary_dev_app">primary_dev_app</option>
              <option value="app_group_2">app_group_2</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busyAccountId === editingAccount.id}
              className="h-[34px] px-3 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[11px] font-semibold"
            >
              Lưu cấu hình
            </button>
            <button
              type="button"
              onClick={() => setEditingAccount(null)}
              className="h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] text-[11px] font-semibold"
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      {/* Bảng dữ liệu 20 tài khoản */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#e9eeeb] bg-[#fafbfa] text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a]">
              <th className="py-3 px-3.5">#</th>
              <th className="py-3 px-3.5">Tài khoản Threads</th>
              <th className="py-3 px-3.5">Nhóm App / Tester</th>
              <th className="py-3 px-3.5">Trạng thái OAuth</th>
              <th className="py-3 px-3.5">Hạn Token 60 ngày</th>
              <th className="py-3 px-3.5">Tiến độ hôm nay (Cap)</th>
              <th className="py-3 px-3.5">Khung giờ rải lịch</th>
              <th className="py-3 px-3.5 text-right">Thao tác vận hành</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e9eeeb] text-[12px] text-[#17231f]">
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[13px] text-[#81908a]">
                  Không tìm thấy tài khoản Threads phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((acc, index) => {
                const statusInfo = STATUS_META[acc.status] || STATUS_META.needs_reauth;
                const daysLeft = computeDaysRemaining(acc.token_expires_at);
                const isExpiringSoon = daysLeft !== null && daysLeft < 14;
                const cap = Math.max(1, acc.daily_post_cap || 8);
                const publishedToday = acc.published_today_count || 0;
                const progressPct = Math.min(100, Math.round((publishedToday / cap) * 100));
                const isBusy = busyAccountId === acc.id;

                return (
                  <tr
                    key={acc.id}
                    className="hover:bg-[#f6f8f6]/70 transition-colors align-top"
                  >
                    <td className="py-3 px-3.5 font-mono text-[11px] text-[#81908a]">
                      {String(index + 1).padStart(2, '0')}
                    </td>

                    <td className="py-3 px-3.5 min-w-[210px]">
                      <div className="font-semibold text-[13px] text-[#17231f]">
                        {acc.display_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-[#81908a]">
                        <span>@{acc.username || 'chua_ket_noi'}</span>
                        {acc.threads_user_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0f3f1] text-[#516059]">
                            ID: {acc.threads_user_id}
                          </span>
                        )}
                      </div>
                      {acc.notes && (
                        <div className="mt-1 text-[11px] text-[#81908a] line-clamp-1">
                          {acc.notes}
                        </div>
                      )}
                      {acc.last_error_message && (
                        <div className="mt-1 text-[11px] text-[#bc5b52] bg-[#fbefed] px-2 py-1 rounded-[6px] font-mono">
                          {acc.last_error_message}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] bg-[#e9f4ef] text-[#176b51] font-mono text-[11px] font-medium">
                        {acc.app_group}
                      </span>
                      <div className="text-[10px] text-[#81908a] mt-1">
                        Threads Tester · AES-256-GCM
                      </div>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-[10px] font-semibold ${statusInfo.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                        {statusInfo.label}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="font-mono text-[11px] font-medium text-[#17231f]">
                        {formatShortDate(acc.token_expires_at)}
                      </div>
                      {daysLeft !== null ? (
                        <div
                          className={`text-[10px] font-semibold mt-0.5 ${
                            daysLeft <= 0
                              ? 'text-[#bc5b52]'
                              : isExpiringSoon
                              ? 'text-[#b77a21]'
                              : 'text-[#28805e]'
                          }`}
                        >
                          {daysLeft <= 0
                            ? 'Đã hết hạn token'
                            : isExpiringSoon
                            ? `Còn ${daysLeft} ngày (Sắp tự gia hạn)`
                            : `Còn ${daysLeft} ngày`}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#81908a] mt-0.5">Chưa cấp OAuth</div>
                      )}
                    </td>

                    <td className="py-3 px-3.5 min-w-[150px]">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="font-semibold text-[#17231f]">
                          {publishedToday} / {cap} bài
                        </span>
                        <span className="text-[#81908a]">
                          Quota 24h: {acc.quota_used_24h}/{acc.quota_total_24h}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#f0f3f1] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            progressPct >= 100 ? 'bg-[#b77a21]' : 'bg-[#176b51]'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[11px] text-[#516059]">
                      <div>
                        {acc.active_hours_start} – {acc.active_hours_end}
                      </div>
                      <div className="text-[10px] font-sans text-[#81908a] mt-0.5">
                        Random Jitter ±8p
                      </div>
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {onSelectAccountForComposer && (
                          <button
                            type="button"
                            onClick={() => onSelectAccountForComposer(acc)}
                            className="h-7 px-2.5 rounded-[7px] bg-[#e9f4ef] text-[#176b51] hover:bg-[#176b51] hover:text-[#ffffff] text-[10px] font-semibold transition-colors"
                          >
                            Soạn bài
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleClickOAuth(acc)}
                          className="h-7 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] hover:border-[#176b51] text-[#17231f] text-[10px] font-semibold transition-colors"
                        >
                          Lấy link OAuth
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleClickRefresh(acc)}
                          className="h-7 px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] hover:border-[#176b51] text-[#176b51] text-[10px] font-semibold transition-colors"
                        >
                          Làm mới Token
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleClickToggle(acc)}
                          className={`h-7 px-2.5 rounded-[7px] border text-[10px] font-semibold transition-colors ${
                            acc.status === 'active'
                              ? 'bg-[#ffffff] border-[#e2e9e4] text-[#77847e] hover:bg-[#f0f3f1]'
                              : 'bg-[#176b51] border-[#176b51] text-[#ffffff] hover:bg-[#10583f]'
                          }`}
                        >
                          {acc.status === 'active' ? 'Tạm dừng' : 'Kích hoạt'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleOpenEdit(acc)}
                          className="h-7 px-2 rounded-[7px] bg-transparent hover:bg-[#f0f3f1] text-[#516059] text-[10px] font-semibold"
                        >
                          Cấu hình
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ThreadsAccountTable;
