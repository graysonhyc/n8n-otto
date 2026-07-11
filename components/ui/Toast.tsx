"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";

type Variant = "ok" | "accent" | "danger";

interface Toast {
  id: number;
  message: string;
  detail?: string;
  variant: Variant;
  undo?: () => void;
}

interface ToastApi {
  /** Fire-and-forget confirmation toast. */
  toast: (message: string, opts?: { detail?: string; variant?: Variant }) => void;
  /** Toast with a 5s Undo affordance — used for optimistic, reversible actions. */
  toastUndo: (message: string, detail: string, undo: () => void) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const ICON: Record<Variant, "check" | "send" | "warn"> = {
  ok: "check",
  accent: "send",
  danger: "warn",
};
const ICON_BG: Record<Variant, string> = {
  ok: "bg-ok",
  accent: "bg-accent",
  danger: "bg-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">, ttl: number) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      window.setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  const toast = useCallback<ToastApi["toast"]>(
    (message, opts) =>
      void push({ message, detail: opts?.detail, variant: opts?.variant ?? "ok" }, 2800),
    [push],
  );

  const toastUndo = useCallback<ToastApi["toastUndo"]>(
    (message, detail, undo) => void push({ message, detail, variant: "accent", undo }, 5200),
    [push],
  );

  return (
    <Ctx.Provider value={{ toast, toastUndo }}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in pointer-events-auto flex min-w-[280px] items-center gap-3 rounded-xl border border-line-2 bg-elev px-3.5 py-3 shadow-pop"
            role="status"
          >
            <span
              className={`grid h-5 w-5 flex-none place-items-center rounded-full text-white ${ICON_BG[t.variant]}`}
            >
              <Icon name={ICON[t.variant]} size={12} strokeWidth={2.6} />
            </span>
            <div className="text-[13px] font-medium">
              {t.message}
              {t.detail && (
                <div className="text-[11.5px] font-normal text-muted">{t.detail}</div>
              )}
            </div>
            {t.undo && (
              <button
                onClick={() => {
                  t.undo?.();
                  dismiss(t.id);
                }}
                className="ml-auto text-[12.5px] font-semibold text-accent hover:underline"
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
