import React from 'react';

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 7,
}) => {
  return (
    <div className="w-full bg-white rounded-[10px] border border-[#e5ece8] overflow-hidden animate-pulse">
      {/* Header */}
      <div className="h-9 bg-[#fafbfa] border-b border-[#f0f3f1] px-4 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-[#e5ece8] rounded w-20" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-[#f1f3f2]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-13 px-4 flex items-center gap-4">
            <div className="h-3 bg-[#edf1ee] rounded w-16" />
            <div className="flex items-center gap-2 flex-1">
              <div className="w-6 h-6 rounded-full bg-[#edf1ee]" />
              <div className="space-y-1">
                <div className="h-3 bg-[#edf1ee] rounded w-28" />
                <div className="h-2 bg-[#edf1ee] rounded w-20" />
              </div>
            </div>
            <div className="h-3 bg-[#edf1ee] rounded w-24" />
            <div className="h-5 bg-[#edf1ee] rounded-full w-20" />
            <div className="h-3 bg-[#edf1ee] rounded w-16" />
            <div className="h-3 bg-[#edf1ee] rounded w-20" />
            <div className="h-3 bg-[#edf1ee] rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[#e5ece8] rounded-[10px] p-4 min-h-[105px] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="h-2.5 bg-[#edf1ee] rounded w-24" />
            <div className="w-7 h-7 rounded-[8px] bg-[#edf1ee]" />
          </div>
          <div className="h-6 bg-[#edf1ee] rounded w-20 my-2" />
          <div className="h-2 bg-[#edf1ee] rounded w-28" />
        </div>
      ))}
    </div>
  );
};

export const CardsSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-[#e5ece8] rounded-[9px] p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-3 bg-[#edf1ee] rounded w-24" />
            <div className="h-4 bg-[#edf1ee] rounded-full w-16" />
          </div>
          <div className="h-4 bg-[#edf1ee] rounded w-36" />
          <div className="h-3 bg-[#edf1ee] rounded w-full" />
          <div className="pt-2 border-t border-[#edf1ee] flex justify-between">
            <div className="h-3 bg-[#edf1ee] rounded w-20" />
            <div className="h-3 bg-[#edf1ee] rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
};
