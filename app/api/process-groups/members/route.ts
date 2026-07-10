import { NextResponse } from "next/server";
import { z } from "zod";
import { assignMember, reorderMembers, unassignMember } from "@/lib/backoffice/store";

// Assign a workflow into an SOP (moves it if already assigned elsewhere).
const AssignBody = z.object({
  workflowId: z.string().min(1),
  groupId: z.string().min(1),
});

const UnassignBody = z.object({ workflowId: z.string().min(1) });

const ReorderBody = z.object({
  groupId: z.string().min(1),
  orderedWorkflowIds: z.array(z.string().min(1)),
});

export async function POST(request: Request) {
  const parsed = AssignBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await assignMember(parsed.data.workflowId, parsed.data.groupId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = UnassignBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await unassignMember(parsed.data.workflowId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const parsed = ReorderBody.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await reorderMembers(parsed.data.groupId, parsed.data.orderedWorkflowIds);
  return NextResponse.json({ ok: true });
}
