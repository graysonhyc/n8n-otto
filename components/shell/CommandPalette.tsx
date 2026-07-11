"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

interface Command {
  group: string;
  label: string;
  icon: IconName;
  run: () => void | Promise<void>;
}

// Opened globally with ⌘K / Ctrl-K, or by dispatching `open-command-palette`
// (the top-bar search button does this) so there's a single source of truth.
export const OPEN_EVENT = "open-command-palette";

export function CommandPalette() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      { group: "Navigate", label: "Go to Brief", icon: "shield", run: () => router.push("/brief") },
      { group: "Navigate", label: "Go to Registry", icon: "table", run: () => router.push("/registry") },
      {
        group: "Actions",
        label: "Rescan all workflows now",
        icon: "rescan",
        run: async () => {
          toast("Rescanning workflows…");
          const res = await fetch("/api/sync", { method: "POST" });
          const { changed } = await res.json().catch(() => ({ changed: 0 }));
          toast(changed ? `${changed} change(s) detected` : "Scan complete — no new changes");
          router.refresh();
        },
      },
      {
        group: "Actions",
        label: "Send brief to Slack",
        icon: "send",
        run: async () => {
          const res = await fetch("/api/slack/brief", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          toast(res.ok ? `Posted to ${data.channel ?? "Slack"}` : data.error ?? "Slack not connected", {
            variant: res.ok ? "accent" : "danger",
          });
        },
      },
    ],
    [router, toast],
  );

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const runAt = useCallback(
    (i: number) => {
      const cmd = results[i];
      if (!cmd) return;
      close();
      void cmd.run();
    },
    [results, close],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        runAt(active);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open, results.length, active, runAt, close]);

  useEffect(() => {
    if (open) {
      setActive(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <>
      <div
        className="fixed inset-0 z-[50] bg-[rgba(20,20,26,0.32)] backdrop-blur-[2px]"
        onClick={close}
      />
      <div className="animate-overlay-in fixed top-[88px] left-1/2 z-[51] w-[min(600px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Icon name="search" size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line-2 border-b-2 bg-panel-3 px-1.5 font-mono text-[11px] text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-muted">No matching commands</div>
          )}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <div key={cmd.label}>
                {header && (
                  <div className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.09em] text-faint uppercase">
                    {header}
                  </div>
                )}
                <button
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13.5px] ${
                    i === active ? "bg-accent-dim" : ""
                  }`}
                >
                  <Icon
                    name={cmd.icon}
                    size={15}
                    className={i === active ? "text-accent" : "text-muted"}
                  />
                  {cmd.label}
                  {i === active && <span className="ml-auto font-mono text-[11px] text-faint">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
