import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: ToastAction;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  show: (t: Omit<Toast, 'id' | 'durationMs' | 'tone'> & Partial<Pick<Toast, 'durationMs' | 'tone'>>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (t) => {
    const id = nextId++;
    const toast: Toast = { id, tone: 'info', durationMs: 3500, ...t };
    // Keep at most 3 visible.
    set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (message: string, action?: ToastAction, durationMs?: number) =>
    useToastStore.getState().show({ message, action, tone: 'info', ...(durationMs ? { durationMs } : {}) }),
  success: (message: string, action?: ToastAction, durationMs?: number) =>
    useToastStore.getState().show({ message, action, tone: 'success', ...(durationMs ? { durationMs } : {}) }),
  error: (message: string, durationMs = 6000) =>
    useToastStore.getState().show({ message, tone: 'error', durationMs }),
};
