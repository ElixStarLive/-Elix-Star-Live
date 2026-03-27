import React, { useState, useEffect, useCallback, useRef } from 'react';

interface DialogState {
  type: 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  resolve: (value: boolean | string | null) => void;
}

let showDialogFn: ((state: Omit<DialogState, 'resolve'>) => Promise<boolean | string | null>) | null = null;

export function nativeConfirm(message: string, title = 'Confirm'): Promise<boolean> {
  if (!showDialogFn) return Promise.resolve(window.confirm(message));
  return showDialogFn({ type: 'confirm', title, message }) as Promise<boolean>;
}

export function nativePrompt(message: string, defaultValue = '', title = ''): Promise<string | null> {
  if (!showDialogFn) return Promise.resolve(window.prompt(message, defaultValue));
  return showDialogFn({ type: 'prompt', title, message, defaultValue }) as Promise<string | null>;
}

export function NativeDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    showDialogFn = (state) => {
      return new Promise((resolve) => {
        setDialog({ ...state, resolve });
        if (state.type === 'prompt') setInputValue(state.defaultValue || '');
      });
    };
    return () => { showDialogFn = null; };
  }, []);

  useEffect(() => {
    if (dialog?.type === 'prompt' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [dialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(true);
    else dialog.resolve(inputValue);
    setDialog(null);
  }, [dialog, inputValue]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(false);
    else dialog.resolve(null);
    setDialog(null);
  }, [dialog]);

  return (
    <>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 px-6"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
        >
          <div
            className="w-full max-w-[320px] bg-[#1C1E24] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            role="alertdialog"
            aria-modal="true"
          >
            {dialog.title && (
              <div className="px-5 pt-5 pb-2">
                <h3 className="text-white font-bold text-base text-center">{dialog.title}</h3>
              </div>
            )}
            <div className="px-5 pb-4 pt-1">
              <p className="text-white/70 text-sm text-center leading-relaxed">{dialog.message}</p>
            </div>
            {dialog.type === 'prompt' && (
              <div className="px-5 pb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                  className="w-full px-3 py-2.5 bg-black/40 border border-white/20 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-[#C9A96E]/60"
                  autoFocus
                />
              </div>
            )}
            <div className="flex border-t border-white/10">
              <button
                onClick={handleCancel}
                className="flex-1 py-3.5 text-white/60 text-sm font-medium active:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <div className="w-px bg-white/10" />
              <button
                onClick={handleConfirm}
                className="flex-1 py-3.5 text-[#C9A96E] text-sm font-bold active:bg-white/5 transition-colors"
              >
                {dialog.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
