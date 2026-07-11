import { NextResponse } from "next/server";
import { z } from "zod";
import { dismissOwnerSuggestion } from "@/lib/backoffice/store";

const Body = z.object({ workflowId: z.string().min(1) });

// ✗ on a suggested owner: hide the suggestion for this workflow. It won't be
// re-suggested until an owner is assigned; the row falls back to "Unassigned".
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await dismissOwnerSuggestion(parsed.data.workflowId);
  return NextResponse.json({ ok: true });
}
