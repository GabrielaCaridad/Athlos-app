import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: string; type: ToastType; message: string };

type ToastContextValue = {
  notify: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
// Estado expuesto para host de toasts (lista + remove)
const ToastItemsContext = createContext<
  | { toasts: Toast[]; remove: (id: string) => void }
  | undefined
>(undefined);

function generateId() {
  try {
    const uuid = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
      ?.crypto?.randomUUID?.();
    if (uuid && typeof uuid === 'string') return uuid;
  } catch {
    // ignore
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, type, message }]);
    // Auto dismiss in 3.2s
    window.setTimeout(() => remove(id), 3200);
  }, [remove]);

  const api = useMemo<ToastContextValue>(() => ({
    notify,
    success: (m) => notify(m, 'success'),
    error: (m) => notify(m, 'error'),
    info: (m) => notify(m, 'info'),
  }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      <ToastItemsContext.Provider value={{ toasts, remove }}>
        {children}
        {/* La lista de toasts se renderiza mediante ToastHost (portal) */}
      </ToastItemsContext.Provider>
    </ToastContext.Provider>
  );
}

export function ToastItem({ type, message, onClose }: { type: ToastType; message: string; onClose: () => void }) {
  // Simple fade-out on unmount
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 2800);
    return () => window.clearTimeout(t);
  }, []);

  const base = 'px-4 py-3 rounded-xl shadow-lg border text-sm backdrop-blur-md';
  const styles = type === 'success'
    ? 'bg-green-50 border-green-200 text-green-800'
    : type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-gray-50 border-gray-200 text-gray-800';

  return (
    <div className={`${base} ${styles} transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <div className="flex-1">{message}</div>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">✖</button>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToastItems() {
  const ctx = useContext(ToastItemsContext);
  if (!ctx) throw new Error('useToastItems must be used within a ToastProvider');
  return ctx;
}
