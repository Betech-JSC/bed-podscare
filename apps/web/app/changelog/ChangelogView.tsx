'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Icon,
  StatusTag,
  sanitizeInputLive,
} from '@podscare/ui';
import { useOptionalPodsCare } from '../providers';
import {
  CHANGELOG_CATEGORY_LABELS,
  CHANGELOG_RELEASES,
  CURRENT_APP_VERSION,
  PRODUCT_ROADMAP_ITEMS,
  ROADMAP_STATUS_META,
  ROADMAP_STATUS_ORDER,
  filterChangelogReleases,
  getRoadmapByStatus,
  type ChangelogCategory,
  type RoadmapStatus,
} from './changelogData';
import { markChangelogVersionSeen } from '../components/onboarding/onboardingStorage';
import {
  normalizeOnboardingRole,
  resolveOnboardingTenantId,
} from '../components/onboarding/types';

export type ChangelogActiveTab = 'releases' | 'roadmap';

export interface ChangelogViewProps {
  initialTab?: ChangelogActiveTab;
}

const CATEGORY_FILTER_OPTIONS: Array<{
  key: 'all' | ChangelogCategory;
  label: string;
}> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'feature', label: CHANGELOG_CATEGORY_LABELS.feature },
  { key: 'improvement', label: CHANGELOG_CATEGORY_LABELS.improvement },
  { key: 'security', label: CHANGELOG_CATEGORY_LABELS.security },
];

function getCategoryTagProps(category: ChangelogCategory): {
  label: string;
  type: 'ready' | 'progress' | 'wait';
} {
  if (category === 'feature') {
    return {
      label: CHANGELOG_CATEGORY_LABELS.feature,
      type: 'ready',
    };
  }
  if (category === 'improvement') {
    return {
      label: CHANGELOG_CATEGORY_LABELS.improvement,
      type: 'progress',
    };
  }
  return {
    label: CHANGELOG_CATEGORY_LABELS.security,
    type: 'wait',
  };
}

export const ChangelogView: React.FC<ChangelogViewProps> = ({
  initialTab = 'releases',
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const podsCare = useOptionalPodsCare();

  const isAuthenticated = Boolean(podsCare?.isAuthenticated);
  const currentUser = podsCare?.currentUser ?? null;

  const [activeTab, setActiveTab] = useState<ChangelogActiveTab>(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'roadmap') {
      return 'roadmap';
    }
    return initialTab;
  });

  const [selectedCategory, setSelectedCategory] = useState<
    'all' | ChangelogCategory
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Đồng bộ tham số ?tab=roadmap từ URL khi điều hướng từ Landing Page Footer
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'roadmap') {
      setActiveTab('roadmap');
    } else if (tabParam === 'releases') {
      setActiveTab('releases');
    }
  }, [searchParams]);

  // Tự động đánh dấu người dùng đã xem phiên bản mới nhất (CURRENT_APP_VERSION = 'v1.5.0')
  useEffect(() => {
    const tenantId = resolveOnboardingTenantId(currentUser);
    const userId = currentUser?.id;
    markChangelogVersionSeen(tenantId, userId, CURRENT_APP_VERSION);
  }, [currentUser]);

  const filteredReleases = useMemo(
    () =>
      filterChangelogReleases(
        CHANGELOG_RELEASES,
        selectedCategory,
        searchQuery
      ),
    [selectedCategory, searchQuery]
  );

  const totalChangesCount = useMemo(
    () =>
      CHANGELOG_RELEASES.reduce(
        (acc, release) => acc + release.changes.length,
        0
      ),
    []
  );

  const normalizedRole = normalizeOnboardingRole(currentUser?.role);
  const workspaceHref =
    currentUser?.role === 'super_admin'
      ? '/platform'
      : normalizedRole === 'tech'
      ? '/tech'
      : '/dashboard';

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-[#17231f] flex flex-col">
      {/* Top Navigation Header (Supports both Public Visitor & Authenticated Staff) */}
      <header className="bg-white border-b border-[#e5ece8] sticky top-0 z-30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[#17231f] hover:opacity-90 transition-opacity"
            >
              <img
                src="/logo.png"
                alt="FIXO Logo"
                className="w-8 h-8 rounded-[8px] object-contain border border-[#e5ece8] flex-none"
              />
              <div>
                <strong className="font-heading font-extrabold text-lg tracking-[-0.03em] text-[#17231f] block leading-none">
                  FIXO
                </strong>
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#758780] mt-0.5">
                  REPAIR OPERATING SYSTEM
                </span>
              </div>
            </Link>

            <span className="hidden sm:inline-block h-5 w-[1px] bg-[#e5ece8] mx-1" />

            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] bg-[#e9f4ef] border border-[#cde2d6] text-xs font-extrabold text-[#176b51]">
              <Icon name="spark" size={14} />
              <span>Nhật ký cập nhật · {CURRENT_APP_VERSION}</span>
            </span>
          </div>

          <nav
            aria-label="Điều hướng cổng thông tin cập nhật"
            className="flex items-center gap-2 sm:gap-2.5"
          >
            <Link
              href="/"
              className="px-3 py-1.5 rounded-[8px] text-xs font-bold text-[#4b5b54] hover:text-[#17231f] hover:bg-[#f6f8f6] border border-transparent hover:border-[#e5ece8] transition-colors"
            >
              Trang chủ FIXO
            </Link>

            <Link
              href="/track"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-bold text-[#4b5b54] hover:text-[#17231f] hover:bg-[#f6f8f6] border border-transparent hover:border-[#e5ece8] transition-colors"
            >
              <Icon name="search" size={14} />
              <span>Tra cứu đơn</span>
            </Link>

            {isAuthenticated && currentUser ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push(workspaceHref)}
                data-testid="changelog-back-to-workspace-btn"
                className="text-xs font-bold bg-[#176b51] hover:bg-[#10583f]"
              >
                <span>Quay lại Bảng điều khiển</span>
                <Icon name="chevronRight" size={14} />
              </Button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-[8px] text-xs font-bold bg-white text-[#17231f] border border-[#dce6e0] hover:bg-[#f6f8f6] transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register?plan=trial"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-xs font-bold bg-[#176b51] text-white border border-[#176b51] hover:bg-[#10583f] transition-colors"
                >
                  <span>Dùng thử miễn phí</span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Hero Overview Card */}
        <section className="bg-white rounded-[16px] border border-[#e5ece8] p-5 sm:p-7 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#176b51]">
                  TRUNG TÂM PHÁT HÀNH & ĐỊNH HƯỚNG SẢN PHẨM
                </span>
                <StatusTag
                  label={`Phiên bản hiện tại: ${CURRENT_APP_VERSION}`}
                  type="ready"
                  showDot={true}
                />
              </div>

              <h1 className="font-heading font-extrabold text-xl sm:text-2xl lg:text-[26px] text-[#17231f] tracking-[-0.02em] m-0">
                Nhật ký Cập nhật Hệ thống & Lộ trình Phát triển FIXO Repair OS
              </h1>

              <p className="text-xs sm:text-sm text-[#54645d] leading-relaxed m-0">
                Theo dõi minh bạch toàn bộ lịch sử phát hành từ phiên bản nền
                tảng v1.0.0 đến v1.5.0 cùng lộ trình nghiên cứu các tính năng tự
                động hóa vận hành cửa hàng sửa chữa thiết bị công nghệ.
              </p>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 flex-none">
              <div className="p-3 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] text-center">
                <div className="font-heading font-extrabold text-lg sm:text-xl text-[#176b51]">
                  {CHANGELOG_RELEASES.length}
                </div>
                <div className="text-[11px] font-semibold text-[#54645d]">
                  Phiên bản phát hành
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] text-center">
                <div className="font-heading font-extrabold text-lg sm:text-xl text-[#17231f]">
                  {totalChangesCount}
                </div>
                <div className="text-[11px] font-semibold text-[#54645d]">
                  Hạng mục nâng cấp
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] text-center">
                <div className="font-heading font-extrabold text-lg sm:text-xl text-[#176b51]">
                  {PRODUCT_ROADMAP_ITEMS.length}
                </div>
                <div className="text-[11px] font-semibold text-[#54645d]">
                  Lộ trình sắp tới
                </div>
              </div>
            </div>
          </div>

          {/* Primary Section Switcher Tabs (Releases vs Roadmap) */}
          <div className="pt-4 border-t border-[#e9eeeb] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div
              role="tablist"
              aria-label="Chế độ xem Nhật ký cập nhật và Lộ trình phát triển"
              className="inline-flex items-center gap-2 p-1 rounded-[10px] bg-[#f6f8f6] border border-[#e5ece8] self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'releases'}
                data-testid="changelog-tab-releases"
                onClick={() => setActiveTab('releases')}
                className={`px-3.5 py-2 rounded-[8px] text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-2 ${
                  activeTab === 'releases'
                    ? 'bg-[#176b51] text-white'
                    : 'text-[#4b5b54] hover:text-[#17231f] hover:bg-white'
                }`}
              >
                <Icon name="clock" size={14} />
                <span>Nhật ký cập nhật (v1.0.0 – v1.5.0)</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'roadmap'}
                data-testid="changelog-tab-roadmap"
                onClick={() => setActiveTab('roadmap')}
                className={`px-3.5 py-2 rounded-[8px] text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-2 ${
                  activeTab === 'roadmap'
                    ? 'bg-[#176b51] text-white'
                    : 'text-[#4b5b54] hover:text-[#17231f] hover:bg-white'
                }`}
              >
                <Icon name="spark" size={14} />
                <span>Lộ trình phát triển (Roadmap)</span>
              </button>
            </div>

            {isAuthenticated && currentUser && (
              <div className="flex items-center gap-2 text-xs text-[#54645d]">
                <Icon name="check" size={14} className="text-[#176b51]" />
                <span>
                  Đã đồng bộ trạng thái xem bản cập nhật{' '}
                  <strong className="text-[#17231f]">{CURRENT_APP_VERSION}</strong>{' '}
                  cho tài khoản <strong className="text-[#17231f]">{currentUser.name}</strong>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 1: RELEASE NOTES TIMELINE (v1.0.0 - v1.5.0) */}
        {activeTab === 'releases' && (
          <section
            aria-label="Danh sách phiên bản Nhật ký cập nhật"
            className="space-y-5"
          >
            {/* Category Filter & Keyword Search Bar */}
            <div className="bg-white rounded-[14px] border border-[#e5ece8] p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Bộ lọc phân loại hạng mục cập nhật"
              >
                {CATEGORY_FILTER_OPTIONS.map((option) => {
                  const isSelected = selectedCategory === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      data-testid={`changelog-filter-${option.key}`}
                      onClick={() => setSelectedCategory(option.key)}
                      className={`px-3 py-1.5 rounded-[8px] text-xs font-bold border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#176b51] text-white border-[#176b51]'
                          : 'bg-[#f6f8f6] text-[#4b5b54] border-[#e5ece8] hover:bg-[#e9f4ef] hover:text-[#176b51]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 w-full lg:w-96">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#81908a] pointer-events-none">
                    <Icon name="search" size={16} />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) =>
                      setSearchQuery(sanitizeInputLive(e.target.value))
                    }
                    placeholder="Tìm theo phiên bản, SePay, Telegram, Bảo hành, Kho..."
                    aria-label="Tìm kiếm trong Nhật ký cập nhật"
                    data-testid="changelog-search-input"
                    className="w-full h-9 pl-9 pr-16 rounded-[8px] bg-[#f6f8f6] border border-[#dce6e0] text-xs text-[#17231f] placeholder:text-[#81908a] focus:outline-none focus:bg-white focus:border-[#176b51]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-[5px] text-[10px] font-bold bg-[#e9eeeb] text-[#4b5b54] hover:bg-[#dce6e0] cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {(selectedCategory !== 'all' || searchQuery.trim() !== '') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleResetFilters}
                    data-testid="changelog-reset-filter-btn"
                    className="text-xs font-bold whitespace-nowrap"
                  >
                    Xóa bộ lọc
                  </Button>
                )}
              </div>
            </div>

            {/* Timeline Releases List */}
            {filteredReleases.length === 0 ? (
              <div
                data-testid="changelog-empty-state"
                className="bg-white rounded-[14px] border border-[#e5ece8] p-8 text-center space-y-3"
              >
                <div className="w-11 h-11 rounded-full bg-[#f6f8f6] border border-[#e5ece8] text-[#758780] mx-auto flex items-center justify-center">
                  <Icon name="search" size={18} />
                </div>
                <h3 className="font-heading font-bold text-base text-[#17231f] m-0">
                  Không tìm thấy hạng mục cập nhật nào phù hợp
                </h3>
                <p className="text-xs text-[#54645d] max-w-md mx-auto leading-relaxed">
                  Không có bản phát hành hoặc tính năng nào khớp với từ khóa{' '}
                  <strong className="text-[#17231f]">
                    &ldquo;{searchQuery}&rdquo;
                  </strong>{' '}
                  trong nhóm phân loại đang chọn.
                </p>
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleResetFilters}
                    className="text-xs font-bold bg-[#176b51] hover:bg-[#10583f]"
                  >
                    Xóa bộ lọc
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {filteredReleases.map((release) => (
                  <article
                    key={release.version}
                    data-testid={`changelog-release-${release.version}`}
                    className="bg-white rounded-[16px] border border-[#e5ece8] p-5 sm:p-6 space-y-5"
                  >
                    {/* Release Header */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 pb-4 border-b border-[#e9eeeb]">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded-[8px] bg-[#176b51] text-white">
                            {release.version}
                          </span>
                          <span className="text-xs font-bold text-[#54645d] bg-[#f6f8f6] px-2.5 py-1 rounded-[7px] border border-[#e5ece8]">
                            Phát hành: {release.releaseDate}
                          </span>
                          <span className="text-xs font-bold text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[7px] border border-[#cde2d6]">
                            {release.badgeLabel}
                          </span>
                          {release.isLatest && (
                            <StatusTag
                              label="Phiên bản hiện tại"
                              type="ready"
                              showDot={true}
                            />
                          )}
                        </div>

                        <h2 className="font-heading font-extrabold text-lg sm:text-xl text-[#17231f] m-0">
                          {release.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#54645d] leading-relaxed m-0">
                          {release.summary}
                        </p>
                      </div>
                    </div>

                    {/* Release Highlights Box */}
                    {release.highlights.length > 0 && (
                      <div className="p-4 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.06em] text-[#176b51]">
                          <Icon name="spark" size={14} />
                          <span>Điểm nhấn phát hành {release.version}</span>
                        </div>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 m-0 p-0 list-none">
                          {release.highlights.map((highlight, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-xs text-[#1c302b] leading-relaxed"
                            >
                              <span className="w-4 h-4 rounded-full bg-[#e9f4ef] border border-[#cde2d6] text-[#176b51] flex items-center justify-center flex-none mt-0.5">
                                <Icon name="check" size={12} />
                              </span>
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Detailed Changes Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {release.changes.map((change) => {
                        const tagProps = getCategoryTagProps(change.category);
                        return (
                          <div
                            key={change.id}
                            data-testid={`changelog-item-${change.id}`}
                            className="p-4 rounded-[12px] bg-white border border-[#e5ece8] hover:border-[#cde2d6] transition-colors flex flex-col justify-between gap-3"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <StatusTag
                                  label={tagProps.label}
                                  type={tagProps.type}
                                  showDot={true}
                                />
                                <span className="text-[11px] font-bold text-[#176b51] bg-[#e9f4ef] px-2 py-0.5 rounded-[6px] border border-[#cde2d6]">
                                  {change.moduleTag}
                                </span>
                              </div>

                              <h3 className="font-heading font-extrabold text-sm text-[#17231f] m-0 leading-snug">
                                {change.title}
                              </h3>

                              <p className="text-xs text-[#54645d] leading-relaxed m-0">
                                {change.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SECTION 2: 3-COLUMN PRODUCT ROADMAP */}
        {activeTab === 'roadmap' && (
          <section
            aria-label="Bảng Lộ trình Phát triển Sản phẩm 3 cột"
            data-testid="changelog-roadmap-section"
            className="space-y-5"
          >
            <div className="bg-white rounded-[14px] border border-[#e5ece8] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-heading font-extrabold text-base sm:text-lg text-[#17231f] m-0">
                  Lộ trình Phát triển Sản phẩm (Product Roadmap)
                </h2>
                <p className="text-xs text-[#54645d] m-0 leading-relaxed">
                  Định hướng phát triển các tính năng tiếp theo của FIXO Repair
                  OS được phân chia theo 3 giai đoạn: Đang phát triển, Dự kiến
                  sắp tới và Đang nghiên cứu.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab('releases')}
                className="text-xs font-bold self-start sm:self-center whitespace-nowrap"
              >
                Xem lịch sử v1.0.0 – v1.5.0
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {ROADMAP_STATUS_ORDER.map((status: RoadmapStatus) => {
                const meta = ROADMAP_STATUS_META[status];
                const columnItems = getRoadmapByStatus(
                  PRODUCT_ROADMAP_ITEMS,
                  status
                );

                return (
                  <div
                    key={status}
                    data-testid={`roadmap-column-${status}`}
                    className="bg-white rounded-[16px] border border-[#e5ece8] p-4 sm:p-5 flex flex-col gap-4"
                  >
                    {/* Column Header */}
                    <div className="pb-3.5 border-b border-[#e9eeeb] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <StatusTag
                          label={meta.label}
                          type={meta.badgeType}
                          showDot={true}
                        />
                        <span className="text-xs font-mono font-bold text-[#54645d] bg-[#f6f8f6] px-2 py-0.5 rounded-[6px] border border-[#e5ece8]">
                          {columnItems.length} hạng mục
                        </span>
                      </div>
                      <p className="text-xs text-[#54645d] m-0 leading-relaxed">
                        {meta.subtitle}
                      </p>
                    </div>

                    {/* Column Cards */}
                    <div className="space-y-3.5 flex-1">
                      {columnItems.map((item) => (
                        <div
                          key={item.id}
                          data-testid={`roadmap-card-${item.id}`}
                          className="p-4 rounded-[12px] bg-[#f6f8f6] border border-[#e5ece8] space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-[#176b51] bg-[#e9f4ef] px-2 py-0.5 rounded-[6px] border border-[#cde2d6]">
                              {item.moduleTag}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-[#54645d] bg-white px-2 py-0.5 rounded-[6px] border border-[#e5ece8]">
                              Dự kiến: {item.etaLabel}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h3 className="font-heading font-extrabold text-sm text-[#17231f] m-0 leading-snug">
                              {item.title}
                            </h3>
                            <div className="text-[11px] font-semibold text-[#54645d]">
                              Nhóm thụ hưởng:{' '}
                              <strong className="text-[#17231f]">
                                {item.targetAudience}
                              </strong>
                            </div>
                          </div>

                          <p className="text-xs text-[#2d3e37] leading-relaxed m-0">
                            {item.description}
                          </p>

                          <div className="pt-2.5 border-t border-[#e2ebe6] space-y-1.5">
                            <div className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#176b51]">
                              Giá trị vận hành cốt lõi
                            </div>
                            <ul className="space-y-1.5 m-0 p-0 list-none">
                              {item.benefits.map((benefit, bIdx) => (
                                <li
                                  key={bIdx}
                                  className="flex items-start gap-2 text-xs text-[#4b5b54] leading-relaxed"
                                >
                                  <Icon
                                    name="check"
                                    size={12}
                                    className="text-[#176b51] flex-none mt-1"
                                  />
                                  <span>{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Public Footer */}
      <footer className="bg-white border-t border-[#e5ece8] mt-10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#54645d]">
          <div>
            <strong className="text-[#17231f]">FIXO Repair OS</strong> · Hệ điều
            hành quản lý cửa hàng sửa chữa thiết bị công nghệ · Phiên bản{' '}
            <span className="font-mono font-bold text-[#176b51]">
              {CURRENT_APP_VERSION}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <Link href="/" className="hover:text-[#176b51] transition-colors">
              Trang chủ
            </Link>
            <Link
              href="/track"
              className="hover:text-[#176b51] transition-colors"
            >
              Tra cứu bảo hành
            </Link>
            <Link
              href="/login"
              className="hover:text-[#176b51] transition-colors"
            >
              Đăng nhập hệ thống
            </Link>
            <Link
              href="/register?plan=trial"
              className="text-[#176b51] hover:underline"
            >
              Đăng ký dùng thử
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
