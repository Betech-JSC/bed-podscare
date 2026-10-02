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
 * Tổng hợp và phát âm thanh chuông báo chuẩn Grab (Dual-tone Chime với DynamicsCompressor).
 * - Tần số: Nốt C6 (1046.50Hz) ngân 0.15s chuyển tiếp dứt khoát sang E6 (1318.51Hz) ngân 0.5s.
 * - Volume: 1.0 (100% công suất).
 * - DynamicsCompressorNode: Threshold -18dB, Knee 12dB, Ratio 8, Attack 3ms, Release 250ms
 *   giúp âm thanh to rõ, sắc sảo, chống méo tiếng và triệt tiêu hoàn toàn hiện tượng vỡ gain loa.
 * - Pipeline: Oscillator -> GainNode (1.0) -> DynamicsCompressorNode -> ctx.destination.
 */
export function playChimeTone(volume: number = 1.0): void {
  const ctx = unlockAudio();
  if (!ctx) return;

  // Nếu AudioContext bị suspend, thử resume ngay
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;
    const note1Duration = 0.15; // Nốt 1 C6 ngân 0.15s
    const totalDuration = 0.65; // Tổng thời lượng phát 0.65s (nốt 2 E6 ngân 0.5s)
    const attackTime = 0.005; // Attack 5ms cực nhanh, dứt khoát
    const safeVolume = Math.min(Math.max(volume, 0.01), 1.0);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Khởi tạo DynamicsCompressorNode chống vỡ gain nếu môi trường hỗ trợ
    const compressor =
      typeof ctx.createDynamicsCompressor === 'function' ? ctx.createDynamicsCompressor() : null;
    if (compressor) {
      compressor.threshold.setValueAtTime(-18, now);
      compressor.knee.setValueAtTime(12, now);
      compressor.ratio.setValueAtTime(8, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.25, now);
    }

    // Dạng sóng Sine trong trẻo, không chói gắt
    osc.type = 'sine';

    // Dual-tone chime: Nốt E5 (659.25Hz) -> chuyển tiếp sang Nốt A5 (880Hz)
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(880.0, now + note1Duration);

    // Dynamic Gain Envelope đạt đỉnh 1.0 (100%) và tắt dần tự nhiên
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(safeVolume, now + attackTime);
    gainNode.gain.setValueAtTime(safeVolume, now + note1Duration);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + totalDuration);

    // Kết nối đồ thị âm thanh (Audio Graph Pipeline)
    osc.connect(gainNode);
    if (compressor) {
      gainNode.connect(compressor);
      compressor.connect(ctx.destination);
    } else {
      gainNode.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + totalDuration + 0.05);
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
