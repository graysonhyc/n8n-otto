"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PromptDialog } from "@/components/ui/PromptDialog";

export function SopRenameButton({ id, current }: { id: string; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function rename(name: string) {
    if (name === current) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/process-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      setOpen(false);
      start(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} disabled={pending}>
        Rename
      </Button>
      <PromptDialog
        open={open}
        title="Rename process"
        initialValue={current}
        placeholder="Process name"
        busy={saving}
        onSubmit={rename}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
