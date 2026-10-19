import { create } from 'zustand';
import { describeError } from './ipc';

/**
 * Toast ringan (tanpa dependensi UI). Dipakai untuk error envelope yang harus
 * terlihat walau panel asalnya tertutup — mis. `ERR_PROVIDER_INCOMPATIBLE`
 * (§5.2.1: toast + saran ganti provider/model).
 */

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  suggestion: string | null;
}

interface ToastStore {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (toast) => {
    seq += 1;
    const id = `toast-${Date.now()}-${seq}`;
    // Maksimal 3 toast agar tidak menumpuk menutupi editor.
    set((s) => ({ items: [...s.items.slice(-2), { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
  clear: () => set({ items: [] }),
}));

export function toast(item: Omit<ToastItem, 'id'>): string {
  return useToastStore.getState().push(item);
}

export function toastSuccess(message: string): string {
  return toast({ kind: 'success', message, suggestion: null });
}

export function toastInfo(message: string, suggestion: string | null = null): string {
  return toast({ kind: 'info', message, suggestion });
}

/** §5.2.1: pesan + saran tindakan, tanpa pernah menampilkan `details` mentah. */
export function toastError(error: unknown): string {
  const view = describeError(error);
  return toast({ kind: 'error', message: view.message, suggestion: view.suggestion });
}
