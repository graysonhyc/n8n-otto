"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function SopRenameButton({ id, current }: { id: string; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function rename() {
    const name = window.prompt("Rename process", current);
    if (!name?.trim() || name.trim() === current) return;
    void fetch("/api/process-groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: name.trim() }),
    }).then(() => start(() => router.refresh()));
  }

  return (
    <Button variant="ghost" onClick={rename} disabled={pending}>
      Rename
    </Button>
  );
}
