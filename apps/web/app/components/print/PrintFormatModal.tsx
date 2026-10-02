'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button } from '@podscare/ui';
import {
  type PrintFormat,
  getStoredPrintFormat,
  setStoredPrintFormat,
} from './printerPreference';
import type { RepairOrder } from '@podscare/types';

export interface PrintFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat?: (format: PrintFormat) => void;
}

/**
 * Modal cấu hình và chọn khổ in cho máy quầy giao dịch
 */
export const PrintFormatModal: React.FC<PrintFormatModalProps> = ({
  isOpen,
  onClose,
  onSelectFormat,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<PrintFormat>(getStoredPrintFormat);

  useEffect(() => {
    if (isOpen) {
      setSelectedFormat(getStoredPrintFormat());
    }
  }, [isOpen]);

  const handleSave = (format: PrintFormat) => {
    setSelectedFormat(format);
    setStoredPrintFormat(format);
    onSelectFormat?.(format);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      eyebrow="CẤU HÌNH MÁY QUẦY"
      title="Khổ in phiếu mặc định"
      subtitle="Chọn định dạng in tối ưu theo thiết bị máy in tại quầy của bạn."
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pt-1">
        {/* Lựa chọn K80 */}
        <div
          onClick={() => handleSave('k80')}
          className={`p-3.5 rounded-[10px] border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
            selectedFormat === 'k80'
              ? 'border-[#176b58] bg-[#f0f8f4]'
              : 'border-[#e2e9e5] hover:border-[#b8d0c5] bg-white'
          }`}
        >
          <div className="w-10 h-10 rounded-[8px] bg-[#176b58] text-white flex items-center justify-center flex-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-heading font-bold text-sm text-[#1c302b]">
                Máy in nhiệt cuộn K80 (80mm)
              </span>
              {selectedFormat === 'k80' && (
                <span className="text-[10px] bg-[#176b58] text-white font-bold px-2 py-0.5 rounded-full">
                  Mặc định
                </span>
              )}
            </div>
            <p className="text-xs text-[#5c6e66] leading-relaxed m-0">
              Khổ giấy cuộn nhiệt 80mm nhỏ gọn, in siêu tốc trong 1 giây. Tích hợp mã QR tra cứu realtime và mã vạch cho quầy giao dịch.
            </p>
          </div>
        </div>

        {/* Lựa chọn A4 */}
        <div
          onClick={() => handleSave('a4')}
          className={`p-3.5 rounded-[10px] border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
            selectedFormat === 'a4'
              ? 'border-[#176b58] bg-[#f0f8f4]'
              : 'border-[#e2e9e5] hover:border-[#b8d0c5] bg-white'
          }`}
        >
          <div className="w-10 h-10 rounded-[8px] bg-[#3a524a] text-white flex items-center justify-center flex-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-heading font-bold text-sm text-[#1c302b]">
                Khổ văn phòng A4 (2 liên đối soát)
              </span>
              {selectedFormat === 'a4' && (
                <span className="text-[10px] bg-[#176b58] text-white font-bold px-2 py-0.5 rounded-full">
                  Mặc định
                </span>
              )}
            </div>
            <p className="text-xs text-[#5c6e66] leading-relaxed m-0">
              Khổ giấy tiêu chuẩn A4 in 2 liên (Cửa hàng giữ & Khách hàng giữ) kèm đường cắt đứt đoạn xé đôi. Dành cho máy in laser/phun văn phòng.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export interface PrintButtonDropdownProps {
  order: RepairOrder;
  onPrint: (order: RepairOrder, format: PrintFormat) => void;
  isPrinting?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  buttonText?: string;
}

/**
 * Nút in tích hợp Dropdown lựa chọn khổ in nhanh hoặc in theo mặc định
 */
export const PrintButtonDropdown: React.FC<PrintButtonDropdownProps> = ({
  order,
  onPrint,
  isPrinting = false,
  className = '',
  variant = 'secondary',
  size = 'md',
  buttonText = 'In phiếu',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [currentFormat, setCurrentFormat] = useState<PrintFormat>(getStoredPrintFormat);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrintDefault = () => {
    const pref = getStoredPrintFormat();
    setCurrentFormat(pref);
    onPrint(order, pref);
  };

  const handlePrintSpecific = (format: PrintFormat) => {
    setDropdownOpen(false);
    onPrint(order, format);
  };

  return (
    <div className={`relative inline-flex items-center ${className}`} ref={dropdownRef}>
      {/* Nút in theo khổ mặc định */}
      <Button
        variant={variant}
        size={size}
        disabled={isPrinting}
        onClick={handlePrintDefault}
        className="rounded-r-none border-r-0 flex items-center gap-1.5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        <span>{isPrinting ? 'Đang in...' : buttonText}</span>
        <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-black/10 rounded ml-1 font-bold">
          {currentFormat}
        </span>
      </Button>

      {/* Nút mũi tên mở dropdown */}
      <button
        type="button"
        disabled={isPrinting}
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`px-1.5 h-full min-h-[36px] flex items-center justify-center border rounded-r-[8px] transition-colors ${
          variant === 'primary'
            ? 'bg-[#176b58] text-white hover:bg-[#125848] border-[#176b58] border-l-white/20'
            : variant === 'outline'
            ? 'bg-transparent text-[#176b58] hover:bg-[#f0f8f4] border-[#b8d0c5]'
            : 'bg-white text-[#1c302b] hover:bg-[#f2f6f4] border-[#d8e2dc]'
        }`}
        title="Tùy chọn khổ in"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Menu dropdown */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-[10px] shadow-lg border border-[#e2e9e5] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-[10px] font-bold text-[#83958c] uppercase px-2 py-1 tracking-wider">
            Chọn khổ in ngay
          </div>
          <button
            type="button"
            onClick={() => handlePrintSpecific('k80')}
            className="w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs hover:bg-[#f0f7f3] text-[#1c302b] flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span>🧾</span> In nhiệt cuộn K80 (80mm)
            </span>
            {currentFormat === 'k80' && (
              <span className="text-[9px] text-[#176b58] font-bold">★ Mặc định</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handlePrintSpecific('a4')}
            className="w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs hover:bg-[#f0f7f3] text-[#1c302b] flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span>📄</span> In A4 (2 liên đối soát)
            </span>
            {currentFormat === 'a4' && (
              <span className="text-[9px] text-[#176b58] font-bold">★ Mặc định</span>
            )}
          </button>

          <div className="border-t border-[#eef3f0] my-1" />

          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              setConfigModalOpen(true);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs text-[#5c6e66] hover:bg-[#f2f5f3] flex items-center gap-1.5"
          >
            <span>⚙️</span> Cài đặt khổ in mặc định...
          </button>
        </div>
      )}

      {/* Modal cấu hình khổ mặc định */}
      <PrintFormatModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSelectFormat={(f) => setCurrentFormat(f)}
      />
    </div>
  );
};
