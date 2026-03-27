"use client";

import { useEffect, useState } from "react";

const KEYS = [
  {
    id: "anthropic",
    label: "Anthropic",
    desc: "服务器已默认配置，无需填写。填写后将优先使用你自己的 Key（BYOK）。",
    placeholder: "sk-ant-...",
    color: "#d97706",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    desc: "用于 DALL-E 3 生图",
    placeholder: "sk-...",
    color: "#10a37f",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Google AI",
    desc: "用于 Gemini Flash Image 原生生图",
    placeholder: "AIza...",
    color: "#4285f4",
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "ideogram",
    label: "Ideogram",
    desc: "用于 Ideogram v2 生图",
    placeholder: "ig-...",
    color: "#7c3aed",
    docsUrl: "https://developer.ideogram.ai",
  },
  {
    id: "comfyui_url",
    label: "ComfyUI 地址",
    desc: "本地 ComfyUI 服务地址（需在同一台机器上运行）",
    placeholder: "http://127.0.0.1:8188",
    color: "#6366f1",
    docsUrl: "https://github.com/comfyanonymous/ComfyUI",
  },
  {
    id: "comfyui_model",
    label: "ComfyUI 模型",
    desc: "ComfyUI unet 目录下的模型文件名（支持 .gguf / .safetensors）",
    placeholder: "flux1-schnell-Q4_K_S.gguf",
    color: "#6366f1",
    docsUrl: "https://github.com/comfyanonymous/ComfyUI",
  },
] as const;

type KeyId = (typeof KEYS)[number]["id"];

export default function SettingsPage() {
  const [keys, setKeys] = useState<Partial<Record<KeyId, string>>>({});
  const [visible, setVisible] = useState<Set<KeyId>>(new Set());
  const [saved, setSaved] = useState(false);
  const [engine, setEngine] = useState<"claude" | "ollama">("claude");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("qwen2.5:14b");
  const [ollamaStatus, setOllamaStatus] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    const stored = localStorage.getItem("palette_api_keys");
    if (stored) setKeys(JSON.parse(stored));
    const eng = localStorage.getItem("palette_analyzer_engine");
    if (eng === "ollama") setEngine("ollama");
    const url = localStorage.getItem("palette_ollama_url");
    if (url) setOllamaUrl(url);
    const model = localStorage.getItem("palette_ollama_model");
    if (model) setOllamaModel(model);
  }, []);

  async function testOllama() {
    setOllamaStatus("idle");
    try {
      const res = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/tags`);
      setOllamaStatus(res.ok ? "ok" : "error");
    } catch {
      setOllamaStatus("error");
    }
  }

  function toggleVisibility(id: KeyId) {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function saveKeys() {
    localStorage.setItem("palette_api_keys", JSON.stringify(keys));
    localStorage.setItem("palette_analyzer_engine", engine);
    localStorage.setItem("palette_ollama_url", ollamaUrl);
    localStorage.setItem("palette_ollama_model", ollamaModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)]/90 backdrop-blur z-10">
        <a href="/" className="text-xl font-bold tracking-tight gradient-text">Palette</a>
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <a href="/library" className="hover:text-[var(--text)] transition-colors">风格库</a>
          <a href="/compare" className="hover:text-[var(--text)] transition-colors">对比生图</a>
          <span className="text-[var(--text)] font-medium">设置</span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">API Key 设置</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Key 仅保存在本地浏览器，不上传服务器。生图费用由各平台直接向你收取。
          </p>
        </div>

        {/* Analyzer Engine */}
        <div className="card p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold">解析引擎</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">选择提取 Style DNA 使用的 AI 引擎</p>
          </div>
          <div className="flex gap-3">
            {(["claude", "ollama"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEngine(e)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  engine === e
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-orange-200"
                }`}
              >
                {e === "claude" ? "Claude（推荐）" : "Ollama（本地免费）"}
              </button>
            ))}
          </div>

          {engine === "ollama" && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠ Ollama 本地运行免费。视觉模型（如 llama3.2-vision:11b）可分析截图，效果接近 Claude；纯文字模型（如 qwen2.5:14b）仅读 CSS，准确度较低。
              </p>
              <div className="flex gap-2">
                <input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-white outline-none focus:border-orange-300 font-mono"
                />
                <button
                  onClick={testOllama}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs hover:border-orange-300 transition-colors shrink-0"
                >
                  测试连接
                </button>
                {ollamaStatus === "ok" && <span className="text-xs text-green-600 self-center">✓ 已连接</span>}
                {ollamaStatus === "error" && <span className="text-xs text-red-500 self-center">✗ 无法连接</span>}
              </div>
              <input
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5:14b"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-white outline-none focus:border-orange-300 font-mono"
              />
              <p className="text-[10px] text-[var(--text-muted)]">
                推荐模型：qwen2.5:14b（中文）· llama3.1:8b（英文）· 运行前请先 ollama pull 对应模型
              </p>
            </div>
          )}
        </div>

        {/* User-provided keys */}
        <div className="space-y-4">
          {KEYS.map((k) => {
            const val = keys[k.id] ?? "";
            const isVisible = visible.has(k.id);
            const hasKey = val.length > 0;

            return (
              <div key={k.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg shrink-0 mt-0.5" style={{ backgroundColor: k.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">{k.label}</p>
                      {hasKey && (
                        <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">✓ 已填写</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-3">{k.desc}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type={isVisible ? "text" : "password"}
                        value={val}
                        onChange={(e) => setKeys((prev) => ({ ...prev, [k.id]: e.target.value }))}
                        placeholder={k.placeholder}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-white outline-none focus:border-orange-300 transition-colors font-mono placeholder:font-sans placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        onClick={() => toggleVisibility(k.id)}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:border-orange-300 transition-colors"
                      >
                        {isVisible ? "隐藏" : "显示"}
                      </button>
                    </div>
                    <a
                      href={k.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-orange-500 hover:underline mt-1.5 inline-block"
                    >
                      获取 {k.label} API Key →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button onClick={saveKeys} className="btn-primary px-6 py-2.5 text-sm">
            {saved ? "✓ 已保存" : "保存"}
          </button>
        </div>

        {/* Quota */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3">使用配额（本月）</h2>
          <div className="grid grid-cols-2 gap-4">
            <QuotaBar label="解析次数" used={0} limit={20} unit="次" />
            <QuotaBar label="生图次数" used={0} limit={50} unit="次" />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-3">免费版 · 每月 1 日 00:00 UTC 重置</p>
        </div>
      </main>
    </div>
  );
}

function QuotaBar({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const pct = Math.min((used / limit) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-medium">{used} / {limit} {unit}</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg, #F97316, #EF4444)" }}
        />
      </div>
    </div>
  );
}
