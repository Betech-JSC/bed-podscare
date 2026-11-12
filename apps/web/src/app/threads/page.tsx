'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@podscare/ui';
import {
  countUtf8Chars,
  createThreadsAccount,
  createThreadsPost,
  deleteThreadsPost,
  extractUniqueUrls,
  fetchThreadsAccounts,
  fetchThreadsDashboardStats,
  fetchThreadsPosts,
  fetchThreadsPublishLogs,
  generateSampleThreadsCsv,
  importThreadsCsv,
  publishThreadsPostNow,
  refreshThreadsAccountTokenNow,
  requestThreadsOAuthUrl,
  resolveEffectiveText,
  retryThreadsPost,
  toggleThreadsAccountStatus,
  updateThreadsAccount,
  type CreateThreadsAccountPayload,
  type CreateThreadsPostPayload,
  type CsvImportOptions,
  type CsvImportResult,
  type ThreadsAccount,
  type ThreadsDashboardStats,
  type ThreadsPost,
  type ThreadsPostStatus,
  type ThreadsPublishLog,
  type UpdateThreadsAccountPayload,
} from '@/src/lib/threads-api';
import { ThreadsStatsHeader } from '@/src/components/threads/ThreadsStatsHeader';
import { ThreadsAccountTable } from '@/src/components/threads/ThreadsAccountTable';
import { ThreadsPostComposerModal } from '@/src/components/threads/ThreadsPostComposerModal';
import { ThreadsCsvImportModal } from '@/src/components/threads/ThreadsCsvImportModal';
import { ThreadsPublishLogsDrawer } from '@/src/components/threads/ThreadsPublishLogsDrawer';

type WorkspaceTabKey = 'queue' | 'accounts' | 'csv_scheduler' | 'logs';

const POST_STATUS_BADGE: Record<
  ThreadsPostStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  draft: {
    label: 'Bản nháp',
    badgeClass: 'text-[#77847e] bg-[#f0f3f1]',
    dotClass: 'bg-[#77847e]',
  },
  scheduled: {
    label: 'Đã lên lịch',
    badgeClass: 'text-[#4778a4] bg-[#edf4f8]',
    dotClass: 'bg-[#4778a4]',
  },
  publishing: {
    label: 'Đang xuất bản',
    badgeClass: 'text-[#b77a21] bg-[#faf3e7]',
    dotClass: 'bg-[#b77a21]',
  },
  published: {
    label: 'Đã đăng thành công',
    badgeClass: 'text-[#28805e] bg-[#eaf5ef]',
    dotClass: 'bg-[#28805e]',
  },
  failed: {
    label: 'Lỗi xuất bản',
    badgeClass: 'text-[#bc5b52] bg-[#fbefed]',
    dotClass: 'bg-[#bc5b52]',
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'text-[#77847e] bg-[#f0f3f1]',
    dotClass: 'bg-[#77847e]',
  },
};

export default function ThreadsWorkspacePage() {
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>('queue');
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [stats, setStats] = useState<ThreadsDashboardStats>({
    total_accounts: 0,
    active_accounts: 0,
    needs_reauth_accounts: 0,
    paused_accounts: 0,
    scheduled_today: 0,
    published_today: 0,
    failed_posts: 0,
    sponsored_posts_count: 0,
    recent_logs: [],
  });
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [posts, setPosts] = useState<ThreadsPost[]>([]);
  const [logs, setLogs] = useState<ThreadsPublishLog[]>([]);

  // Bộ lọc hàng đợi bài đăng
  const [postStatusFilter, setPostStatusFilter] = useState<string>('all');
  const [postAccountFilter, setPostAccountFilter] = useState<string>('all');
  const [postSponsoredFilter, setPostSponsoredFilter] = useState<string>('all');
  const [postClientRefFilter, setPostClientRefFilter] = useState<string>('');
  const [postSearchQuery, setPostSearchQuery] = useState<string>('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>('all');

  // Trạng thái đóng/mở các Modal và Drawer
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [composerDefaultAccountId, setComposerDefaultAccountId] = useState<number | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState<boolean>(false);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);

  const loadAllWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, accRes, postRes, logRes] = await Promise.all([
        fetchThreadsDashboardStats(),
        fetchThreadsAccounts(),
        fetchThreadsPosts(),
        fetchThreadsPublishLogs(),
      ]);
      setStats(dashRes.stats);
      setAccounts(accRes.accounts);
      setPosts(postRes.posts);
      setLogs(logRes.logs.length > 0 ? logRes.logs : dashRes.stats.recent_logs || []);
      setIsDemoMode(dashRes.isDemoFallback || accRes.isDemoFallback);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Không thể đồng bộ dữ liệu từ Backend API (/api/v1/threads).'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllWorkspaceData();
  }, [loadAllWorkspaceData]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (postStatusFilter !== 'all' && post.status !== postStatusFilter) {
        return false;
      }
      if (postAccountFilter !== 'all' && post.account_id !== Number(postAccountFilter)) {
        return false;
      }
      if (postSponsoredFilter === 'sponsored' && !post.is_sponsored) {
        return false;
      }
      if (postSponsoredFilter === 'organic' && post.is_sponsored) {
        return false;
      }
      if (postClientRefFilter.trim()) {
        const refQ = postClientRefFilter.trim().toLowerCase();
        if (!(post.client_ref || '').toLowerCase().includes(refQ)) {
          return false;
        }
      }
      if (postSearchQuery.trim()) {
        const q = postSearchQuery.trim().toLowerCase();
        const matchContent = (post.content_text || '').toLowerCase().includes(q);
        const matchTopic = (post.topic_tag || '').toLowerCase().includes(q);
        const matchRef = (post.client_ref || '').toLowerCase().includes(q);
        const matchAccount = (post.account?.username || '').toLowerCase().includes(q);
        return matchContent || matchTopic || matchRef || matchAccount;
      }
      return true;
    });
  }, [
    posts,
    postStatusFilter,
    postAccountFilter,
    postSponsoredFilter,
    postClientRefFilter,
    postSearchQuery,
  ]);

  const handleSelectKpiCard = (
    target:
      | 'active_accounts'
      | 'needs_reauth'
      | 'scheduled_today'
      | 'published_today'
      | 'failed_posts'
      | 'sponsored_posts'
  ) => {
    if (target === 'active_accounts') {
      setAccountStatusFilter('active');
      setActiveTab('accounts');
      return;
    }
    if (target === 'needs_reauth') {
      setAccountStatusFilter('needs_reauth');
      setActiveTab('accounts');
      return;
    }
    if (target === 'scheduled_today') {
      setPostStatusFilter('scheduled');
      setPostSponsoredFilter('all');
      setActiveTab('queue');
      return;
    }
    if (target === 'published_today') {
      setPostStatusFilter('published');
      setPostSponsoredFilter('all');
      setActiveTab('queue');
      return;
    }
    if (target === 'failed_posts') {
      setPostStatusFilter('failed');
      setPostSponsoredFilter('all');
      setActiveTab('queue');
      return;
    }
    if (target === 'sponsored_posts') {
      setPostStatusFilter('all');
      setPostSponsoredFilter('sponsored');
      setActiveTab('queue');
    }
  };

  const handleCreateAccount = async (payload: CreateThreadsAccountPayload) => {
    setErrorBanner(null);
    try {
      const created = await createThreadsAccount(payload);
      setBannerMessage(`Đã thêm tài khoản "${created.display_name}" vào mạng lưới.`);
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể tạo tài khoản Threads.');
      throw err;
    }
  };

  const handleUpdateAccount = async (id: number, payload: UpdateThreadsAccountPayload) => {
    setErrorBanner(null);
    try {
      const updated = await updateThreadsAccount(id, payload);
      setBannerMessage(`Đã cập nhật cấu hình cho ${updated.display_name}.`);
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể cập nhật tài khoản Threads.');
      throw err;
    }
  };

  const handleToggleAccountStatus = async (account: ThreadsAccount) => {
    setErrorBanner(null);
    try {
      const updated = await toggleThreadsAccountStatus(account.id);
      setBannerMessage(
        `Đã chuyển trạng thái tài khoản @${updated.username || updated.id} sang "${updated.status}".`
      );
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Không thể chuyển trạng thái tài khoản Threads.'
      );
      await loadAllWorkspaceData();
    }
  };

  const handleRefreshAccountToken = async (account: ThreadsAccount) => {
    setErrorBanner(null);
    try {
      const updated = await refreshThreadsAccountTokenNow(account.id);
      setBannerMessage(
        `Đã làm mới Long-Lived Token (60 ngày) cho @${updated.username || updated.display_name}.`
      );
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Không thể làm mới Long-Lived Token từ Meta Threads API.'
      );
      await loadAllWorkspaceData();
    }
  };

  const handleRequestOAuthUrl = async (account: ThreadsAccount) => {
    setErrorBanner(null);
    try {
      return await requestThreadsOAuthUrl(account.id);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Không thể khởi tạo liên kết ủy quyền OAuth 2.0.'
      );
      throw err;
    }
  };

  const handleCreatePost = async (payload: CreateThreadsPostPayload) => {
    setErrorBanner(null);
    const createdList = await createThreadsPost(payload);
    setBannerMessage(
      createdList.length > 1
        ? `Đã lên lịch chuỗi Multi-post Thread (${createdList.length} phần) thành công.`
        : 'Đã lưu lịch bài đăng Threads thành công.'
    );
    await loadAllWorkspaceData();
  };

  const handlePublishNow = async (post: ThreadsPost) => {
    setBusyPostId(post.id);
    setErrorBanner(null);
    try {
      await publishThreadsPostNow(post.id);
      setBannerMessage(
        `Đã xuất bản bài viết #${post.id} qua quy trình 2 bước Container API (và kích hoạt bài con Auto-chain nếu có).`
      );
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : `Không thể xuất bản bài viết #${post.id} lên Meta Threads.`
      );
      await loadAllWorkspaceData();
    } finally {
      setBusyPostId(null);
    }
  };

  const handleRetryPost = async (post: ThreadsPost) => {
    setBusyPostId(post.id);
    setErrorBanner(null);
    try {
      await retryThreadsPost(post.id);
      setBannerMessage(
        `Đã đưa bài viết #${post.id} vào hàng đợi thử lại (đối soát Idempotency container_id trước khi gọi publish).`
      );
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : `Không thể thử lại bài viết #${post.id}.`
      );
      await loadAllWorkspaceData();
    } finally {
      setBusyPostId(null);
    }
  };

  const handleDeletePost = async (post: ThreadsPost) => {
    setBusyPostId(post.id);
    setErrorBanner(null);
    try {
      await deleteThreadsPost(post.id);
      setBannerMessage(`Đã xóa bài đăng #${post.id} khỏi hàng đợi.`);
      await loadAllWorkspaceData();
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : `Không thể xóa bài viết #${post.id}.`
      );
    } finally {
      setBusyPostId(null);
    }
  };

  const handleImportCsv = async (options: CsvImportOptions): Promise<CsvImportResult> => {
    setErrorBanner(null);
    const res = await importThreadsCsv(options);
    setBannerMessage(
      `Hoàn tất nhập lô CSV (${res.import_batch_id}): Đã phân bổ lịch + Random Jitter cho ${res.imported_count}/${res.total_rows} bài.`
    );
    await loadAllWorkspaceData();
    return res;
  };

  const handleQuickDownload100Csv = () => {
    const content = generateSampleThreadsCsv(100);
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'podscare-threads-100-posts-sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#17231f] flex flex-col">
      {/* Topbar chuẩn Calm Jade & Warm Ivory */}
      <header className="sticky top-0 z-30 bg-[#ffffff] border-b border-[#e9eeeb]">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/threads"
              className="inline-flex items-center gap-2.5 text-[#17231f] hover:opacity-90 shrink-0"
            >
              <span className="w-8 h-8 rounded-[7px] bg-[#176b51] text-[#ffffff] font-heading font-bold text-[15px] inline-flex items-center justify-center">
                P
              </span>
              <div>
                <div className="font-heading font-bold text-[15px] leading-tight text-[#17231f]">
                  PodsCare · Threads Auto-Publishing
                </div>
                <div className="text-[11px] text-[#81908a] hidden sm:block">
                  Hệ thống điều phối 20 tài khoản công ty · Meta Threads Graph API v1.0
                </div>
              </div>
            </a>

            <span
              data-testid="threads-connection-badge"
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-[10px] font-semibold ${
                isDemoMode
                  ? 'bg-[#faf3e7] text-[#b77a21]'
                  : 'bg-[#eaf5ef] text-[#28805e]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isDemoMode ? 'bg-[#b77a21]' : 'bg-[#28805e]'
                }`}
              />
              {isDemoMode
                ? 'Chế độ Dữ liệu Mẫu 20 Kênh (Sẵn sàng đồng bộ API)'
                : 'Đã kết nối API thật (/api/v1/threads · Live DB)'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/threads/seeding"
              className="h-[34px] px-3 rounded-[7px] bg-[#eaf5ef] border border-[#cde2d8] text-[#176b51] hover:bg-[#d8ecdf] text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Seeding & Khám phá</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setComposerDefaultAccountId(null);
                setIsComposerOpen(true);
              }}
              data-testid="open-composer-button"
              className="h-[34px] px-3.5 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Icon name="plus" size={14} />
              <span>Soạn bài / Chuỗi Thread</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              data-testid="open-csv-import-button"
              className="h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#176b51] text-[#176b51] hover:bg-[#e9f4ef] text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Icon name="download" size={14} />
              <span className="hidden sm:inline">Nhập CSV 100+ bài</span>
              <span className="sm:hidden">CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsLogsDrawerOpen(true)}
              data-testid="open-logs-drawer-button"
              className="h-[34px] px-3 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] hover:border-[#176b51] hover:text-[#17231f] text-[12px] font-semibold transition-colors hidden sm:inline-flex items-center gap-1.5"
            >
              <span>Nhật ký API ({logs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => void loadAllWorkspaceData()}
              aria-label="Làm mới dữ liệu"
              className="h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[#516059] hover:bg-[#f0f3f1] inline-flex items-center justify-center"
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
        {/* Cảnh báo lỗi từ Backend API (OAuth / Token hết hạn / Chạm hạn mức Quota / Validation) */}
        {errorBanner && (
          <div
            role="alert"
            data-testid="threads-error-banner"
            className="p-3.5 rounded-[10px] bg-[#fbefed] border border-[#bc5b52]/40 flex items-center justify-between gap-3 text-[12px] font-medium text-[#bc5b52]"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="h-7 px-2.5 rounded-[6px] bg-[#ffffff] border border-[#bc5b52]/30 text-[11px] font-semibold text-[#bc5b52] shrink-0"
            >
              Đóng cảnh báo
            </button>
          </div>
        )}

        {/* Thông báo phản hồi thao tác thành công */}
        {bannerMessage && (
          <div
            role="status"
            className="p-3.5 rounded-[10px] bg-[#eaf5ef] border border-[#28805e]/30 flex items-center justify-between gap-3 text-[12px] font-medium text-[#17231f]"
          >
            <span>{bannerMessage}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="h-7 px-2.5 rounded-[6px] bg-[#ffffff] border border-[#e2e9e4] text-[11px] font-semibold text-[#516059] shrink-0"
            >
              Đã hiểu
            </button>
          </div>
        )}

        {/* Khung hướng dẫn nhanh khi kết nối Live DB thật nhưng bảng threads_accounts đang trống (0 tài khoản) */}
        {!loading && !isDemoMode && accounts.length === 0 && (
          <div
            data-testid="threads-live-db-empty-banner"
            className="p-4 rounded-[10px] bg-[#ffffff] border border-[#176b51]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div>
              <div className="text-[13px] font-bold text-[#17231f]">
                Đã kết nối Cơ sở dữ liệu thật (Live DB) — Chưa có tài khoản Threads nào được khởi tạo
              </div>
              <p className="text-[12px] text-[#516059] mt-0.5">
                Hệ thống đang kết nối trực tiếp tới <code className="font-mono text-[#176b51]">/api/v1/threads</code> và không trộn lẫn dữ liệu mẫu. Bạn có thể tạo tài khoản thật đầu tiên và cấp quyền OAuth 2.0 ngay tại đây.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAccountStatusFilter('all');
                setActiveTab('accounts');
              }}
              className="h-[34px] px-3.5 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[12px] font-semibold shrink-0"
            >
              Thêm tài khoản thật vào DB
            </button>
          </div>
        )}

        {/* 6 Thẻ KPI thống kê */}
        <ThreadsStatsHeader
          stats={stats}
          loading={loading}
          onSelectFilter={handleSelectKpiCard}
        />

        {/* Thanh chuyển đổi 4 Tabs chính */}
        <div className="border-b border-[#e9eeeb] flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Phân khu điều hành Threads"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                {
                  key: 'queue',
                  label: `1. Hàng đợi & Chuỗi bài nối tiếp (${posts.length})`,
                },
                {
                  key: 'accounts',
                  label: `2. Quản lý 20 Tài khoản & OAuth (${accounts.length}/20)`,
                },
                {
                  key: 'csv_scheduler',
                  label: '3. Nhập CSV 100+ Bài & Random Jitter',
                },
                {
                  key: 'logs',
                  label: `4. Nhật ký Xuất bản & Bảo mật (${logs.length})`,
                },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  data-testid={`threads-tab-${tab.key}`}
                  className={`h-[38px] px-4 rounded-t-[8px] text-[12px] font-bold transition-colors border-b-2 ${
                    isActive
                      ? 'bg-[#ffffff] text-[#176b51] border-[#176b51]'
                      : 'bg-transparent text-[#81908a] border-transparent hover:text-[#17231f]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="text-[11px] text-[#81908a] pb-2 hidden lg:block">
            Bảo mật AES-256-GCM · Tự động gia hạn Token &lt; 14 ngày · Chống đăng trùng Idempotency
          </div>
        </div>

        {/* TAB 1: Hàng đợi Lịch đăng, Chuỗi Multi-post Thread & Nhãn hợp tác trả phí */}
        {activeTab === 'queue' && (
          <section className="bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] overflow-hidden">
            {/* Bộ lọc */}
            <div className="p-4 border-b border-[#e9eeeb] bg-[#fafbfa] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'all', label: `Tất cả (${posts.length})` },
                    {
                      key: 'scheduled',
                      label: `Đã lên lịch (${
                        posts.filter((p) => p.status === 'scheduled').length
                      })`,
                    },
                    {
                      key: 'published',
                      label: `Đã đăng (${
                        posts.filter((p) => p.status === 'published').length
                      })`,
                    },
                    {
                      key: 'failed',
                      label: `Lỗi (${posts.filter((p) => p.status === 'failed').length})`,
                    },
                    {
                      key: 'draft',
                      label: `Bản nháp (${posts.filter((p) => p.status === 'draft').length})`,
                    },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setPostStatusFilter(st.key)}
                    className={`h-7 px-2.5 rounded-[7px] text-[11px] font-semibold transition-colors ${
                      postStatusFilter === st.key
                        ? 'bg-[#176b51] text-[#ffffff]'
                        : 'bg-[#ffffff] border border-[#e2e9e4] text-[#516059] hover:bg-[#e9f4ef]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={postAccountFilter}
                  onChange={(e) => setPostAccountFilter(e.target.value)}
                  aria-label="Lọc theo tài khoản Threads"
                  className="h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
                >
                  <option value="all">Tất cả 20 tài khoản</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={String(acc.id)}>
                      @{acc.username || acc.display_name}
                    </option>
                  ))}
                </select>

                <select
                  value={postSponsoredFilter}
                  onChange={(e) => setPostSponsoredFilter(e.target.value)}
                  aria-label="Lọc theo nhãn hợp tác trả phí"
                  className="h-[34px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
                >
                  <option value="all">Tất cả loại bài (Sponsored & Organic)</option>
                  <option value="sponsored">Chỉ bài Hợp tác trả phí (is_sponsored)</option>
                  <option value="organic">Chỉ bài Nội dung tự nhiên (Organic)</option>
                </select>

                <input
                  type="text"
                  value={postClientRefFilter}
                  onChange={(e) => setPostClientRefFilter(e.target.value)}
                  placeholder="Lọc mã client_ref..."
                  className="h-[34px] w-[150px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] font-mono text-[11px] text-[#17231f]"
                />

                <input
                  type="search"
                  value={postSearchQuery}
                  onChange={(e) => setPostSearchQuery(e.target.value)}
                  placeholder="Tìm nội dung, topic_tag..."
                  className="h-[34px] w-[200px] px-2.5 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] text-[12px] text-[#17231f]"
                />
              </div>
            </div>

            {/* Danh sách bài đăng */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e9eeeb] bg-[#fafbfa] text-[10px] font-bold uppercase tracking-[0.8px] text-[#81908a]">
                    <th className="py-3 px-3.5">Mã bài / Chuỗi</th>
                    <th className="py-3 px-3.5">Tài khoản</th>
                    <th className="py-3 px-3.5">Nội dung xuất bản & Kiểm định</th>
                    <th className="py-3 px-3.5">Nhãn Hợp tác</th>
                    <th className="py-3 px-3.5">Lịch đăng / Chaining</th>
                    <th className="py-3 px-3.5">Trạng thái & Idempotency</th>
                    <th className="py-3 px-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9eeeb] text-[12px] text-[#17231f]">
                  {filteredPosts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[13px] text-[#81908a]">
                        Không có bài đăng nào khớp với điều kiện lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredPosts.map((post) => {
                      const badge =
                        POST_STATUS_BADGE[post.status] || POST_STATUS_BADGE.scheduled;
                      const effectiveText =
                        post.effective_text ||
                        resolveEffectiveText(
                          post.content_text || '',
                          post.is_sponsored,
                          post.sponsored_suffix
                        );
                      const charCount = countUtf8Chars(effectiveText);
                      const uniqueLinks = extractUniqueUrls(
                        effectiveText,
                        post.link_attachment
                      );
                      const isBusy = busyPostId === post.id;

                      return (
                        <tr
                          key={post.id}
                          className="hover:bg-[#f6f8f6]/70 transition-colors align-top"
                        >
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-mono font-bold text-[12px] text-[#17231f]">
                              #{post.id}
                            </div>
                            {post.reply_to_post_id || post.thread_group_key ? (
                              <div className="mt-1 inline-flex flex-col gap-0.5">
                                <span className="px-2 py-0.5 rounded bg-[#e9f4ef] text-[#176b51] font-mono text-[10px] font-semibold">
                                  Phần #{(post.reply_order || 0) + 1}
                                  {post.reply_to_post_id
                                    ? ` (Nối bài #${post.reply_to_post_id})`
                                    : ''}
                                </span>
                                {post.thread_group_key && (
                                  <span className="font-mono text-[10px] text-[#81908a]">
                                    {post.thread_group_key}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#81908a]">Bài đơn lẻ</span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-semibold text-[12px] text-[#17231f]">
                              {post.account?.display_name || `Account #${post.account_id}`}
                            </div>
                            <div className="font-mono text-[11px] text-[#176b51]">
                              @{post.account?.username || `channel_${post.account_id}`}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-[#f0f3f1] font-mono text-[10px] text-[#516059]">
                                {post.media_type}
                              </span>
                              {post.topic_tag && (
                                <span className="px-1.5 py-0.5 rounded bg-[#e9f4ef] font-mono text-[10px] text-[#176b51]">
                                  #{post.topic_tag}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3.5 max-w-[380px]">
                            <p className="text-[12px] text-[#17231f] whitespace-pre-wrap line-clamp-3">
                              {effectiveText}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#81908a]">
                              <span>{charCount}/500 ký tự UTF-8</span>
                              <span>·</span>
                              <span>{uniqueLinks.length}/5 links</span>
                              {post.link_attachment && (
                                <>
                                  <span>·</span>
                                  <span className="text-[#176b51] truncate max-w-[180px]">
                                    {post.link_attachment}
                                  </span>
                                </>
                              )}
                            </div>
                            {post.error_message && (
                              <div className="mt-1.5 p-2 rounded-[6px] bg-[#fbefed] text-[#bc5b52] font-mono text-[10px]">
                                {post.error_code ? `[${post.error_code}] ` : ''}
                                {post.error_message}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {post.is_sponsored ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[20px] bg-[#f2eff8] text-[#7e729c] text-[10px] font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#7e729c]" />
                                  Hợp tác trả phí
                                </span>
                                {post.client_ref && (
                                  <div className="font-mono text-[10px] text-[#17231f]">
                                    Ref: {post.client_ref}
                                  </div>
                                )}
                                <div className="text-[10px] text-[#81908a]">
                                  {post.sponsored_suffix
                                    ? `Hậu tố: ${post.sponsored_suffix}`
                                    : 'Giữ nguyên 100% gốc'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#81908a]">Nội dung tự nhiên</span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[11px]">
                            {post.scheduled_at ? (
                              <div>
                                <div className="text-[#17231f] font-medium">
                                  {new Date(post.scheduled_at).toLocaleString('vi-VN')}
                                </div>
                                {post.import_batch_id && (
                                  <div className="text-[10px] text-[#176b51]">
                                    Lô CSV: {post.import_batch_id}
                                  </div>
                                )}
                              </div>
                            ) : post.reply_to_post_id ? (
                              <div className="px-2 py-1 rounded bg-[#eaf5ef] text-[#28805e] font-sans text-[10px] font-semibold">
                                Auto-chain: Tự đăng 30–60s sau bài #{post.reply_to_post_id}
                              </div>
                            ) : (
                              <span className="text-[#81908a]">Chưa đặt giờ</span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[20px] text-[10px] font-semibold ${badge.badgeClass}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                              {badge.label}
                            </span>

                            <div className="mt-1 space-y-0.5 font-mono text-[10px] text-[#81908a]">
                              {post.container_id && <div>Container: {post.container_id}</div>}
                              {post.threads_media_id && (
                                <div>Media ID: {post.threads_media_id}</div>
                              )}
                              {post.retry_count > 0 && (
                                <div className="text-[#b77a21]">
                                  Retry: {post.retry_count}/3 lần
                                </div>
                              )}
                              {post.permalink && (
                                <a
                                  href={post.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#176b51] hover:underline block"
                                >
                                  Mở bài trên Threads
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {post.status !== 'published' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handlePublishNow(post)}
                                  className="h-7 px-2.5 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[10px] font-semibold transition-colors"
                                >
                                  Đăng ngay
                                </button>
                              )}
                              {post.status === 'failed' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleRetryPost(post)}
                                  className="h-7 px-2.5 rounded-[7px] bg-[#faf3e7] border border-[#b77a21] text-[#b77a21] text-[10px] font-semibold"
                                >
                                  Thử lại (Idempotent)
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDeletePost(post)}
                                className="h-7 px-2 rounded-[7px] bg-[#ffffff] border border-[#e2e9e4] hover:border-[#bc5b52] hover:text-[#bc5b52] text-[#516059] text-[10px] font-semibold"
                              >
                                Xóa
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
          </section>
        )}

        {/* TAB 2: Quản lý 20 Tài khoản & OAuth 60 ngày */}
        {activeTab === 'accounts' && (
          <ThreadsAccountTable
            accounts={accounts}
            statusFilter={accountStatusFilter}
            onStatusFilterChange={setAccountStatusFilter}
            onCreateAccount={handleCreateAccount}
            onUpdateAccount={handleUpdateAccount}
            onToggleStatus={handleToggleAccountStatus}
            onRefreshToken={handleRefreshAccountToken}
            onRequestOAuthUrl={handleRequestOAuthUrl}
            onSelectAccountForComposer={(acc) => {
              setComposerDefaultAccountId(acc.id);
              setIsComposerOpen(true);
            }}
          />
        )}

        {/* TAB 3: Trung tâm Nhập CSV 100+ Bài & Thuật toán Random Jitter */}
        {activeTab === 'csv_scheduler' && (
          <section className="bg-[#ffffff] border border-[#e9eeeb] rounded-[10px] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e9eeeb] pb-4">
              <div>
                <h2 className="font-heading text-[17px] font-bold text-[#17231f]">
                  Trung tâm Nhập Hàng Loạt CSV (100+ Bài) & Bộ Chia Lịch Random Jitter
                </h2>
                <p className="text-[12px] text-[#81908a] mt-0.5">
                  Tự động kiểm định giới hạn 500 ký tự UTF-8, tối đa 5 unique links, chống trùng lặp content_hash và phân bổ lịch đăng tự nhiên cho 20 tài khoản.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleQuickDownload100Csv}
                  className="h-[34px] px-3.5 rounded-[7px] bg-[#ffffff] border border-[#176b51] text-[#176b51] hover:bg-[#e9f4ef] text-[12px] font-semibold inline-flex items-center gap-1.5"
                >
                  <Icon name="download" size={14} />
                  <span>Tải file CSV mẫu 100 bài</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(true)}
                  className="h-[34px] px-4 rounded-[7px] bg-[#176b51] text-[#ffffff] hover:bg-[#10583f] text-[12px] font-semibold"
                >
                  Mở Trình Nhập CSV & Phân Bổ Lịch
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-[10px] bg-[#f6f8f6] border border-[#e9eeeb]">
                <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#176b51]">
                  Nguyên tắc 1 · Kiểm định nghiêm ngặt
                </div>
                <h3 className="font-heading text-[14px] font-bold text-[#17231f] mt-1">
                  ThreadsPostValidator (&lt;= 500 ký tự &amp; &lt;= 5 links)
                </h3>
                <p className="text-[12px] text-[#516059] mt-1.5 leading-relaxed">
                  Mọi dòng trong file CSV được tính văn bản thực tế qua hàm resolveEffectiveText, chặn
                  lập tức nếu vượt 500 ký tự UTF-8, vượt quá 5 liên kết HTTP/HTTPS duy nhất hoặc trùng
                  lặp mã băm SHA-256 content_hash trong 24 giờ.
                </p>
              </div>

              <div className="p-4 rounded-[10px] bg-[#f6f8f6] border border-[#e9eeeb]">
                <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#176b51]">
                  Nguyên tắc 2 · Phân bổ lịch tự nhiên
                </div>
                <h3 className="font-heading text-[14px] font-bold text-[#17231f] mt-1">
                  Random Jitter (±3..12 phút) &amp; Lệch pha 20 Kênh
                </h3>
                <p className="text-[12px] text-[#516059] mt-1.5 leading-relaxed">
                  Các bài gốc để trống scheduled_at được chia đều vào khung giờ hoạt động của từng tài
                  khoản (mặc định 08:00 – 22:00, tối đa daily_post_cap bài/ngày) cộng độ lệch ngẫu
                  nhiên để 20 tài khoản không bao giờ đăng bài cùng một giây.
                </p>
              </div>

              <div className="p-4 rounded-[10px] bg-[#f6f8f6] border border-[#e9eeeb]">
                <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#176b51]">
                  Nguyên tắc 3 · Chuỗi bài &amp; Hợp tác Trả phí
                </div>
                <h3 className="font-heading text-[14px] font-bold text-[#17231f] mt-1">
                  Flexible Multi-post Thread &amp; is_sponsored
                </h3>
                <p className="text-[12px] text-[#516059] mt-1.5 leading-relaxed">
                  Hỗ trợ gom nhóm chuỗi bài qua cột thread_group_key + reply_order (tự động nối tiếp
                  30–60s khi bài con để trống scheduled_at) và giữ nguyên 100% nội dung gốc khi
                  sponsored_suffix để trống.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: Nhật ký Xuất bản & Bảo mật Token */}
        {activeTab === 'logs' && (
          <ThreadsPublishLogsDrawer
            isOpen={true}
            onClose={() => setActiveTab('queue')}
            logs={logs}
            inlineMode={true}
            onRefreshLogs={loadAllWorkspaceData}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <ThreadsPostComposerModal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        accounts={accounts}
        defaultAccountId={composerDefaultAccountId}
        onSubmitPost={handleCreatePost}
      />

      <ThreadsCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportCsv={handleImportCsv}
      />

      <ThreadsPublishLogsDrawer
        isOpen={isLogsDrawerOpen}
        onClose={() => setIsLogsDrawerOpen(false)}
        logs={logs}
        onRefreshLogs={loadAllWorkspaceData}
      />
    </div>
  );
}
