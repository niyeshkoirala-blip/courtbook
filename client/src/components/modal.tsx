import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal on native <dialog> (§3.6): the platform gives focus trap, Esc-close
 * and focus restore for free — no library needed.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // backdrop click
      className="m-auto w-full max-w-md rounded-card border border-white/10 bg-card p-0 text-ink shadow-2xl backdrop:bg-paper/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-xl uppercase tracking-wide text-ink">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
