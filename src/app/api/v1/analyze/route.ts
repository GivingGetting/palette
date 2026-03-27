import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createTask, updateTask } from "@/lib/store/tasks";
import { addToLibrary } from "@/lib/store/library";
import { analyzeUrl, analyzeImage } from "@/lib/analyzer";
import { createServerClient, extractToken } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerClient(token);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { source_type, url, image, media_type, engine, anthropic_key } = body;

  if (source_type === "url" && !url) {
    return NextResponse.json({ error: { code: "bad_request", message: "url required" } }, { status: 400 });
  }
  if (source_type === "image" && !image) {
    return NextResponse.json({ error: { code: "bad_request", message: "image required" } }, { status: 400 });
  }

  const task_id = randomUUID();
  await createTask(db, user.id, task_id);

  void (async () => {
    await updateTask(db, task_id, { status: "processing" });
    const onProgress = (step: string, percent: number) => updateTask(db, task_id, { step, percent });

    try {
      const { styleDna } =
        source_type === "url"
          ? await analyzeUrl(url, { onProgress, engine, anthropicApiKey: anthropic_key })
          : await analyzeImage(image, { onProgress, mediaType: media_type, engine, anthropicApiKey: anthropic_key });

      await addToLibrary(db, user.id, task_id, styleDna);
      await updateTask(db, task_id, { status: "done", result: styleDna, step: "完成", percent: 1 });
    } catch (err) {
      await updateTask(db, task_id, {
        status: "failed",
        error: err instanceof Error ? err.message : "未知错误",
      });
    }
  })();

  return NextResponse.json(
    { task_id, status: "queued", poll_url: `/api/v1/analyze/${task_id}` },
    { status: 202 }
  );
}
