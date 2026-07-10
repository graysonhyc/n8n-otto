import { NextResponse } from "next/server";
import { z } from "zod";
import { setSuggestionState } from "@/lib/backoffice/store";

const Body = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await setSuggestionState(parsed.data.id, "dismissed");
  return NextResponse.json({ ok: true });
}
