import { createPortal } from 'react-dom';
import { ToastItem, useToastItems } from './ToastProvider';

// ToastHost: portal global para mostrar toasts por encima de cualquier overlay/modal.
// Contenedor: fixed top-4 right-4 z-[2147483647] w-[calc(100vw-2rem)] max-w-sm pointer-events-none
export default function ToastHost() {
  const { toasts, remove } = useToastItems();

  const container = (
    <div className="fixed top-4 right-4 z-[2147483647] w-[calc(100vw-2rem)] max-w-sm pointer-events-none space-y-2">
      <div className="pointer-events-auto">
        {toasts.map(t => (
          <ToastItem key={t.id} type={t.type} message={t.message} onClose={() => remove(t.id)} />
        ))}
      </div>
    </div>
  );

  return createPortal(container, document.body);
}
