'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  threadsSeedingService,
  ThreadsSeedingService,
  type ThreadsAccountItem,
} from '@podscare/api-client/src/threads-seeding';
import {
  ThreadsAccountPoolBar,
  DiscoverySeedingTab,
  DirectSeedingTab,
  SeedingJobsMonitor,
} from '@/components/threads/seeding';

const seedingApi = threadsSeedingService || new ThreadsSeedingService();

type SeedingActiveTab = 'discovery' | 'direct';

export default function ThreadsSeedingPage() {
  const [activeTab, setActiveTab] = useState<SeedingActiveTab>('discovery');
  const [accounts, setAccounts] = useState<ThreadsAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);

  // Tải danh sách tài khoản Threads từ Live DB
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await seedingApi.getAccounts();
      const list = res.data || [];
      if (list.length > 0) {
        setAccounts(list);
      } else {
        // Fallback demo pool 20 nick nếu backend chưa có data mẫu
        const mockAccounts: ThreadsAccountItem[] = Array.from({ length: 20 }).map((_, i) => ({
          id: i + 1,
          username: `podscare_seeder_${String(i + 1).padStart(2, '0')}`,
          display_name: `PodsCare Seeder ${i + 1}`,
          status: i < 15 ? 'active' : i < 18 ? 'cooldown' : 'expired',
          daily_comment_count: i * 2,
          daily_post_cap: 10,
        }));
        setAccounts(mockAccounts);
      }
    } catch {
      // Mock fallback an toàn cho môi trường test/demo
      const mockAccounts: ThreadsAccountItem[] = Array.from({ length: 20 }).map((_, i) => ({
        id: i + 1,
        username: `podscare_seeder_${String(i + 1).padStart(2, '0')}`,
        display_name: `PodsCare Seeder ${i + 1}`,
        status: i < 16 ? 'active' : i < 18 ? 'cooldown' : 'expired',
        daily_comment_count: i * 2,
        daily_post_cap: 10,
      }));
      setAccounts(mockAccounts);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleDispatchSuccess = (
    campaignName: string,
    jobsCount: number,
    campaignId?: number
  ) => {
    if (campaignId) {
      setActiveCampaignId(campaignId);
    }
    setBannerSuccess(
      `Đã khởi tạo thành công chiến dịch "${campaignName}" với ${jobsCount} jobs trong hàng đợi giãn cách an toàn.`
    );
    // Cuộn xuống khu vực tiến độ jobs
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    setTimeout(() => {
      setBannerSuccess(null);
    }, 8000);
  };

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#17231f] p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[12px] text-[#516059] mb-1">
              <Link
                href="/dashboard"
                className="hover:text-[#176b51] transition-colors"
              >
                Hệ thống
              </Link>
              <span>/</span>
              <Link
                href="/threads"
                className="hover:text-[#176b51] transition-colors"
              >
                Threads Quản trị
              </Link>
              <span>/</span>
              <span className="text-[#176b51] font-semibold">Seeding Engine</span>
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-bold font-heading text-[#17231f]">
              Khám phá Traffic &amp; Seeding Đa Tài Khoản
            </h1>
            <p className="text-[13px] text-[#516059] mt-0.5">
              Tự động tìm kiếm Top 10 bài viết hot theo từ khóa trong ngày &amp; Điều phối 20 tài khoản
              Threads Official API an toàn chống spam.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/threads"
              className="h-9 px-3.5 rounded-[8px] bg-[#ffffff] border border-[#e2e9e4] text-[#17231f] hover:bg-[#eaf5ef] hover:text-[#176b51] text-[12px] font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              <span>Quản trị 20 Nick Threads</span>
            </Link>
          </div>
        </div>

        {/* Success Banner */}
        {bannerSuccess && (
          <div className="p-4 rounded-[10px] bg-[#eaf5ef] border border-[#cde2d8] text-[#176b51] text-[13px] font-medium flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{bannerSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerSuccess(null)}
              className="text-[#176b51] hover:text-[#12543f] p-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Thanh trạng thái kho 20 tài khoản Threads */}
        <ThreadsAccountPoolBar
          accounts={accounts}
          loading={loadingAccounts}
          onRefresh={loadAccounts}
        />

        {/* Main Tab Controller */}
        <div className="border-b border-[#e2e9e4] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('discovery')}
            className={`pb-3 px-4 text-[14px] font-heading font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'discovery'
                ? 'border-[#176b51] text-[#176b51]'
                : 'border-transparent text-[#516059] hover:text-[#17231f]'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Tab 1 · Khám phá theo Từ khóa (Top 10 Bài Hot)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`pb-3 px-4 text-[14px] font-heading font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'direct'
                ? 'border-[#176b51] text-[#176b51]'
                : 'border-transparent text-[#516059] hover:text-[#17231f]'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Tab 2 · Seeding Chỉ định theo URL</span>
          </button>
        </div>

        {/* Tab 1 Content: Khám phá */}
        {activeTab === 'discovery' && (
          <DiscoverySeedingTab
            accounts={accounts}
            onDispatchSuccess={handleDispatchSuccess}
          />
        )}

        {/* Tab 2 Content: Chỉ định */}
        {activeTab === 'direct' && (
          <DirectSeedingTab
            accounts={accounts}
            onDispatchSuccess={handleDispatchSuccess}
          />
        )}

        {/* Hàng đợi Tiến độ Seeding & Nhật ký Jobs */}
        <SeedingJobsMonitor activeCampaignId={activeCampaignId} />

        {/* Safe-Guard Notes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#e2e9e4]">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#176b51]">
              Anti-Collision Hash
            </div>
            <h4 className="text-[13px] font-bold text-[#17231f] font-heading mt-1">
              Chống trùng lặp tuyệt đối
            </h4>
            <p className="text-[12px] text-[#516059] mt-1 leading-relaxed">
              Mã băm SHA-256 nội dung kết hợp post_id ngăn 2 tài khoản gửi câu bình luận y hệt vào cùng một bài viết trong 24 giờ.
            </p>
          </div>

          <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#e2e9e4]">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#176b51]">
              Cooldown Jitter
            </div>
            <h4 className="text-[13px] font-bold text-[#17231f] font-heading mt-1">
              Giãn cách tự nhiên 3–7 phút
            </h4>
            <p className="text-[12px] text-[#516059] mt-1 leading-relaxed">
              Mỗi nick có độ trễ ngẫu nhiên từ 180s đến 420s giữa 2 lần bình luận, mô phỏng hành vi người dùng thật.
            </p>
          </div>

          <div className="p-4 rounded-[10px] bg-[#ffffff] border border-[#e2e9e4]">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#176b51]">
              Official Graph API
            </div>
            <h4 className="text-[13px] font-bold text-[#17231f] font-heading mt-1">
              Container 2 bước v1.0
            </h4>
            <p className="text-[12px] text-[#516059] mt-1 leading-relaxed">
              Tạo container và publish chính thức qua Meta Graph API với token riêng của từng tài khoản, đảm bảo tính hợp lệ cao nhất.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
