'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icons';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  eyebrow?: string;
  loading?: boolean;
}

// Module-level tracking for active modals to handle background scroll lock
let activeConfirmCount = 0;
let lockedScrollY = 0;
let originalBodyPosition = '';
let originalBodyTop = '';
let originalBodyWidth = '';
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalBodyPaddingRight = '';
let originalBodyOverscroll = '';

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  variant = 'danger',
  eyebrow,
  loading = false,
}) => {
  const [mounted, setMounted] = useState(false);
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Scroll lock handling
  useEffect(() => {
    if (!isOpen) return;

    if (activeConfirmCount === 0) {
      lockedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      originalBodyPosition = document.body.style.position;
      originalBodyTop = document.body.style.top;
      originalBodyWidth = document.body.style.width;
      originalBodyOverflow = document.body.style.overflow;
      originalHtmlOverflow = document.documentElement.style.overflow;
      originalBodyPaddingRight = document.body.style.paddingRight;
      originalBodyOverscroll = document.body.style.overscrollBehavior;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    }
    activeConfirmCount++;

    return () => {
      activeConfirmCount = Math.max(0, activeConfirmCount - 1);
      if (activeConfirmCount === 0) {
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.paddingRight = originalBodyPaddingRight;
        document.body.style.overscrollBehavior = originalBodyOverscroll;
        window.scrollTo(0, lockedScrollY);
      }
    };
  }, [isOpen]);

  // Initial focus management
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (variant === 'danger') {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, variant]);

  // Keyboard navigation & Focus trapping
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = modalBoxRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    },
    [loading]
  );

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const variantConfig = {
    danger: {
      iconBg: 'bg-[#fbefed] text-[#bc5b52] border border-[#f5c7c2]',
      iconName: 'alert',
      confirmVariant: 'danger' as const,
      confirmCustomStyle: '',
    },
    warning: {
      iconBg: 'bg-[#fef9ec] text-[#bd8738] border border-[#fae8be]',
      iconName: 'alert',
      confirmVariant: 'primary' as const,
      confirmCustomStyle: 'bg-[#bd8738] hover:bg-[#a6742c] text-white border-[#bd8738]',
    },
    info: {
      iconBg: 'bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]',
      iconName: 'check',
      confirmVariant: 'primary' as const,
      confirmCustomStyle: 'bg-[#176b58] hover:bg-[#125945] text-white border-[#176b58]',
    },
  }[variant];

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[100] bg-[#17251f]/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-hidden overscroll-contain animate-in fade-in duration-150"
      onClick={(e) => {
        if (!loading && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalBoxRef}
        tabIndex={-1}
        className="w-full max-w-[480px] bg-white rounded-[16px] shadow-[0_24px_90px_rgba(18,37,27,0.22)] border border-[#e5ece8] overflow-hidden my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-[12px] flex-none grid place-items-center ${variantConfig.iconBg}`}
            >
              <Icon name={variantConfig.iconName} size={24} />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              {eyebrow && (
                <div className="text-[10px] sm:text-xs font-bold text-[#819089] uppercase tracking-[1.05px] mb-1">
                  {eyebrow}
                </div>
              )}
              <h3
                id="confirm-modal-title"
                className="font-heading font-bold text-lg text-[#1c302b] m-0 leading-snug"
              >
                {title}
              </h3>
              {description && (
                <div className="text-sm text-[#67776f] mt-2 leading-relaxed font-normal">
                  {description}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-[#f9faf9] border-t border-[#e5ece8] px-6 py-4 flex items-center justify-end gap-3">
          <Button
            ref={cancelBtnRef}
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={onClose}
            className="text-sm font-semibold"
          >
            {cancelText}
          </Button>

          <Button
            ref={confirmBtnRef}
            variant={variantConfig.confirmVariant}
            size="md"
            loading={loading}
            onClick={onConfirm}
            className={`text-sm font-semibold ${variantConfig.confirmCustomStyle}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
