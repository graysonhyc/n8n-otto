import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "default" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent border-accent text-accent-ink hover:brightness-110",
  default: "bg-panel-3 border-line-2 text-ink hover:bg-panel-2",
  ghost: "bg-transparent border-transparent text-muted hover:text-ink",
};

export function Button({
  variant = "default",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
