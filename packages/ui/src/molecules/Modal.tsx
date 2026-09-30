'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

// Module-level tracking for active modals to handle nested/multiple modals safely
let activeModalCount = 0;
let lockedScrollY = 0;
let originalBodyPosition = '';
let originalBodyTop = '';
let originalBodyWidth = '';
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalBodyPaddingRight = '';
let originalBodyOverscroll = '';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    if (activeModalCount === 0) {
      // 1. Save scroll position and original styles
      lockedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      originalBodyPosition = document.body.style.position;
      originalBodyTop = document.body.style.top;
      originalBodyWidth = document.body.style.width;
      originalBodyOverflow = document.body.style.overflow;
      originalHtmlOverflow = document.documentElement.style.overflow;
      originalBodyPaddingRight = document.body.style.paddingRight;
      originalBodyOverscroll = document.body.style.overscrollBehavior;

      // 2. Compensate scrollbar width to prevent layout shift / jitter
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // 3. Bulletproof lock background scroll on body and html
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    }
    activeModalCount++;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      activeModalCount = Math.max(0, activeModalCount - 1);
      if (activeModalCount === 0) {
        // Restore exact initial styles
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.paddingRight = originalBodyPaddingRight;
        document.body.style.overscrollBehavior = originalBodyOverscroll;

        // Restore scroll position
        window.scrollTo(0, lockedScrollY);
      }
    };
  }, [isOpen]);

  // Prevent wheel / touchmove on the backdrop from propagating
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    const handleBackdropScroll = (e: TouchEvent | WheelEvent) => {
      if (e.target === overlay) {
        e.preventDefault();
      }
    };

    overlay.addEventListener('wheel', handleBackdropScroll, { passive: false });
    overlay.addEventListener('touchmove', handleBackdropScroll, { passive: false });

    return () => {
      overlay.removeEventListener('wheel', handleBackdropScroll);
      overlay.removeEventListener('touchmove', handleBackdropScroll);
    };
  }, [isOpen, mounted]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const maxWidthClass = {
    sm: 'max-w-[440px]',
    md: 'max-w-[620px]',
    lg: 'max-w-[840px]',
    xl: 'max-w-[980px]',
    '2xl': 'max-w-[1180px]',
    full: 'max-w-full m-4',
  }[maxWidth];

  const modalContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-[#17251f]/60 backdrop-blur-sm grid place-items-center p-3 sm:p-5 overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      style={{ overscrollBehavior: 'contain' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] flex flex-col bg-white rounded-[12px] shadow-[0_24px_90px_rgba(18,37,27,0.18)] border border-[#e5ece8] overflow-hidden my-auto animate-in zoom-in-95 duration-150 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Head */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-[#e5ece8] flex-none">
          <div>
            {eyebrow && (
              <div className="text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
                {eyebrow}
              </div>
            )}
            <h2 className="font-heading font-bold text-lg sm:text-xl text-[#1c302b] m-0">{title}</h2>
            {subtitle && <p className="text-sm text-[#7d8c85] mt-1 mb-0">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng modal"
            className="w-8 h-8 rounded-[8px] text-[#708078] hover:bg-[#f1f4f2] hover:text-[#1c302b] grid place-items-center text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 [scrollbar-width:thin] [scrollbar-color:#d6e0db_transparent]"
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>

        {/* Foot */}
        {footer && (
          <div className="flex items-center justify-end gap-2.5 p-4 sm:px-6 sm:py-4 border-t border-[#e5ece8] bg-[#fafbfa] flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
