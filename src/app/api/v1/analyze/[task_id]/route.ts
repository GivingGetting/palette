import { NextResponse } from "next/server";
import { getTask } from "@/lib/store/tasks";

export async function GET(_req: Request, { params }: { params: Promise<{ task_id: string }> }) {
  const { task_id } = await params;
  const task = getTask(task_id);

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
