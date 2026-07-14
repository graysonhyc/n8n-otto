"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BriefItem, Severity } from "@/lib/brief/build";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SlackChannelPicker, type SlackChannel } from "@/components/ui/SlackChannelPicker";

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
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  // Inline owner-assignment: the chosen Slack channel name doubles as the owner
  // "team" routing key, so assigning here makes that team's channel receive this
  // workflow's future briefs (same path as the registry's OwnerAssign).
  const [assigning, setAssigning] = useState(false);
  const [channel, setChannel] = useState<SlackChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  function dismiss() {
    setDismissed(true); // optimistic — slide out immediately
    void setState(item.key, "dismissed");
    toastUndo("Dismissed", item.title, () => {
      setDismissed(false);
      void setState(item.key, "acknowledged");
    });
  }

  // Handle a card action. "Assign owner" opens the channel picker (only if the
  // item is tied to a workflow); everything else is a stub toast for the demo.
  function onAction(label: string) {
    if (label.toLowerCase().includes("assign") && item.workflowId) {
      setAssigning((v) => !v);
      return;
    }
    toast(label, { detail: item.title, variant: actionMeta(label).primary ? "accent" : "ok" });
  }

  async function saveOwner() {
    if (!channel || !item.workflowId) return;
    setSaving(true);
    const res = await fetch("/api/owners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId: item.workflowId,
        team: channel.name, // channel name is the routing key downstream
        slackChannelId: channel.id,
        slackChannelName: channel.name,
      }),
    });
    setSaving(false);
    setAssigning(false);
    if (!res.ok) {
      toast("Couldn't assign owner", { detail: item.title, variant: "danger" });
      return;
    }
    const label = channel.name.replace(/^#+/, "");
    toast(`Assigned to #${label}`, {
      detail: `#${label} will now receive this brief`,
      variant: "accent",
    });
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={`rounded-xl border border-line bg-panel shadow-card transition-[opacity,transform,margin,box-shadow,border-color] duration-200 hover:border-line-2 hover:shadow-card-hover ${
        dismissed
          ? "pointer-events-none -mt-[1px] max-h-0 translate-x-6 overflow-hidden opacity-0"
          : assigning
            ? "overflow-visible" // let the channel dropdown escape the card
            : "max-h-[520px] overflow-hidden"
      }`}
    >
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
            // Drop "Assign owner" once the workflow already has a confirmed
            // owner — the Owner row above shows the team instead.
            .filter((a) => !(item.owned && a.toLowerCase().includes("assign")))
            .slice(0, 3)
            .map((a) => {
              const { icon, primary } = actionMeta(a);
              const isAssign = a.toLowerCase().includes("assign") && !!item.workflowId;
              return (
                <button
                  key={a}
                  onClick={() => onAction(a)}
                  aria-expanded={isAssign ? assigning : undefined}
                  className={`inline-flex h-[29px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                    primary
                      ? "border-accent-line bg-accent-dim text-accent-strong hover:border-accent"
                      : "border-line-2 bg-panel text-ink hover:bg-panel-2"
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

        {assigning && (
          <div className="mt-3 flex w-64 flex-col gap-2 rounded-lg border border-line-2 bg-panel-2 p-2.5">
            <SlackChannelPicker value={channel?.id ?? null} onChange={setChannel} />
            <div className="flex gap-2">
              <Button variant="primary" onClick={saveOwner} disabled={saving || !channel}>
                {saving ? "Saving…" : "Assign & route brief"}
              </Button>
              <Button variant="ghost" onClick={() => setAssigning(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
