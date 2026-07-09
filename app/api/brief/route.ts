import { NextResponse } from "next/server";
import { z } from "zod";
import { setBriefState } from "@/lib/backoffice/store";

const Body = z.object({
  key: z.string().min(1),
  status: z.enum(["dismissed", "acknowledged"]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await setBriefState(parsed.data.key, parsed.data.status);
  return NextResponse.json({ ok: true });
}
