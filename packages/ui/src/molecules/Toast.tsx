import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed right-5 bottom-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-[#1c302b] text-white rounded-[8px] py-3 px-4 shadow-[0_9px_24px_rgba(16,38,28,0.18)] text-sm font-medium flex items-center gap-2.5 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 border border-[#2b443c]"
          >
            <span
              className={
                t.type === 'error'
                  ? 'text-[#f28b82] font-bold'
                  : t.type === 'info'
                  ? 'text-[#8ab4f8] font-bold'
                  : 'text-[#85d3a7] font-bold'
              }
            >
              {t.type === 'error' ? '!' : '✓'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
