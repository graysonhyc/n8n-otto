"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BriefItem, Severity } from "@/lib/brief/build";
import { Pill, type Tone } from "@/components/ui/Pill";

const STRIPE: Record<Severity, string> = {
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-[#5a5a66]",
};

const SEV_TONE: Record<Severity, Tone> = {
  high: "danger",
  medium: "warn",
  low: "neutral",
};

const SEV_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function BriefCard({ item }: { item: BriefItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    await fetch("/api/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: item.key, status: "dismissed" }),
    });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[4px_1fr] overflow-hidden rounded-xl border border-line bg-panel-2">
      <div className={STRIPE[item.severity]} />
      <div className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <Pill tone={SEV_TONE[item.severity]}>{SEV_LABEL[item.severity]}</Pill>
          <h3 className="text-[14.5px] font-semibold">{item.title}</h3>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="pt-0.5 text-[11px] uppercase tracking-wide text-faint">What</dt>
          <dd className="m-0 text-muted">{item.whatHappened}</dd>
          <dt className="pt-0.5 text-[11px] uppercase tracking-wide text-faint">Why</dt>
          <dd className="m-0 text-muted">{item.whyItMatters}</dd>
          <dt className="pt-0.5 text-[11px] uppercase tracking-wide text-faint">Owner</dt>
          <dd className="m-0 text-ink">{item.suggestedOwner}</dd>
          <dt className="pt-0.5 text-[11px] uppercase tracking-wide text-faint">Next</dt>
          <dd className="m-0 text-ink">{item.recommendedAction}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.workflowId && (
            <Link
              href={`/workflow/${item.workflowId}`}
              className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:brightness-110"
            >
              Open workflow
            </Link>
          )}
          {item.actions.slice(0, 3).map((a) => (
            <span
              key={a}
              className="rounded-lg border border-line-2 bg-panel-3 px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {a}
            </span>
          ))}
          <button
            onClick={dismiss}
            disabled={busy}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
