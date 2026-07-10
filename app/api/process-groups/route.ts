import { NextResponse } from "next/server";
import { z } from "zod";
import { setProcessGroupName } from "@/lib/backoffice/store";

const Body = z.object({
  key: z.string().startsWith("pg:"),
  name: z.string().trim().min(1).max(60),
});

export async function PATCH(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await setProcessGroupName(parsed.data.key, parsed.data.name);
  return NextResponse.json({ ok: true });
}
