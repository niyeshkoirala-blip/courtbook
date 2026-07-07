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
      className="m-auto w-full max-w-md rounded-card bg-white p-0 shadow-xl backdrop:bg-ink/50"
    >
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-xl uppercase tracking-wide text-pitch">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
