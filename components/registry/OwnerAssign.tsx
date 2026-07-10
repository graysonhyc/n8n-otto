"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistryItem } from "@/lib/derive/registry";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SlackChannelPicker, type SlackChannel } from "@/components/ui/SlackChannelPicker";

// Inline ownership cell: shows the confirmed owner, or an "Assign" affordance
// that reads the live Slack channels to pick a routing target.
export function OwnerAssign({ item }: { item: RegistryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(item.owner?.team ?? "");
  const [channel, setChannel] = useState<SlackChannel | null>(
    item.owner?.slackChannelId
      ? { id: item.owner.slackChannelId, name: item.owner.slackChannelName ?? "", isMember: true }
      : null,
  );
  const [saving, setSaving] = useState(false);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    await fetch("/api/owners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function save() {
    if (!team.trim()) return;
    await post({
      workflowId: item.id,
      team: team.trim(),
      slackChannelId: channel?.id ?? null,
      slackChannelName: channel?.name ?? null,
    });
  }

  // One-click accept of the classifier's suggestion — provenance kept as "inferred".
  async function applySuggestion() {
    const s = item.suggestedOwner;
    if (!s) return;
    await post({
      workflowId: item.id,
      team: s.team,
      reasoning: s.reasoning,
      source: "inferred",
    });
  }

  if (!open) {
    if (item.owner) {
      return (
        <button onClick={() => setOpen(true)} title="Edit owner" className="group text-left">
          <span className="flex items-center gap-1.5 text-ink">
            {item.owner.team}
            <Icon
              name="pencil"
              size={12}
              className="shrink-0 text-faint transition-colors group-hover:text-muted"
            />
          </span>
          {item.owner.slackChannelName && (
            <span className="block text-[11px] text-accent">{item.owner.slackChannelName}</span>
          )}
        </button>
      );
    }

    if (item.suggestedOwner) {
      const { team: sTeam, confidence } = item.suggestedOwner;
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-faint">Suggested</span>
            <span className="text-ink">{sTeam}</span>
            <span
              className={`rounded px-1 py-px text-[9.5px] uppercase tracking-wide ${
                confidence === "high"
                  ? "bg-accent-dim text-accent"
                  : "bg-panel-3 text-muted"
              }`}
            >
              {confidence}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={applySuggestion}
              disabled={saving}
              className="rounded-md border border-accent-dim bg-accent-dim px-2 py-0.5 text-[11px] font-semibold text-accent hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Applying…" : "Apply"}
            </button>
            <button
              onClick={() => setOpen(true)}
              className="text-[11px] text-muted hover:text-ink hover:underline"
            >
              Edit
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-danger hover:underline"
      >
        Unassigned — assign
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-2 rounded-lg border border-line-2 bg-panel-2 p-2.5">
      <input
        autoFocus
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Owner team (e.g. Support Ops)"
        className="rounded-md border border-line bg-panel-3 px-2 py-1 text-[12px] text-ink placeholder:text-faint"
      />
      <SlackChannelPicker value={channel?.id ?? null} onChange={setChannel} />
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || !team.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
