"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { StyleDNA } from "@/lib/analyzer/schema";
import StyleDnaReport from "@/components/StyleDnaReport";

type Status = "queued" | "processing" | "done" | "failed";

interface PollResponse {
  task_id: string;
  status: Status;
  progress?: { step: string; percent: number };
  result?: StyleDNA;
  error?: string;
}

export default function AnalyzePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PollResponse | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(`/api/v1/analyze/${id}`);

        // Task not found (e.g. after server restart) — try library
        if (res.status === 404) {
          const libRes = await fetch(`/api/v1/library/${id}`);
          if (libRes.ok) {
            const libData = await libRes.json();
            setData({ task_id: id, status: "done", result: libData.result });
          } else {
            setData({ task_id: id, status: "failed", error: "记录不存在或已过期，请重新解析" });
          }
          return;
        }

        const json: PollResponse = await res.json();
        if (!stopped) setData(json);

        if (json.status === "queued" || json.status === "processing") {
          timer = setTimeout(poll, 1500);
        }
      } catch {
        if (!stopped) timer = setTimeout(poll, 3000);
      }
    }

    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id]);

  // ── Loading / progress ──────────────────────────────────────────────────────
  if (!data || data.status === "queued" || data.status === "processing") {
    const step = data?.progress?.step ?? "正在启动…";
    const pct = data?.progress?.percent ?? 0;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">{step}</p>
        </div>
        <div className="w-64">
          <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #F97316, #EF4444)" }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] text-right mt-1">{pct}%</p>
        </div>
      </div>
    );
  }

  // ── Failed ──────────────────────────────────────────────────────────────────
  if (data.status === "failed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-semibold">解析失败</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-sm">{data.error}</p>
        <a href="/" className="btn-primary px-5 py-2.5 text-sm mt-2">重新解析</a>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  if (!data.result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">加载数据中…</p>
      </div>
    );
  }

  return <StyleDnaReport dna={data.result} taskId={id} />;
}
