"use client";

import { useEffect, useState } from "react";

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

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value ?? ""}
        onChange={(e) => {
          const ch = state.channels.find((c) => c.id === e.target.value) ?? null;
          onChange(ch);
        }}
        className="rounded-md border border-line bg-panel-3 px-2 py-1 text-[12px] text-ink"
      >
        <option value="">Select channel…</option>
        {state.channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
            {c.isMember ? "" : " (invite bot)"}
          </option>
        ))}
      </select>
      {value && !state.channels.find((c) => c.id === value)?.isMember && (
        <span className="text-[10px] text-warn">Bot not in channel — invite it to post.</span>
      )}
    </div>
  );
}
