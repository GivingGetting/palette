import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleDNA } from "@/lib/analyzer/schema";

export type TaskStatus = "queued" | "processing" | "done" | "failed";

export interface Task {
  id: string;
  status: TaskStatus;
  step?: string;
  percent?: number;
  result?: StyleDNA;
  error?: string;
  createdAt: number;
}

export async function createTask(db: SupabaseClient, userId: string, id: string): Promise<void> {
  await db.from("tasks").insert({ id, user_id: userId, status: "queued", created_at: Date.now() });
}

export async function getTask(db: SupabaseClient, id: string): Promise<Task | null> {
  const { data } = await db.from("tasks").select("*").eq("id", id).single();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    step: data.step ?? undefined,
    percent: data.percent ?? undefined,
    result: data.result ?? undefined,
    error: data.error ?? undefined,
    createdAt: data.created_at,
  };
}

export async function updateTask(db: SupabaseClient, id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.step !== undefined) update.step = patch.step;
  if (patch.percent !== undefined) update.percent = patch.percent;
  if (patch.result !== undefined) update.result = patch.result;
  if (patch.error !== undefined) update.error = patch.error;
  await db.from("tasks").update(update).eq("id", id);
}
