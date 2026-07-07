import { create } from 'zustand';

/** Global toasts (§3.0): success auto-dismiss 4s, errors sticky-ish (8s). */
export interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (type: Toast['type'], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (type, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      type === 'success' ? 4000 : 8000,
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push('success', m),
  error: (m: string) => useToasts.getState().push('error', m),
};
