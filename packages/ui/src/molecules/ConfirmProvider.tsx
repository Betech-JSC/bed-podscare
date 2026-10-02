'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ConfirmModal, ConfirmVariant } from './ConfirmModal';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  eyebrow?: string;
}

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

interface ConfirmContextType {
  confirm: ConfirmFn;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = (): ConfirmFn => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((optionsOrMessage) => {
    return new Promise<boolean>((resolve) => {
      const options: ConfirmOptions =
        typeof optionsOrMessage === 'string'
          ? { title: 'Xác nhận thao tác', description: optionsOrMessage }
          : {
              ...optionsOrMessage,
              description: optionsOrMessage.description || optionsOrMessage.message,
            };

      resolveRef.current = resolve;
      setState({ options, resolve });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setState(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <ConfirmModal
          isOpen={Boolean(state)}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title={state.options.title}
          description={state.options.description}
          confirmText={state.options.confirmText}
          cancelText={state.options.cancelText}
          variant={state.options.variant}
          eyebrow={state.options.eyebrow}
        />
      )}
    </ConfirmContext.Provider>
  );
};
