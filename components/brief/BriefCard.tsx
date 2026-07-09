"use client";

import { useState } from "react";
import Link from "next/link";
import type { BriefItem, Severity } from "@/lib/brief/build";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

const STRIPE: Record<Severity, string> = {
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-[#5a5d68]",
};
const SEV_TONE: Record<Severity, Tone> = { high: "danger", medium: "warn", low: "neutral" };
const SEV_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

// Map a free-text action to an icon + whether it's the card's primary action.
function actionMeta(label: string): { icon: IconName; primary: boolean } {
  const l = label.toLowerCase();
  if (l.startsWith("open")) return { icon: "external", primary: false };
  if (l.includes("approval") || l.includes("review")) return { icon: "check", primary: true };
  if (l.includes("assign")) return { icon: "assign", primary: true };
  if (l.includes("rollback")) return { icon: "diff", primary: false };
  if (l.includes("ticket") || l.includes("linear")) return { icon: "external", primary: false };
  if (l.includes("mute")) return { icon: "mute", primary: false };
  if (l.includes("notify")) return { icon: "bell", primary: false };
  return { icon: "check", primary: false };
}

async function setState(key: string, status: "dismissed" | "acknowledged") {
  await fetch("/api/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, status }),
  });
}

export function BriefCard({ item }: { item: BriefItem }) {
  const { toast, toastUndo } = useToast();
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true); // optimistic — slide out immediately
    void setState(item.key, "dismissed");
    toastUndo("Dismissed", item.title, () => {
      setDismissed(false);
      void setState(item.key, "acknowledged");
    });
  }

  return (
    <div
      className={`grid grid-cols-[3px_1fr] overflow-hidden rounded-xl border border-line bg-panel-2 transition-[opacity,transform,margin,max-height] duration-200 hover:border-line-2 hover:shadow-[0_6px_22px_rgba(0,0,0,0.28)] ${
        dismissed ? "pointer-events-none -mt-[1px] max-h-0 translate-x-6 opacity-0" : "max-h-[520px]"
      }`}
    >
      <div className={STRIPE[item.severity]} />
      <div className="p-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <Pill tone={SEV_TONE[item.severity]}>{SEV_LABEL[item.severity]}</Pill>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.01em]">{item.title}</h3>
          {item.workflowId && (
            <span className="ml-auto font-mono text-[11px] text-faint">{item.workflowId}</span>
          )}
        </div>

        <dl className="grid grid-cols-[52px_1fr] gap-x-3.5 gap-y-1 text-[13px]">
          <dt className="pt-0.5 text-[10.5px] font-semibold tracking-wide text-faint uppercase">What</dt>
          <dd className="m-0 text-muted">{item.whatHappened}</dd>
          <dt className="pt-0.5 text-[10.5px] font-semibold tracking-wide text-faint uppercase">Why</dt>
          <dd className="m-0 text-muted">{item.whyItMatters}</dd>
          <dt className="pt-0.5 text-[10.5px] font-semibold tracking-wide text-faint uppercase">Owner</dt>
          <dd className="m-0 font-medium text-ink">{item.suggestedOwner}</dd>
          <dt className="pt-0.5 text-[10.5px] font-semibold tracking-wide text-faint uppercase">Next</dt>
          <dd className="m-0 font-medium text-ink">{item.recommendedAction}</dd>
        </dl>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {item.workflowId && (
            <Link
              href={`/workflow/${item.workflowId}`}
              className="inline-flex h-[29px] items-center gap-1.5 rounded-md border border-accent bg-accent px-2.5 text-[12px] font-semibold text-accent-ink hover:brightness-110"
            >
              <Icon name="external" size={13} />
              Open workflow
            </Link>
          )}
          {item.actions
            .filter((a) => !a.toLowerCase().startsWith("open"))
            .slice(0, 3)
            .map((a) => {
              const { icon, primary } = actionMeta(a);
              return (
                <button
                  key={a}
                  onClick={() => toast(a, { detail: item.title, variant: primary ? "accent" : "ok" })}
                  className={`inline-flex h-[29px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                    primary
                      ? "border-accent bg-accent text-accent-ink hover:brightness-110"
                      : "border-line-2 bg-panel-3 text-ink hover:bg-elev"
                  }`}
                >
                  <Icon name={icon} size={13} />
                  {a}
                </button>
              );
            })}
          <button
            onClick={dismiss}
            className="ml-auto rounded-md px-2.5 py-1.5 text-[12px] font-medium text-faint transition-colors hover:bg-panel-3 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
