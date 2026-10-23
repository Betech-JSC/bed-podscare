import React, { useMemo } from 'react';

export interface PaginationBarProps {
  currentPage: number;
  lastPage: number;
  total: number;
  from?: number | null;
  to?: number | null;
  perPage: number | 'all';
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number | 'all') => void;
  itemLabel?: string;
  perPageOptions?: Array<number | 'all'>;
  compact?: boolean;
  testIdPrefix?: string;
  isLoading?: boolean;
  className?: string;
}

const DEFAULT_PER_PAGE_OPTIONS: Array<number | 'all'> = [15, 30, 50, 100, 'all'];

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  lastPage,
  total,
  from,
  to,
  perPage,
  onPageChange,
  onPerPageChange,
  itemLabel = 'bản ghi',
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  compact = false,
  testIdPrefix = 'pagination',
  isLoading = false,
  className = '',
}) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLastPage = Math.max(1, Number(lastPage) || 1);
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), safeLastPage);

  const effectiveFrom = useMemo(() => {
    if (safeTotal === 0) return 0;
    if (typeof from === 'number' && from > 0) return from;
    if (perPage === 'all') return 1;
    const size = Math.max(1, Number(perPage) || 15);
    return Math.min(safeTotal, (safeCurrentPage - 1) * size + 1);
  }, [from, perPage, safeCurrentPage, safeTotal]);

  const effectiveTo = useMemo(() => {
    if (safeTotal === 0) return 0;
    if (typeof to === 'number' && to > 0) return to;
    if (perPage === 'all') return safeTotal;
    const size = Math.max(1, Number(perPage) || 15);
    return Math.min(safeTotal, safeCurrentPage * size);
  }, [to, perPage, safeCurrentPage, safeTotal]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxPagesToShow = compact ? 3 : 5;
    let startPage = Math.max(1, safeCurrentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(safeLastPage, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }
    return pages;
  }, [compact, safeCurrentPage, safeLastPage]);

  const isPrevDisabled = safeCurrentPage <= 1 || perPage === 'all' || isLoading;
  const isNextDisabled = safeCurrentPage >= safeLastPage || perPage === 'all' || isLoading;

  return (
    <div
      data-testid={`${testIdPrefix}-pagination-bar`}
      className={`mt-4 pt-3.5 border-t border-[#edf1ee] bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-[#596962] tabular-nums ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span data-testid={`${testIdPrefix}-pagination-summary`}>
          {safeTotal === 0 ? (
            <>
              Hiển thị <b className="text-[#1c302b] font-mono tabular-nums">0</b> trên tổng{' '}
              <b className="text-[#176b58] font-mono tabular-nums">0</b> {itemLabel}
            </>
          ) : (
            <>
              Hiển thị{' '}
              <b className="text-[#1c302b] font-mono tabular-nums">
                {effectiveFrom} - {effectiveTo}
              </b>{' '}
              trên tổng <b className="text-[#176b58] font-mono tabular-nums">{safeTotal}</b>{' '}
              {itemLabel}
            </>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {!compact && <span className="text-[#7e8d85]">Số dòng:</span>}
          <select
            data-testid={`${testIdPrefix}-per-page-select`}
            value={perPage}
            disabled={isLoading}
            onChange={(e) => {
              const val = e.target.value;
              const nextPerPage: number | 'all' = val === 'all' ? 'all' : Number(val);
              onPerPageChange(nextPerPage);
              onPageChange(1);
            }}
            className="text-xs border border-[#d8e2dc] rounded-[7px] px-2.5 py-1 bg-white text-[#1c302b] font-semibold tabular-nums outline-none focus:border-[#176b58] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {perPageOptions.map((opt) => (
              <option key={String(opt)} value={opt}>
                {opt === 'all' ? 'Tất cả' : `${opt} / trang`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1.5 tabular-nums">
        <button
          type="button"
          data-testid={`${testIdPrefix}-prev-page`}
          disabled={isPrevDisabled}
          onClick={() => {
            if (!isPrevDisabled) {
              onPageChange(Math.max(1, safeCurrentPage - 1));
            }
          }}
          className={`px-2.5 py-1 rounded-[7px] font-semibold border transition-colors ${
            isPrevDisabled
              ? 'bg-[#f6f8f7] text-[#9ca8a2] border-[#e5ece8] cursor-not-allowed'
              : 'bg-white text-[#1c302b] border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58] hover:border-[#b8d7c8] cursor-pointer'
          }`}
        >
          Trước
        </button>

        {pageNumbers.map((p) => {
          const isCurrent = p === safeCurrentPage;
          const isPageDisabled = perPage === 'all' || isLoading;
          return (
            <button
              key={p}
              type="button"
              data-testid={`${testIdPrefix}-page-${p}`}
              disabled={isPageDisabled}
              onClick={() => {
                if (!isPageDisabled && p !== safeCurrentPage) {
                  onPageChange(p);
                }
              }}
              className={`min-w-[28px] h-7 px-2 rounded-[7px] font-bold font-mono text-xs tabular-nums transition-colors ${
                isCurrent
                  ? 'bg-[#176b58] text-white border border-[#176b58] shadow-xs'
                  : 'bg-white text-[#4b5b53] border border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58]'
              } ${isPageDisabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          data-testid={`${testIdPrefix}-next-page`}
          disabled={isNextDisabled}
          onClick={() => {
            if (!isNextDisabled) {
              onPageChange(Math.min(safeLastPage, safeCurrentPage + 1));
            }
          }}
          className={`px-2.5 py-1 rounded-[7px] font-semibold border transition-colors ${
            isNextDisabled
              ? 'bg-[#f6f8f7] text-[#9ca8a2] border-[#e5ece8] cursor-not-allowed'
              : 'bg-white text-[#1c302b] border-[#d8e2dc] hover:bg-[#eaf4ef] hover:text-[#176b58] hover:border-[#b8d7c8] cursor-pointer'
          }`}
        >
          Sau
        </button>
      </div>
    </div>
  );
};
