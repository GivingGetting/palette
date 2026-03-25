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

// Use globalThis to survive Next.js hot-module reloads in dev mode
const g = globalThis as typeof globalThis & { __palette_tasks__?: Map<string, Task> };
if (!g.__palette_tasks__) g.__palette_tasks__ = new Map();
const tasks = g.__palette_tasks__;

export function createTask(id: string): Task {
  const task: Task = { id, status: "queued", createdAt: Date.now() };
  tasks.set(id, task);
  return task;
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function updateTask(id: string, patch: Partial<Task>) {
  const task = tasks.get(id);
  if (task) tasks.set(id, { ...task, ...patch });
}
