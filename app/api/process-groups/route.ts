import { NextResponse } from "next/server";
import { z } from "zod";
import { createSop, deleteSop, updateSop } from "@/lib/backoffice/store";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().min(1)).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

const UpdateBody = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

const DeleteBody = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = CreateBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const sop = await createSop(
    parsed.data.name,
    parsed.data.memberIds ?? [],
    parsed.data.description ?? null,
  );
  return NextResponse.json(sop);
}

export async function PATCH(request: Request) {
  const parsed = UpdateBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  await updateSop(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = DeleteBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await deleteSop(parsed.data.id);
  return NextResponse.json({ ok: true });
}
