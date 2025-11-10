import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, MouseEvent } from 'react';

// Minimal AlertDialog implementation compatible with shadcn/ui API used in this project.
// Controlled via `open` prop and `onOpenChange`. Renders portal to document.body.

type Ctx = { open: boolean; setOpen: (v: boolean) => void };
const AlertDialogCtx = createContext<Ctx | undefined>(undefined);

export function AlertDialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (v: boolean) => void; children: ReactNode }) {
  const setOpen = (v: boolean) => onOpenChange?.(v);
  return (
    <AlertDialogCtx.Provider value={{ open, setOpen }}>
      {children}
    </AlertDialogCtx.Provider>
  );
}

export function AlertDialogContent({ children }: { children: ReactNode }) {
  const ctx = useContext(AlertDialogCtx);
  if (!ctx?.open) return null;
  const handleOverlayClick = () => ctx.setOpen(false);
  const stop = (e: MouseEvent) => e.stopPropagation();
  const node = (
    <div className="fixed inset-0 z-[2147483600] flex items-center justify-center p-4" onClick={handleOverlayClick}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-xl p-6 shadow-xl border bg-white text-gray-900" onClick={stop}>
        {children}
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

export function AlertDialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-2">{children}</div>;
}
export function AlertDialogTitle({ children }: { children: ReactNode }) {
  return <div className="text-lg font-bold">{children}</div>;
}
export function AlertDialogDescription({ children }: { children: ReactNode }) {
  return <div className="text-sm text-gray-600 mt-1">{children}</div>;
}
export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex items-center justify-end gap-2">{children}</div>;
}
export function AlertDialogCancel({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const ctx = useContext(AlertDialogCtx);
  return (
    <button type="button" onClick={() => { onClick?.(); ctx?.setOpen(false); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium">
      {children}
    </button>
  );
}
export function AlertDialogAction({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-semibold ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
}
