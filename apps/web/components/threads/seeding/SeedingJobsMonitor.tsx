'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ThreadsSeedingCampaign, ThreadsSeedingJob } from '@podscare/types';
import {
  threadsSeedingService,
  ThreadsSeedingService,
} from '@podscare/api-client/src/threads-seeding';

const seedingApi = threadsSeedingService || new ThreadsSeedingService();

interface SeedingJobsMonitorProps {
  onSelectCampaign?: (campaign: ThreadsSeedingCampaign) => void;
  activeCampaignId?: number | null;
}

export const SeedingJobsMonitor: React.FC<SeedingJobsMonitorProps> = ({
  activeCampaignId,
}) => {
  const [campaigns, setCampaigns] = useState<ThreadsSeedingCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] =
    useState<ThreadsSeedingCampaign | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Tải danh sách chiến dịch
  const loadCampaigns = useCallback(async () => {
    try {
      setError(null);
      const res: any = await seedingApi?.getCampaigns?.({ per_page: 20 });
      const raw = res?.data;
      let items: ThreadsSeedingCampaign[] = [];
      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw && Array.isArray(raw.data)) {
        items = raw.data;
      }
      setCampaigns(items);
      if (items.length > 0 && !selectedCampaign) {
        setSelectedCampaign(items[0]);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setCampaigns([]);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Không thể đồng bộ danh sách chiến dịch Seeding.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCampaign]);

  // Tải chi tiết 1 chiến dịch khi được chọn
  const loadCampaignDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const detail: any = await seedingApi?.getCampaignDetail?.(id);
      const camp = detail?.data && detail.data.id ? detail.data : detail;
      if (camp && camp.id) {
        setSelectedCampaign(camp);
      }
    } catch {
      // Giữ nguyên nếu lỗi
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Chọn campaign từ props nếu có
  useEffect(() => {
    if (activeCampaignId) {
      loadCampaignDetail(activeCampaignId);
    }
  }, [activeCampaignId, loadCampaignDetail]);

  // Auto polling mỗi 12 giây nếu bật
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadCampaigns();
      if (selectedCampaign?.id) {
        loadCampaignDetail(selectedCampaign.id);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadCampaigns, selectedCampaign?.id, loadCampaignDetail]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
      case 'completed':
        return {
          label: 'Đã hoàn tất',
          cls: 'bg-[#eaf5ef] text-[#176b51]',
        };
      case 'processing':
        return {
          label: 'Đang xử lý',
          cls: 'bg-[#faf3e7] text-[#b77a21]',
        };
      case 'failed':
        return {
          label: 'Lỗi',
          cls: 'bg-[#fbefed] text-[#bc5b52]',
        };
      case 'skipped':
        return {
          label: 'Anti-Collision (Bỏ qua)',
          cls: 'bg-[#f0f3f1] text-[#77847e]',
        };
      case 'queued':
      default:
        return {
          label: 'Đang chờ hàng đợi',
          cls: 'bg-[#edf4f8] text-[#4778a4]',
        };
    }
  };

  return (
    <div className="bg-[#ffffff] border border-[#e2e9e4] rounded-[12px] p-5 shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#e9eeeb]">
        <div>
          <h3 className="text-[15px] font-bold font-heading text-[#17231f] flex items-center gap-2">
            <span>Tiến độ Hàng đợi Seeding &amp; Nhật ký Jobs</span>
            <span className="w-2 h-2 rounded-full bg-[#176b51] animate-pulse" />
          </h3>
          <p className="text-[12px] text-[#516059]">
            Giám sát thời gian thực các bình luận được đẩy lên Meta Threads Graph API
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-[#516059] cursor-pointer mr-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-[#176b51] focus:ring-[#176b51]"
            />
            <span>Tự động làm mới (12s)</span>
          </label>

          <button
            type="button"
            onClick={() => {
              loadCampaigns();
              if (selectedCampaign?.id) loadCampaignDetail(selectedCampaign.id);
            }}
            disabled={loading || detailLoading}
            className="h-8 px-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e2e9e4] text-[#17231f] hover:bg-[#eaf5ef] text-[12px] font-semibold transition-colors flex items-center gap-1.5"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading || detailLoading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-[8px] bg-[#fbefed] border border-[#f3d0cb] text-[12px] text-[#bc5b52]">
          {error}
        </div>
      )}

      {(!Array.isArray(campaigns) || campaigns.length === 0) && !loading ? (
        <div className="text-center py-10 bg-[#fafbfa] rounded-[8px] border border-dashed border-[#e2e9e4]">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#eaf5ef] text-[#176b51] flex items-center justify-center mb-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-[13px] font-bold text-[#17231f]">Chưa có chiến dịch Seeding nào</p>
          <p className="text-[12px] text-[#516059] mt-0.5">
            Hãy bắt đầu bằng cách tìm kiếm bài hot ở Tab 1 hoặc dán link ở Tab 2.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Cột trái: Danh sách chiến dịch */}
          <div className="lg:col-span-1 space-y-2 max-h-[420px] overflow-y-auto pr-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#516059] px-1">
              Chiến dịch gần đây ({Array.isArray(campaigns) ? campaigns.length : 0})
            </div>

            {(Array.isArray(campaigns) ? campaigns : []).map((camp) => {
              const isSelected = selectedCampaign?.id === camp.id;
              const completedPercent =
                camp.total_jobs > 0
                  ? Math.round((camp.completed_jobs / camp.total_jobs) * 100)
                  : 0;

              return (
                <div
                  key={camp.id}
                  onClick={() => {
                    setSelectedCampaign(camp);
                    loadCampaignDetail(camp.id);
                  }}
                  className={`p-3 rounded-[8px] border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#ffffff] border-[#176b51] ring-1 ring-[#176b51] shadow-xs'
                      : 'bg-[#fafbfa] border-[#e2e9e4] hover:bg-[#ffffff]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-[#17231f] truncate font-heading">
                      {camp.name}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-[4px] uppercase ${
                        getStatusBadge(camp.status).cls
                      }`}
                    >
                      {getStatusBadge(camp.status).label}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#516059] flex items-center justify-between mt-1.5">
                    <span>
                      Loại: <strong className="text-[#17231f]">{camp.type === 'discovery' ? 'Khám phá' : 'Chỉ định'}</strong>
                    </span>
                    <span className="font-mono">
                      {camp.completed_jobs}/{camp.total_jobs} jobs ({completedPercent}%)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-[#e9eeeb] rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-[#176b51] rounded-full transition-all duration-300"
                      style={{ width: `${completedPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cột phải: Chi tiết các Jobs của chiến dịch được chọn */}
          <div className="lg:col-span-2 border border-[#e2e9e4] rounded-[10px] overflow-hidden flex flex-col">
            <div className="p-3 bg-[#fafbfa] border-b border-[#e9eeeb] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#176b51]">
                  Chi tiết Jobs thực thi
                </span>
                <h4 className="text-[13px] font-bold text-[#17231f] font-heading">
                  {selectedCampaign?.name || 'Vui lòng chọn 1 chiến dịch'}
                </h4>
              </div>

              {selectedCampaign && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#176b51] font-semibold">
                    Thành công: {selectedCampaign.completed_jobs}
                  </span>
                  {selectedCampaign.failed_jobs > 0 && (
                    <span className="text-[#bc5b52] font-semibold">
                      · Lỗi: {selectedCampaign.failed_jobs}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-[#e9eeeb]">
              {selectedCampaign?.jobs && selectedCampaign.jobs.length > 0 ? (
                selectedCampaign.jobs.map((job: ThreadsSeedingJob) => {
                  const badge = getStatusBadge(job.status);
                  return (
                    <div key={job.id} className="p-3 hover:bg-[#fafbfa] transition-colors text-[12px]">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#176b51] bg-[#eaf5ef] px-2 py-0.5 rounded-[4px]">
                            @{job.account?.username || `Nick #${job.account_id}`}
                          </span>
                          <span className="text-[#516059] font-mono text-[11px]">
                            Job #{job.id}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded-[4px] uppercase ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-[12px] text-[#17231f] bg-[#f9fbf9] p-2 rounded-[6px] border border-[#eef2ef] my-1.5 leading-relaxed font-sans">
                        &quot;{job.reply_text}&quot;
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#516059]">
                        <span className="truncate max-w-xs font-mono">
                          Mục tiêu: {job.target_post_url || `Post ID: ${job.target_post_id}`}
                        </span>

                        <div className="flex items-center gap-3">
                          {job.scheduled_at && (
                            <span>
                              Lên lịch: {new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}

                          {job.permalink ? (
                            <a
                              href={job.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#176b51] hover:underline font-semibold flex items-center gap-1"
                            >
                              <span>Xem comment</span>
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          ) : job.threads_media_id ? (
                            <span className="font-mono text-[#176b51]">
                              Media ID: {job.threads_media_id}
                            </span>
                          ) : null}

                          {job.error_message && (
                            <span className="text-[#bc5b52] truncate max-w-xs" title={job.error_message}>
                              Lỗi: {job.error_message}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-[#77847e] text-[12px]">
                  {detailLoading ? 'Đang tải chi tiết jobs...' : 'Chưa có jobs nào trong chiến dịch này.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
