import { NextResponse } from "next/server";
import { z } from "zod";
import { setOwner } from "@/lib/backoffice/store";

const Body = z.object({
  workflowId: z.string().min(1),
  team: z.string().min(1),
  slackChannelId: z.string().nullable().optional(),
  slackChannelName: z.string().nullable().optional(),
  escalationChannelId: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  // "inferred" when applying a classifier suggestion; defaults to "confirmed"
  // for a manual assignment. Either way a human clicked, so confirmed is true.
  source: z.enum(["inferred", "confirmed"]).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const owner = await setOwner({
    ...parsed.data,
    source: parsed.data.source ?? "confirmed",
    confirmed: true,
  });
  return NextResponse.json({ owner });
}
