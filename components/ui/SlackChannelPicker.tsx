"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
}

interface ChannelsResponse {
  connected: boolean;
  channels: SlackChannel[];
}

export function SlackChannelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (channel: SlackChannel | null) => void;
}) {
  const [state, setState] = useState<ChannelsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/slack/channels")
      .then((r) => r.json())
      .then((data: ChannelsResponse) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ connected: false, channels: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!state) {
    return <div className="text-[11px] text-faint">Loading channels…</div>;
  }

  if (!state.connected) {
    return (
      <a
        href="/api/slack/install"
        className="text-[11px] font-semibold text-accent hover:underline"
      >
        Connect Slack to route alerts →
      </a>
    );
  }

  const selected = state.channels.find((c) => c.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.channels.filter((c) => c.name.toLowerCase().includes(q))
    : state.channels;

  function pick(ch: SlackChannel | null) {
    onChange(ch);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative flex flex-col gap-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 rounded-md border bg-panel-3 px-2 py-1.5 text-[12px] transition-colors ${
          open ? "border-accent" : "border-line hover:border-line-2"
        }`}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-faint"}`}>
          {selected ? `#${selected.name}` : "Select channel…"}
        </span>
        <Icon
          name="chevron"
          size={14}
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-line-2 bg-panel-2 shadow-lg shadow-black/40">
          {state.channels.length > 6 && (
            <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
              <Icon name="search" size={12} className="shrink-0 text-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels"
                className="w-full bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-faint">No channels match.</div>
            ) : (
              filtered.map((c) => {
                const isSel = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                      isSel ? "bg-accent-dim text-accent" : "text-ink hover:bg-panel-3"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">#{c.name}</span>
                      {!c.isMember && (
                        <span className="shrink-0 rounded bg-panel-3 px-1 py-px text-[9.5px] uppercase tracking-wide text-faint">
                          invite bot
                        </span>
                      )}
                    </span>
                    {isSel && <Icon name="check" size={13} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {selected && !selected.isMember && (
        <span className="text-[10px] text-warn">Bot not in channel — invite it to post.</span>
      )}
    </div>
  );
}
