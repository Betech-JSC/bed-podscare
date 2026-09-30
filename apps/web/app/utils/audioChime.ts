'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Singleton AudioContext reference
let globalAudioCtx: AudioContext | null = null;
let isUnlockListenerAttached = false;

/**
 * Mở khóa và khởi tạo AudioContext khi có tương tác người dùng.
 * Áp dụng Lazy Initialization 100%: Tuyệt đối không tạo AudioContext khi tải trang ban đầu.
 */
export function unlockAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!globalAudioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtxClass) {
        globalAudioCtx = new AudioCtxClass();
      }
    }

    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {
        // Trình duyệt có thể từ chối nếu cử chỉ chưa đủ điều kiện
      });
    }

    return globalAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Lấy hoặc khởi tạo instance AudioContext an toàn trong môi trường trình duyệt.
 * Lazy - Chỉ khởi tạo khi thực sự cần dùng.
 */
export function getAudioContext(): AudioContext | null {
  return unlockAudio();
}

/**
 * Đăng ký listener mở khóa AudioContext ngay sau tương tác đầu tiên của người dùng
 * (Tuân thủ nghiêm ngặt chính sách Autoplay Policy của trình duyệt hiện đại).
 * Tuyệt đối không tạo AudioContext trong hàm này, chỉ gắn listeners để chờ cử chỉ người dùng.
 */
export function setupAudioContextUnlock(): void {
  if (typeof window === 'undefined' || isUnlockListenerAttached) return;

  const unlockEvents = ['click', 'keydown', 'pointerdown', 'touchstart'];

  const handleFirstInteraction = () => {
    unlockAudio();

    // Gỡ bỏ toàn bộ event listeners sau lần kích hoạt đầu tiên
    unlockEvents.forEach((evt) => {
      window.removeEventListener(evt, handleFirstInteraction, true);
    });
    isUnlockListenerAttached = false;
  };

  unlockEvents.forEach((evt) => {
    window.addEventListener(evt, handleFirstInteraction, { capture: true, once: true });
  });

  isUnlockListenerAttached = true;
}

/**
 * Tổng hợp và phát âm thanh "ting" thông báo (Zero-Latency Web Audio Chime).
 * - Dual Sine Wave: 659.25Hz (E5) chuyển tiếp mượt mà sang 880.00Hz (A5).
 * - Envelope: Attack 0.01s, Exponential Decay 0.35s về 0.001.
 * - Không phụ thuộc file MP3 tĩnh hay băng thông mạng.
 */
export function playChimeTone(volume: number = 0.25): void {
  const ctx = unlockAudio();
  if (!ctx) return;

  // Nếu AudioContext bị suspend, thử resume ngay
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;
    const duration = 0.35; // Thời gian vang 0.35s
    const attackTime = 0.01; // Attack cực nhanh 10ms
    const safeVolume = Math.min(Math.max(volume, 0.01), 1.0);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Dạng sóng Sine êm ái, thanh thoát chuẩn y tế / Apple
    osc.type = 'sine';

    // Dual Sine frequency transition: 659.25Hz (E5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.06);

    // Dynamic Gain Envelope
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(safeVolume, now + attackTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Kết nối đồ thị âm thanh (Audio Graph)
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (err) {
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOCKET_DEBUG === 'true') {
      console.debug('[AudioChime] Không thể phát âm thanh:', err);
    }
  }
}

// Alias tương thích với các module gọi playNotificationChime
export const playNotificationChime = playChimeTone;

const CHIME_THROTTLE_MS = 800; // Throttle 800ms chống spam âm thanh
const STORAGE_KEY = 'podscare_audio_muted';

// Timestamp toàn cục để bảo vệ throttle xuyên suốt các components
let globalLastPlayedTime = 0;

export interface UseAudioChimeReturn {
  isMuted: boolean;
  toggleMute: () => void;
  setIsMuted: (muted: boolean) => void;
  playChime: () => void;
}

/**
 * Hook quản lý tùy chọn Mute/Unmute âm thanh thông báo:
 * - Lưu trạng thái persistence vào `localStorage`.
 * - Tự động mở khóa Web Audio API qua tương tác người dùng.
 * - Cơ chế throttle 800ms chống spam dồn dập khi nhận hàng loạt gói tin Socket.
 */
export function useAudioChime(): UseAudioChimeReturn {
  const [isMuted, setIsMutedState] = useState<boolean>(false);
  const localLastPlayedRef = useRef<number>(0);

  // Đọc cấu hình từ localStorage khi mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setIsMutedState(saved === 'true');
      }
    } catch {
      // Bỏ qua lỗi truy cập storage
    }

    // Đăng ký mở khóa AudioContext
    setupAudioContextUnlock();
  }, []);

  const setIsMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Bỏ qua lỗi truy cập storage
      }
      return next;
    });
  }, []);

  const playChime = useCallback(() => {
    if (isMuted) return;

    const now = Date.now();
    // Kiểm tra throttle cả ở instance level và global level (800ms)
    if (
      now - localLastPlayedRef.current < CHIME_THROTTLE_MS ||
      now - globalLastPlayedTime < CHIME_THROTTLE_MS
    ) {
      return;
    }

    localLastPlayedRef.current = now;
    globalLastPlayedTime = now;

    playChimeTone();
  }, [isMuted]);

  return {
    isMuted,
    toggleMute,
    setIsMuted,
    playChime,
  };
}
