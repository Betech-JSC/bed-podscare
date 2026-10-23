'use client';

import React from 'react';
import { Icon } from './Icons';

export type HardwarePartKey = 'L' | 'R' | 'Case';

export interface HardwarePartDefinition {
  key: HardwarePartKey;
  shortLabel: string;
  label: string;
  iconName: string;
}

export const HARDWARE_PART_DEFINITIONS: HardwarePartDefinition[] = [
  {
    key: 'L',
    shortLabel: 'L',
    label: 'Tai trái (L)',
    iconName: 'earbudLeft',
  },
  {
    key: 'R',
    shortLabel: 'R',
    label: 'Tai phải (R)',
    iconName: 'earbudRight',
  },
  {
    key: 'Case',
    shortLabel: 'Case',
    label: 'Hộp sạc (Case)',
    iconName: 'chargingCase',
  },
];

export interface HardwarePartSelectorProps {
  value?: HardwarePartKey[];
  selectedParts?: HardwarePartKey[];
  onChange?: (nextParts: HardwarePartKey[]) => void;
  readOnly?: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
}

/**
 * Phân tích chuỗi phụ kiện / linh kiện tiếp nhận sang mảng bộ phận chuẩn ['L', 'R', 'Case'].
 */
export function parseHardwarePartsFromText(text?: string | null): HardwarePartKey[] {
  if (!text || !text.trim()) {
    return ['L', 'R', 'Case'];
  }
  const normalized = text.toLowerCase();
  if (
    normalized.includes('full') ||
    normalized.includes('đủ bộ') ||
    normalized.includes('nguyên bộ') ||
    (normalized.includes('2 tai') && (normalized.includes('hộp') || normalized.includes('case') || normalized.includes('dock')))
  ) {
    return ['L', 'R', 'Case'];
  }

  const parts: HardwarePartKey[] = [];
  if (
    normalized.includes('tai trái') ||
    normalized.includes('tai l') ||
    /\b(l)\b/i.test(text) ||
    normalized.includes('2 tai') ||
    normalized.includes('hai tai')
  ) {
    parts.push('L');
  }
  if (
    normalized.includes('tai phải') ||
    normalized.includes('tai r') ||
    /\b(r)\b/i.test(text) ||
    normalized.includes('2 tai') ||
    normalized.includes('hai tai')
  ) {
    parts.push('R');
  }
  if (
    normalized.includes('hộp sạc') ||
    normalized.includes('hộp') ||
    normalized.includes('case') ||
    normalized.includes('dock')
  ) {
    parts.push('Case');
  }

  return parts.length > 0 ? parts : ['L', 'R', 'Case'];
}

/**
 * Định dạng mảng ['L', 'R', 'Case'] thành chuỗi mô tả phụ kiện tiếp nhận chuẩn.
 */
export function formatHardwarePartsToText(parts: HardwarePartKey[]): string {
  const hasL = parts.includes('L');
  const hasR = parts.includes('R');
  const hasCase = parts.includes('Case');

  if (hasL && hasR && hasCase) {
    return 'Tai trái (L), Tai phải (R), Hộp sạc (Case)';
  }
  const labels: string[] = [];
  if (hasL) labels.push('Tai trái (L)');
  if (hasR) labels.push('Tai phải (R)');
  if (hasCase) labels.push('Hộp sạc (Case)');
  return labels.join(', ');
}

export const HardwarePartSelector: React.FC<HardwarePartSelectorProps> = ({
  value,
  selectedParts,
  onChange,
  readOnly = false,
  compact = false,
  className = '',
}) => {
  const effectiveValue = value ?? selectedParts ?? ['L', 'R', 'Case'];

  const handleToggle = (key: HardwarePartKey) => {
    if (readOnly || !onChange) return;
    const exists = effectiveValue.includes(key);
    const next = exists ? effectiveValue.filter((k) => k !== key) : [...effectiveValue, key];
    // Preserve canonical order L -> R -> Case
    const ordered: HardwarePartKey[] = (['L', 'R', 'Case'] as HardwarePartKey[]).filter((k) =>
      next.includes(k)
    );
    onChange(ordered);
  };

  return (
    <div
      role="group"
      aria-label="Linh kiện phần cứng tiếp nhận (L / R / Case)"
      className={`grid grid-cols-3 gap-2 ${className}`}
    >
      {HARDWARE_PART_DEFINITIONS.map((part) => {
        const isSelected = effectiveValue.includes(part.key);
        return (
          <button
            key={part.key}
            type="button"
            disabled={readOnly}
            aria-pressed={isSelected}
            onClick={() => handleToggle(part.key)}
            className={`flex items-center justify-between gap-2 rounded-[8px] border transition-colors text-left ${
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
            } ${
              isSelected
                ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                : 'bg-white border-[#e9eeeb] text-[#81908a]'
            } ${
              readOnly
                ? 'cursor-default'
                : 'cursor-pointer hover:border-[#176b51]/60 focus:outline-none focus:ring-2 focus:ring-[#176b51]/20'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-7 h-7 rounded-[6px] grid place-items-center flex-none border ${
                  isSelected
                    ? 'bg-[#176b51] text-white border-[#176b51]'
                    : 'bg-[#f6f8f6] text-[#81908a] border-[#e9eeeb]'
                }`}
              >
                <Icon name={part.iconName} size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight truncate">{part.label}</div>
                <div className="text-[10px] font-medium text-[#81908a] leading-tight mt-0.5">
                  {isSelected ? 'Có nhận' : 'Không kèm'}
                </div>
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full flex-none ${
                isSelected ? 'bg-[#176b51]' : 'bg-[#d6e0db]'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};
