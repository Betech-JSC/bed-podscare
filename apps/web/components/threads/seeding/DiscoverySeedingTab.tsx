'use client';

import React, { useState } from 'react';
import type {
  ThreadsTargetPost,
  ThreadsSeedingStrategy,
  ThreadsDispatchDiscoveryRequest,
} from '@podscare/types';
import {
  threadsSeedingService,
  ThreadsSeedingService,
  type ThreadsAccountItem,
} from '@podscare/api-client/src/threads-seeding';
import { StrategySelector } from './StrategySelector';

const seedingApi = threadsSeedingService || new ThreadsSeedingService();

interface DiscoverySeedingTabProps {
  accounts: ThreadsAccountItem[];
  onDispatchSuccess: (campaignName: string, jobsCount: number, campaignId?: number) => void;
}

export const DiscoverySeedingTab: React.FC<DiscoverySeedingTabProps> = ({
  accounts,
  onDispatchSuccess,
}) => {
  // Discovery Search State
  const [keyword, setKeyword] = useState<string>('airpods pro');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<ThreadsTargetPost[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string>('');

  // Selected Target Posts
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  // Dispatch Form State
  const [campaignName, setCampaignName] = useState<string>('');
  const [contentTemplate, setContentTemplate] = useState<string>(
    'Bên em có sẵn linh kiện chính hãng và bảo hành 3 tháng cho dòng này, bác cần kiểm tra có thể mang qua bên em hỗ trợ trực tiếp nhé!'
  );
  const [strategy, setStrategy] = useState<ThreadsSeedingStrategy>('round_robin');
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Ký tự đếm (Hệ thống Seeding hỗ trợ tối đa 1000 ký tự theo API backend)
  const charCount = contentTemplate.length;
  const isOverCharLimit = charCount > 1000;

  // Thực hiện tìm kiếm 10 bài hot
  const handleDiscover = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const res: any = await seedingApi.discover(keyword.trim(), 10);
      const posts: ThreadsTargetPost[] = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.data)
          ? res.data.data
          : [];
      setSearchResults(posts);
      setSearchedKeyword(keyword.trim());
      // Mặc định chọn tất cả các bài tìm được
      setSelectedPostIds(posts.map((p) => p.post_id));
      if (!campaignName) {
        const now = new Date();
        const timeStr = `${now.getHours()}h${now.getMinutes()}_${now.getDate()}-${now.getMonth() + 1}`;
        setCampaignName(`Seeding_${keyword.trim().replace(/\s+/g, '_')}_${timeStr}`);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : 'Không thể khám phá bài viết từ Threads. Vui lòng thử lại sau.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle chọn bài viết
  const handleTogglePost = (postId: string) => {
    setSelectedPostIds((prev) =>
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    );
  };

  // Chọn tất cả / Bỏ chọn tất cả
  const handleSelectAllPosts = () => {
    if (selectedPostIds.length === searchResults.length) {
      setSelectedPostIds([]);
    } else {
      setSelectedPostIds(searchResults.map((p) => p.post_id));
    }
  };

  // Toggle chọn tài khoản khi dùng strategy manual
  const handleToggleAccount = (accId: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  // Gửi lệnh điều phối Seeding
  const handleDispatch = async () => {
    const selectedPosts = searchResults.filter((p) => selectedPostIds.includes(p.post_id));
    if (selectedPosts.length === 0) {
      setSubmitError('Vui lòng chọn ít nhất 1 bài viết Threads mục tiêu để seeding.');
      return;
    }
    if (!contentTemplate.trim()) {
      setSubmitError('Nội dung bình luận soạn sẵn không được để trống.');
      return;
    }
    if (isOverCharLimit) {
      setSubmitError('Nội dung bình luận vượt quá giới hạn 1000 ký tự của hệ thống Seeding.');
      return;
    }
    if (strategy === 'manual' && selectedAccountIds.length === 0) {
      setSubmitError('Vui lòng tick chọn ít nhất 1 tài khoản Threads để thực thi.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const payload: ThreadsDispatchDiscoveryRequest = {
      name: campaignName.trim() || `Discovery Seeding ${new Date().toLocaleTimeString()}`,
      keyword: searchedKeyword || keyword.trim(),
      selected_posts: selectedPosts,
      content_template: contentTemplate.trim(),
      dispatch_strategy: strategy,
      account_ids: strategy === 'manual' ? selectedAccountIds : undefined,
      cooldown_min_seconds: 180,
      cooldown_max_seconds: 420,
    };

    try {
      const res: any = await seedingApi.dispatchDiscovery(payload);
      const data = res?.campaign ? res : res?.data || res;
      onDispatchSuccess(payload.name, data?.jobs_count || selectedPosts.length, data?.campaign?.id);
    } catch (err: any) {
      const apiMsg =
        err?.data?.message ||
        (err?.data?.errors ? Object.values(err.data.errors).flat().join(' ') : null);
      setSubmitError(
        apiMsg ||
          (err instanceof Error
            ? err.message
            : 'Lỗi khi kích hoạt chiến dịch seeding. Vui lòng kiểm tra lại kết nối backend.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Thanh tìm kiếm từ khóa ngách */}
      <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-5 shadow-sm">
        <div className="max-w-3xl">
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
            Bước 1 · Quét thị trường 24h
          </span>
          <h2 className="text-[18px] font-bold font-heading text-[#17231f] mt-1">
            Khám phá 10 bài viết có tương tác cao nhất theo từ khóa
          </h2>
          <p className="text-[13px] text-[#516059] mt-1 leading-relaxed">
            Thuật toán tự động tìm kiếm các bài viết công khai trên Threads trong 24 giờ qua và
            xếp hạng dựa trên Velocity Score: (Replies × 3) + (Likes × 1) + (Reposts × 2).
          </p>

          <form onSubmit={handleDiscover} className="mt-4 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Nhập từ khóa (ví dụ: airpods pro, thay pin airpods, sửa bản lề...)"
                disabled={isSearching}
                className="w-full h-11 pl-4 pr-10 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] text-[13px] text-[#17231f] focus:bg-[#ffffff] focus:border-[#176b51] focus:ring-2 focus:ring-[#176b51]/15 transition-all outline-none font-medium"
              />
              <span className="absolute right-3 top-3 text-[#77847e]">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
            </div>

            <button
              type="submit"
              disabled={isSearching || !keyword.trim()}
              className="h-11 px-5 rounded-[8px] bg-[#176b51] hover:bg-[#12543f] text-[#ffffff] font-semibold text-[13px] transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {isSearching ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>Đang quét Threads...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Quét 10 Bài Hot Nhất</span>
                </>
              )}
            </button>
          </form>

          {searchError && (
            <div className="mt-3 p-3 rounded-[8px] bg-[#fbefed] border border-[#f3d0cb] text-[12px] text-[#bc5b52] flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{searchError}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Bảng 10 Bài Hot */}
      {searchResults.length > 0 && (
        <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] overflow-hidden shadow-sm">
          <div className="p-4 bg-[#fafbfa] border-b border-[#e9eeeb] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
                  Bước 2 · Tuyển chọn mục tiêu
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[5px] bg-[#eaf5ef] text-[#176b51]">
                  Từ khóa: &quot;{searchedKeyword}&quot;
                </span>
              </div>
              <h3 className="text-[15px] font-bold font-heading text-[#17231f] mt-0.5">
                Top {searchResults.length} Bài Viết Có Velocity Score Cao Nhất (24h)
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#516059]">
                Đã chọn <strong className="text-[#176b51]">{selectedPostIds.length}</strong> / {searchResults.length} bài
              </span>
              <button
                type="button"
                onClick={handleSelectAllPosts}
                className="h-8 px-3 rounded-[6px] bg-[#ffffff] border border-[#e2e9e4] hover:bg-[#eaf5ef] text-[12px] font-semibold text-[#17231f] transition-colors"
              >
                {selectedPostIds.length === searchResults.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e9eeeb] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-[0.6px] text-[#81908a]">
                  <th className="py-3 px-4 w-12 text-center">Chọn</th>
                  <th className="py-3 px-4">Bài viết &amp; Tác giả</th>
                  <th className="py-3 px-4 text-center">Bình luận</th>
                  <th className="py-3 px-4 text-center">Thích</th>
                  <th className="py-3 px-4 text-center">Reposts</th>
                  <th className="py-3 px-4 text-right">Velocity Score</th>
                  <th className="py-3 px-4 text-center">Link Threads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9eeeb] text-[13px]">
                {searchResults.map((post, idx) => {
                  const isSelected = selectedPostIds.includes(post.post_id);
                  return (
                    <tr
                      key={post.post_id || idx}
                      onClick={() => handleTogglePost(post.post_id)}
                      className={`hover:bg-[#fafbfa] transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#f4f9f6]' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleTogglePost(post.post_id)}
                          aria-label={`Chọn bài viết ${post.post_id}`}
                          className="w-4 h-4 rounded text-[#176b51] focus:ring-[#176b51] border-[#cde2d8] cursor-pointer"
                        />
                      </td>

                      {/* Content & Author */}
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-[#17231f] text-[13px]">
                            @{post.author_username || 'nguoi_dung'}
                          </span>
                          <span className="text-[11px] text-[#77847e]">
                            {post.published_at ? new Date(post.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '24h qua'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f0f4f2] text-[#516059]">
                            #{idx + 1}
                          </span>
                        </div>
                        <p className="text-[12px] text-[#516059] line-clamp-2 leading-relaxed">
                          {post.caption || 'Bài viết không có trích dẫn văn bản.'}
                        </p>
                      </td>

                      {/* Metrics */}
                      <td className="py-3.5 px-4 text-center font-mono text-[12px] text-[#17231f]">
                        {post.metrics?.replies ?? 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-[12px] text-[#17231f]">
                        {post.metrics?.likes ?? 0}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-[12px] text-[#17231f]">
                        {post.metrics?.reposts ?? 0}
                      </td>

                      {/* Velocity Score */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-[6px] bg-[#eaf5ef] text-[#176b51] font-mono font-bold text-[13px]">
                          {post.velocity_score.toLocaleString()}
                        </span>
                      </td>

                      {/* Link */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={post.permalink || `https://www.threads.net/post/${post.post_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] text-[#516059] hover:text-[#176b51] hover:bg-[#eaf5ef] transition-colors"
                          title="Mở bài viết trên Threads"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Vùng Soạn thảo & Điều phối Seeding */}
      {searchResults.length > 0 && (
        <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-5 shadow-sm space-y-5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#176b51]">
              Bước 3 · Cấu hình điều phối
            </span>
            <h3 className="text-[16px] font-bold font-heading text-[#17231f] mt-0.5">
              Soạn thảo nội dung bình luận &amp; Chiến lược phân bổ 20 nick
            </h3>
          </div>

          {/* Tên chiến dịch */}
          <div>
            <label className="block text-[12px] font-bold text-[#17231f] mb-1">
              Tên Chiến dịch Seeding
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Nhập tên chiến dịch quản lý..."
              className="w-full h-10 px-3.5 rounded-[8px] bg-[#fafbfa] border border-[#e2e9e4] text-[13px] text-[#17231f] focus:bg-[#ffffff] focus:border-[#176b51] outline-none"
            />
          </div>

          {/* Ô nhập nội dung soạn sẵn */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-[#17231f]">
                Nội dung bình luận soạn sẵn (Dùng cho các bài đã chọn)
              </label>
              <span
                className={`text-[11px] font-mono font-semibold ${
                  isOverCharLimit ? 'text-[#bc5b52]' : 'text-[#516059]'
                }`}
              >
                {charCount} / 1000 ký tự
              </span>
            </div>
            <textarea
              rows={4}
              value={contentTemplate}
              onChange={(e) => setContentTemplate(e.target.value)}
              placeholder="Nhập nội dung bạn muốn 20 tài khoản đăng phản hồi vào các bài hot..."
              className={`w-full p-3.5 rounded-[8px] bg-[#fafbfa] border text-[13px] text-[#17231f] leading-relaxed outline-none focus:bg-[#ffffff] ${
                isOverCharLimit
                  ? 'border-[#bc5b52] focus:border-[#bc5b52]'
                  : 'border-[#e2e9e4] focus:border-[#176b51]'
              }`}
            />
            <p className="text-[11px] text-[#77847e] mt-1 leading-relaxed">
              * Khuyến nghị viết tự nhiên, ngắn gọn và hữu ích. Hệ thống sẽ tự động băm SHA-256 mã nội dung để chống dẫm chân trùng lặp trên cùng 1 bài.
            </p>
          </div>

          {/* Bộ chọn Chiến lược */}
          <StrategySelector value={strategy} onChange={setStrategy} />

          {/* Manual Account Checklist nếu chọn manual */}
          {strategy === 'manual' && (
            <div className="p-4 rounded-[10px] bg-[#fafbfa] border border-[#e2e9e4] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#17231f]">
                  Tick chọn các nick tham gia seeding đợt này:
                </span>
                <span className="text-[11px] text-[#176b51] font-semibold">
                  Đã chọn {selectedAccountIds.length} / {accounts.length} nick
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {accounts.map((acc) => {
                  const isChecked = selectedAccountIds.includes(acc.id);
                  const isAvailable = acc.status === 'active';
                  return (
                    <label
                      key={acc.id}
                      className={`flex items-center gap-2 p-2 rounded-[6px] border text-[12px] cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[#ffffff] border-[#176b51] text-[#176b51] font-semibold'
                          : 'bg-[#fafbfa] border-[#e9eeeb] text-[#516059]'
                      } ${!isAvailable ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isAvailable}
                        onChange={() => handleToggleAccount(acc.id)}
                        className="w-3.5 h-3.5 rounded text-[#176b51] focus:ring-[#176b51]"
                      />
                      <span className="truncate">@{acc.username || acc.display_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="p-3 rounded-[8px] bg-[#fbefed] border border-[#f3d0cb] text-[12px] text-[#bc5b52] flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{submitError}</span>
            </div>
          )}

          {/* Nút Submit */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#e9eeeb]">
            <div className="text-[12px] text-[#516059]">
              Hàng đợi sẽ tự động kích hoạt giãn cách ngẫu nhiên <strong>180s – 420s</strong> giữa các lượt bình luận.
            </div>

            <button
              type="button"
              onClick={handleDispatch}
              disabled={isSubmitting || selectedPostIds.length === 0 || isOverCharLimit}
              className="w-full sm:w-auto h-11 px-6 rounded-[8px] bg-[#176b51] hover:bg-[#12543f] text-[#ffffff] font-bold text-[13px] font-heading transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>Đang khởi tạo Hàng đợi Seeding...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Xác nhận điều phối Seeding ({selectedPostIds.length} bài)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
