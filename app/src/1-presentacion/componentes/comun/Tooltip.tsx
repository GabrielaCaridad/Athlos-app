/**
 * Tooltip (informativo) simple con control interno.
 * Click para abrir/cerrar; cierra con click fuera o Escape.
 */ 
import { useEffect, useRef, useState } from 'react';

type TooltipProps = {
  content: string;
  isDark?: boolean;
  side?: 'top' | 'bottom';
  children: React.ReactNode;
};

export default function Tooltip({ content, isDark = false, side = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center">
        {children}
        <span className="sr-only">Mostrar ayuda</span>
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 whitespace-pre-line rounded px-2 py-1 text-xs shadow-lg z-50 ${isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200'}`}
        >
          {content}
        </div>
      )}
    </span>
  );
}
