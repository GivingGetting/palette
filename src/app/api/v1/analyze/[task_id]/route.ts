import { NextResponse } from "next/server";
import { getTask } from "@/lib/store/tasks";
import { createServerClient, extractToken } from "@/lib/supabase-server";

export async function GET(req: Request, { params }: { params: Promise<{ task_id: string }> }) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task_id } = await params;
  const db = createServerClient(token);
  const task = await getTask(db, task_id);

  if (!task) {
    return NextResponse.json({ error: { code: "not_found", message: "Task not found" } }, { status: 404 });
  }

  return NextResponse.json({
    task_id: task.id,
    status: task.status,
    ...(task.status === "processing" && {
      progress: { step: task.step ?? "", percent: Math.round((task.percent ?? 0) * 100) },
    }),
    ...(task.status === "done" && { result: task.result }),
    ...(task.status === "failed" && { error: task.error }),
  });
}
