"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DetailModel } from "@/lib/derive/detail";
import { LINK_RELATIONS, type LinkRelation } from "@/lib/backoffice/types";
import { RELATION_LABEL } from "@/lib/format";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";

function Ref({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/workflow/${id}`}
      className="rounded-md border border-line-2 bg-panel-3 px-2 py-1 text-[12px] text-ink hover:border-accent"
    >
      {name}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function Relationships({
  workflowId,
  detail,
  options,
}: {
  workflowId: string;
  detail: DetailModel;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const r = detail.relationships;
  const [adding, setAdding] = useState(false);
  const [toId, setToId] = useState("");
  const [relation, setRelation] = useState<LinkRelation>("depends-on");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!toId) return;
    setBusy(true);
    await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromId: workflowId, toId, relation }),
    });
    setBusy(false);
    setAdding(false);
    setToId("");
    router.refresh();
  }

  async function remove(linkId: string) {
    await fetch(`/api/links?id=${linkId}`, { method: "DELETE" });
    router.refresh();
  }

  const hasAuto =
    r.callsOut.length || r.calledBy.length || r.sharedCredentials.length || r.agentTools.length;

  return (
    <Section
      title="Relationships"
      icon={<Icon name="map" size={14} />}
      aside={
        <Button variant="ghost" onClick={() => setAdding((v) => !v)}>
          + Add related
        </Button>
      }
    >
      {adding && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line-2 bg-panel-3 p-2.5">
          <select
            value={relation}
            onChange={(e) => setRelation(e.target.value as LinkRelation)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[12px]"
          >
            {LINK_RELATIONS.map((rel) => (
              <option key={rel} value={rel}>
                {RELATION_LABEL[rel]}
              </option>
            ))}
          </select>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="min-w-40 rounded-md border border-line bg-panel-2 px-2 py-1 text-[12px]"
          >
            <option value="">Select workflow…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={add} disabled={busy || !toId}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      )}

      {r.callsOut.length > 0 && (
        <Group label="Calls">
          {r.callsOut.map((x) => (
            <Ref key={x.id} {...x} />
          ))}
        </Group>
      )}
      {r.calledBy.length > 0 && (
        <Group label="Called by">
          {r.calledBy.map((x) => (
            <Ref key={x.id} {...x} />
          ))}
        </Group>
      )}
      {r.agentTools.length > 0 && (
        <Group label="Agent tools">
          {r.agentTools.map((t) => (
            <Chip key={t} tone="ai">
              {t}
            </Chip>
          ))}
        </Group>
      )}
      {r.sharedCredentials.map((sc) => (
        <Group key={sc.credentialName} label={`Shares ${sc.credentialName} with`}>
          {sc.with.map((x) => (
            <Ref key={x.id} {...x} />
          ))}
        </Group>
      ))}
      {r.manual.length > 0 && (
        <Group label="Manual links">
          {r.manual.map((m) => (
            <span
              key={m.linkId}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent-dim bg-accent-dim/40 px-2 py-1 text-[12px]"
            >
              <span className="text-[10px] text-accent">
                {m.direction === "outgoing" ? RELATION_LABEL[m.relation] : `${RELATION_LABEL[m.relation]} (in)`}
              </span>
              <Link href={`/workflow/${m.id}`} className="text-ink hover:text-accent">
                {m.name}
              </Link>
              <button
                onClick={() => remove(m.linkId)}
                aria-label="Remove link"
                className="text-faint hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </Group>
      )}

      {!hasAuto && r.manual.length === 0 && !adding && (
        <p className="text-[13px] text-muted">
          No detected or manual relationships yet.
        </p>
      )}

      {detail.ifBreaks.length > 0 && (
        <div className="mt-3 rounded-lg border border-danger-bd bg-danger-bg px-3 py-2.5 text-[12px] text-danger-fg">
          <b className="text-danger-strong">If this breaks →</b>{" "}
          {detail.ifBreaks.map((x) => x.name).join(", ")} may be affected.
        </div>
      )}
    </Section>
  );
}
