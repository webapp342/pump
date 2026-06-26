export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
};

type ToastListener = (item: ToastItem) => void;

const listeners = new Set<ToastListener>();

function emit(item: ToastItem) {
  for (const listener of listeners) {
    listener(item);
  }
}

function createToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pushToast(
  tone: ToastTone,
  title: string,
  description?: string,
  durationMs = tone === "error" ? 6_000 : 4_000
) {
  emit({
    id: createToastId(),
    tone,
    title,
    description,
    durationMs,
  });
}

export const toast = {
  success(title: string, description?: string) {
    pushToast("success", title, description);
  },
  error(title: string, description?: string) {
    pushToast("error", title, description);
  },
  info(title: string, description?: string) {
    pushToast("info", title, description);
  },
};
