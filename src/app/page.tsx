"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AuthButton from "@/components/AuthButton";
import { useRequireAuth } from "@/components/useRequireAuth";
import { getToken } from "@/lib/auth";

export default function HomePage() {
  useRequireAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function getEngineConfig() {
    const eng = localStorage.getItem("palette_analyzer_engine") ?? "claude";
    if (eng !== "ollama") return undefined;
    return {
      engine: "ollama" as const,
      ollamaUrl: localStorage.getItem("palette_ollama_url") ?? "http://localhost:11434",
      ollamaModel: localStorage.getItem("palette_ollama_model") ?? "qwen2.5:14b",
    };
  }

  function getAnthropicKey(): string | undefined {
    const stored = localStorage.getItem("palette_api_keys");
    if (!stored) return undefined;
    try {
      const keys = JSON.parse(stored);
      return keys.anthropic || undefined;
    } catch {
      return undefined;
    }
  }

  async function submitUrl(targetUrl: string) {
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ source_type: "url", url: targetUrl.trim(), engine: getEngineConfig(), anthropic_key: getAnthropicKey() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { task_id } = await res.json();
      router.push(`/analyze/${task_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setLoading(false);
    }
  }

  async function submitImage(file: File) {
    setLoading(true);
    setError("");
    try {
      const base64 = await toBase64(file);
      const mediaType = file.type || "image/png";
      const res = await fetch("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ source_type: "image", image: base64, media_type: mediaType, engine: getEngineConfig(), anthropic_key: getAnthropicKey() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { task_id } = await res.json();
      router.push(`/analyze/${task_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败，请重试");
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) submitImage(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) submitImage(file);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)]">
        <span className="text-xl font-bold tracking-tight gradient-text">Palette</span>
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <a href="/library" className="hover:text-[var(--text)] transition-colors">风格库</a>
          <a href="#" className="hover:text-[var(--text)] transition-colors">对比生图</a>
          <AuthButton />
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full text-center space-y-5">

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-100 text-orange-600 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            AI 驱动的风格解析引擎
          </div>

          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            风格即语言，
            <br />
            <span className="gradient-text">读懂设计。</span>
          </h1>

          <p className="text-lg text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            输入任意网站 URL 或上传截图，自动提取 18 项视觉维度，生成可复用的 Style DNA 报告。
          </p>

          {/* URL Input */}
          <form onSubmit={(e) => { e.preventDefault(); submitUrl(url); }} className="mt-6">
            <div className="card flex items-center gap-3 p-2 shadow-sm">
              <div className="flex-1 flex items-center gap-2 px-3">
                <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="粘贴网址，例如 https://stripe.com"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)] py-2"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "解析中…" : "开始解析"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-500 text-left px-2">{error}</p>}
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-1">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]">或</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Image Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`card border-dashed cursor-pointer transition-all p-6 flex flex-col items-center gap-2 ${
              dragOver ? "border-orange-400 bg-orange-50" : "hover:border-orange-300 hover:bg-orange-50/50"
            } ${loading ? "pointer-events-none opacity-50" : ""}`}
          >
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-sm font-medium">拖拽上传截图</p>
            <p className="text-xs text-[var(--text-muted)]">支持 PNG · JPG · WebP</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Example chips */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)]">试试：</span>
            {["stripe.com", "linear.app", "vercel.com", "notion.so"].map((site) => (
              <button
                key={site}
                onClick={() => submitUrl(`https://${site}`)}
                disabled={loading}
                className="text-xs px-3 py-1 rounded-full border border-[var(--border)] hover:border-orange-300 hover:text-orange-600 transition-colors disabled:opacity-50"
              >
                {site}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
          {["🎨 色彩系统", "✏️ 字体规范", "📐 间距体系", "🔲 圆角语言", "🧩 组件风格", "✨ 整体美学"].map((f) => (
            <span key={f} className="px-4 py-2 rounded-full text-sm border border-[var(--border)] text-[var(--text-muted)]">
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
