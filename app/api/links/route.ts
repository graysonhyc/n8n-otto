import { NextResponse } from "next/server";
import { z } from "zod";
import { addLink, removeLink } from "@/lib/backoffice/store";
import { LINK_RELATIONS } from "@/lib/backoffice/types";

const Body = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  relation: z.enum(LINK_RELATIONS as [string, ...string[]]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (parsed.data.fromId === parsed.data.toId) {
    return NextResponse.json({ error: "Cannot link a workflow to itself" }, { status: 400 });
  }
  const link = await addLink({
    fromId: parsed.data.fromId,
    toId: parsed.data.toId,
    relation: parsed.data.relation as (typeof LINK_RELATIONS)[number],
  });
  return NextResponse.json({ link });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await removeLink(id);
  return NextResponse.json({ ok: true });
}
