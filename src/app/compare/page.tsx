"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { StyleDNA } from "@/lib/analyzer/schema";
import { buildStylePrompt } from "@/lib/analyzer/prompt";
import { generateComfyUI } from "@/lib/comfyui-client";

const MODELS = [
  { key: "gpt-4o",             label: "DALL-E 3",         vendor: "OpenAI",    color: "#10a37f", keyId: "openai" },
  { key: "gemini-flash-image", label: "Gemini Flash Image", vendor: "Google",  color: "#4285f4", keyId: "google" },
  { key: "ideogram-v2",        label: "Ideogram v2",       vendor: "Ideogram", color: "#7c3aed", keyId: "ideogram" },
  { key: "comfyui",            label: "ComfyUI",           vendor: "本地",     color: "#6366f1", keyId: "comfyui_url" },
  { key: "claude-svg",         label: "Claude SVG",        vendor: "Anthropic", color: "#d97706", keyId: "" },
] as const;

type ModelKey = (typeof MODELS)[number]["key"];

interface JobResult {
  model: ModelKey;
  status: "idle" | "generating" | "done" | "failed";
  imageUrl?: string;
  imageBase64?: string;
  svgCode?: string;
  vectorizing?: boolean;
  error?: string;
  elapsedMs?: number;
}

function ComparePage() {
  const params = useSearchParams();
  const dnaId = params.get("dna");

  const [dna, setDna] = useState<StyleDNA | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<Set<ModelKey>>(new Set());
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [styleInjected, setStyleInjected] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [comfyUpscale, setComfyUpscale] = useState<"none" | "lanczos_2x" | "ai_4x">("lanczos_2x");
  const [comfySteps, setComfySteps] = useState(4);

  useEffect(() => {
    const stored = localStorage.getItem("palette_api_keys");
    if (stored) setApiKeys(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!dnaId) return;
    fetch(`/api/v1/library/${dnaId}`)
      .then((r) => r.json())
      .then((d) => { if (d.result) setDna(d.result); })
      .catch(() => {});
  }, [dnaId]);

  function toggleModel(key: ModelKey) {
    const model = MODELS.find((m) => m.key === key)!;
    if (model.keyId && !apiKeys[model.keyId]) return;
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 4) next.add(key);
      return next;
    });
  }

  const builtPrompt = dna && styleInjected
    ? `${prompt}\n\n${buildStylePrompt(dna)}`
    : prompt;

  async function generate() {
    if (!prompt.trim() || selectedModels.size === 0) return;
    setGenerating(true);
    setJobs(Array.from(selectedModels).map((model) => ({ model, status: "generating" })));

    const modelsArray = Array.from(selectedModels);
    const otherModels = modelsArray.filter((m): m is Exclude<ModelKey, "comfyui"> => m !== "comfyui");
    const hasComfyUI = modelsArray.includes("comfyui");

    try {
      const promises: Promise<void>[] = [];

      // Other models → API route
      if (otherModels.length > 0) {
        promises.push(
          fetch("/api/v1/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: builtPrompt,
              models: otherModels,
              user_api_keys: { openai: apiKeys.openai, google: apiKeys.google, ideogram: apiKeys.ideogram },
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              setJobs((prev) =>
                prev.map((j) => {
                  const r = data.results?.find((x: { model: string }) => x.model === j.model);
                  return r ? { ...j, ...r } : j;
                })
              );
            })
            .catch((err) => {
              setJobs((prev) =>
                prev.map((j) =>
                  otherModels.includes(j.model)
                    ? { ...j, status: "failed" as const, error: err instanceof Error ? err.message : "请求失败" }
                    : j
                )
              );
            })
        );
      }

      // ComfyUI → browser direct call
      if (hasComfyUI) {
        const start = Date.now();
        promises.push(
          generateComfyUI(
            builtPrompt,
            apiKeys.comfyui_url,
            apiKeys.comfyui_model,
            comfyUpscale,
            comfySteps
          )
            .then(({ imageBase64, elapsedMs }) => {
              setJobs((prev) =>
                prev.map((j) =>
                  j.model === "comfyui"
                    ? { ...j, status: "done" as const, imageBase64, elapsedMs }
                    : j
                )
              );
            })
            .catch((err) => {
              setJobs((prev) =>
                prev.map((j) =>
                  j.model === "comfyui"
                    ? { ...j, status: "failed" as const, error: err instanceof Error ? err.message : "ComfyUI 失败", elapsedMs: Date.now() - start }
                    : j
                )
              );
            })
        );
      }

      await Promise.all(promises);
    } finally {
      setGenerating(false);
    }
  }

  async function vectorize(job: JobResult) {
    const imgData = job.imageBase64;
    if (!imgData) {
      console.error("[vectorize] no imageBase64 on job", job.model);
      return;
    }
    setJobs((prev) => prev.map((j) => j.model === job.model ? { ...j, vectorizing: true, error: undefined } : j));
    try {
      const res = await fetch("/api/v1/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imgData }),
      });
      const text = await res.text();
      if (!text) throw new Error(`服务器无响应 (${res.status})`);
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      if (!data.svg) throw new Error("vectorize 返回了空 SVG");
      setJobs((prev) => prev.map((j) =>
        j.model === job.model ? { ...j, svgCode: data.svg, vectorizing: false } : j
      ));
    } catch (err) {
      console.error("[vectorize] failed:", err);
      setJobs((prev) => prev.map((j) =>
        j.model === job.model
          ? { ...j, vectorizing: false, error: `矢量化失败: ${(err as Error)?.message ?? String(err)}` }
          : j
      ));
    }
  }

  const hostname = dna?.meta.source_url
    ? new URL(dna.meta.source_url).hostname.replace(/^www\./, "")
    : null;

  const cols = jobs.length <= 2 ? "grid-cols-2" : jobs.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)]/90 backdrop-blur z-10">
        <a href="/" className="text-xl font-bold tracking-tight gradient-text">Palette</a>
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <a href="/library" className="hover:text-[var(--text)] transition-colors">风格库</a>
          <span className="text-[var(--text)] font-medium">对比生图</span>
          <a href="/settings" className="hover:text-[var(--text)] transition-colors">设置</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">多模型对比生图</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">同一 Prompt，多模型并排对比效果</p>
        </div>

        <div className="card p-6 space-y-6">
          {/* DNA badge */}
          {dna ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100">
              <div className="flex gap-1">
                {dna.colors.palette.slice(0, 5).map((c) => (
                  <div key={c.hex} className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: c.hex }} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-orange-700">Style DNA 已挂载 · {hostname}</p>
                <p className="text-[10px] text-orange-500 truncate">{dna.aesthetic.personality.join(" · ")}</p>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={styleInjected} onChange={(e) => setStyleInjected(e.target.checked)} className="accent-orange-500" />
                <span className="text-xs text-orange-700">注入风格</span>
              </label>
              <button onClick={() => setDna(null)} className="text-orange-400 hover:text-orange-600 text-xs">移除</button>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-dashed border-[var(--border)] text-center">
              <p className="text-xs text-[var(--text-muted)]">
                未挂载 Style DNA · <a href="/library" className="text-orange-500 hover:underline">从风格库选择</a>
              </p>
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">描述画面</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="A landing page hero section for a SaaS product, clean and modern..."
              className="w-full mt-2 px-4 py-3 rounded-xl border border-[var(--border)] bg-white text-sm outline-none resize-none focus:border-orange-300 transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Model selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">选择模型（最多 4 个）</label>
              <a href="/settings" className="text-xs text-orange-500 hover:underline">管理 API Key →</a>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {MODELS.map((m) => {
                const selected = selectedModels.has(m.key);
                const hasKey = !m.keyId || !!apiKeys[m.keyId];
                const disabled = !hasKey || generating;

                return (
                  <button
                    key={m.key}
                    onClick={() => !disabled && toggleModel(m.key)}
                    disabled={disabled}
                    title={!hasKey ? `需要在设置页填写 ${m.vendor} API Key` : undefined}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      disabled
                        ? "opacity-40 cursor-not-allowed border-[var(--border)]"
                        : selected
                        ? "border-orange-400 bg-orange-50"
                        : "border-[var(--border)] hover:border-orange-200 cursor-pointer"
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full mb-2" style={{ backgroundColor: m.color }} />
                    <p className="text-xs font-semibold leading-tight">{m.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{m.vendor}</p>
                    {!hasKey && <p className="text-[10px] text-orange-400 mt-0.5">需要 Key</p>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ComfyUI options — only when ComfyUI is selected */}
          {selectedModels.has("comfyui") && (
            <div className="space-y-3 px-1">
              {/* Upscale */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)] shrink-0 w-20">输出尺寸</span>
                <div className="flex gap-2">
                  {([
                    { value: "none",       label: "1024px",                 desc: "预览" },
                    { value: "lanczos_2x", label: "2048px Lanczos",         desc: "方形印刷" },
                    { value: "ai_4x",      label: "4096px 4x-UltraSharp",   desc: "T-shirt / 海报" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setComfyUpscale(opt.value)}
                      className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${
                        comfyUpscale === opt.value
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-indigo-200"
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-1 opacity-60">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Steps slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)] shrink-0 w-20">推理步数</span>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={comfySteps}
                  onChange={(e) => setComfySteps(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs font-medium text-indigo-700 w-8 text-center">{comfySteps}</span>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  {comfySteps <= 4 ? "快速" : comfySteps <= 12 ? "均衡" : "高质量"}
                  {" · "}约 {Math.round(comfySteps * 90 / 60)} 分钟
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)]">生图费用由各平台直接计费（BYOK）</p>
            <button
              onClick={generate}
              disabled={!prompt.trim() || selectedModels.size === 0 || generating}
              className="btn-primary px-6 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? "生成中…" : "全部生成"}
            </button>
          </div>
        </div>

        {/* Results */}
        {jobs.length > 0 && (
          <div className={`grid gap-5 ${cols}`}>
            {jobs.map((job) => {
              const model = MODELS.find((m) => m.key === job.model)!;
              return (
                <div key={job.model} className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: model.color }} />
                    <span className="text-sm font-medium">{model.label}</span>
                    {job.elapsedMs && <span className="ml-auto text-xs text-[var(--text-muted)]">{(job.elapsedMs / 1000).toFixed(1)}s</span>}
                    {job.status === "generating" && (
                      <div className="ml-auto w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    )}
                  </div>

                  {job.status === "generating" && (
                    <div className="aspect-square rounded-xl bg-[var(--bg)] animate-pulse flex flex-col items-center justify-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">生成中…</span>
                      {job.model === "comfyui" && (
                        <span className="text-[10px] text-[var(--text-muted)] opacity-60">本地生成约需 3–5 分钟</span>
                      )}
                    </div>
                  )}

                  {job.status === "done" && job.svgCode && (
                    <div className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.svgCode)}`}
                        alt={model.label}
                        className="w-full aspect-square object-contain rounded-xl bg-white"
                      />
                      <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <a
                          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.svgCode)}`}
                          download={`${model.key}-${Date.now()}.svg`}
                          className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80"
                        >
                          ↓ 保存 SVG
                        </a>
                      </div>
                    </div>
                  )}

                  {job.status === "done" && job.imageUrl && !job.svgCode && (
                    <div className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={job.imageUrl} alt={model.label} className="w-full aspect-square object-cover rounded-xl" />
                      <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => vectorize(job)}
                          disabled={job.vectorizing}
                          className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 disabled:opacity-50"
                        >
                          {job.vectorizing ? "…" : "→ SVG"}
                        </button>
                        <a
                          href={job.imageUrl}
                          download={`${model.key}-${Date.now()}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80"
                        >
                          ↓ 保存
                        </a>
                      </div>
                    </div>
                  )}

                  {job.status === "done" && job.imageBase64 && !job.svgCode && (
                    <div className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/png;base64,${job.imageBase64}`} alt={model.label} className="w-full aspect-square object-cover rounded-xl" />
                      <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => vectorize(job)}
                          disabled={job.vectorizing}
                          className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 disabled:opacity-50"
                        >
                          {job.vectorizing ? "…" : "→ SVG"}
                        </button>
                        <a
                          href={`data:image/png;base64,${job.imageBase64}`}
                          download={`${model.key}-${Date.now()}.png`}
                          className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80"
                        >
                          ↓ 保存
                        </a>
                      </div>
                    </div>
                  )}

                  {job.status === "done" && !job.svgCode && !job.imageUrl && !job.imageBase64 && (
                    <div className="aspect-square rounded-xl bg-yellow-50 flex items-center justify-center p-4 text-center">
                      <p className="text-xs text-yellow-600">结果为空，请重试</p>
                    </div>
                  )}

                  {job.status === "failed" && (
                    <div className="aspect-square rounded-xl bg-red-50 flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-xs text-red-500">{job.error}</p>
                      {job.error?.includes("API Key") && (
                        <a href="/settings" className="text-xs text-orange-500 hover:underline">前往设置 →</a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Prompt preview */}
        {dna && styleInjected && prompt && (
          <details className="card p-4">
            <summary className="text-xs font-medium text-[var(--text-muted)] cursor-pointer select-none">
              查看完整 Prompt（含 Style DNA 注入）
            </summary>
            <pre className="mt-3 text-xs text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] rounded-xl p-4">
              {builtPrompt}
            </pre>
          </details>
        )}
      </main>
    </div>
  );
}

export default function ComparePageWrapper() {
  return (
    <Suspense>
      <ComparePage />
    </Suspense>
  );
}
