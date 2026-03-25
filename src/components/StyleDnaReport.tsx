"use client";

import type { StyleDNA } from "@/lib/analyzer/schema";
import { buildStylePrompt } from "@/lib/analyzer/prompt";
import { useState } from "react";

export default function StyleDnaReport({ dna, taskId }: { dna: StyleDNA; taskId?: string }) {
  const [copied, setCopied] = useState(false);

  function copyPrompt() {
    navigator.clipboard.writeText(buildStylePrompt(dna));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hostname = dna.meta.source_url
    ? new URL(dna.meta.source_url).hostname.replace(/^www\./, "")
    : "上传图片";

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)]/90 backdrop-blur z-10">
        <a href="/" className="text-xl font-bold tracking-tight gradient-text">Palette</a>
        <div className="flex items-center gap-3">
          <button onClick={copyPrompt} className="text-sm px-4 py-2 rounded-lg border border-[var(--border)] hover:border-orange-300 transition-colors">
            {copied ? "✓ 已复制 Prompt" : "复制 Prompt"}
          </button>
          {taskId && (
            <a href={`/compare?dna=${taskId}`} className="text-sm px-4 py-2 rounded-lg border border-[var(--border)] hover:border-orange-300 transition-colors">
              对比生图 →
            </a>
          )}
          <a href="/" className="btn-primary px-4 py-2 text-sm">新解析</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-5 h-5 rounded-md"
                style={{ backgroundColor: dna.colors.primary.hex }}
              />
              <h1 className="text-2xl font-bold">{hostname}</h1>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {dna.aesthetic.personality.join(" · ")} · 置信度 {Math.round(dna.meta.confidence * 100)}%
            </p>
          </div>
          {/* Mini palette */}
          <div className="flex gap-1">
            {dna.colors.palette.slice(0, 8).map((c) => (
              <div
                key={c.hex}
                className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: c.hex }}
                title={`${c.name} ${c.hex}`}
              />
            ))}
          </div>
        </div>

        {/* Top row: Colors + Typography */}
        <div className="grid grid-cols-5 gap-6">

          {/* Colors — 3 cols */}
          <div className="col-span-3 card p-6 space-y-5">
            <SectionTitle>色彩系统</SectionTitle>

            {/* Primary */}
            <div>
              <Label>主色</Label>
              <BigSwatch color={dna.colors.primary} />
            </div>

            {/* Accent */}
            {dna.colors.accent.length > 0 && (
              <div>
                <Label>强调色</Label>
                <div className="flex gap-2 flex-wrap">
                  {dna.colors.accent.map((c) => <SmallSwatch key={c.hex} color={c} />)}
                </div>
              </div>
            )}

            {/* BG + Surface */}
            <div>
              <Label>背景 / 表面</Label>
              <div className="flex gap-2">
                <SmallSwatch color={dna.colors.background} />
                <SmallSwatch color={dna.colors.surface} />
              </div>
            </div>

            {/* Semantic */}
            <div>
              <Label>语义色</Label>
              <div className="flex gap-2">
                {Object.entries(dna.colors.semantic).map(([k, c]) => (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <div className="w-7 h-7 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: c.hex }} title={c.name} />
                    <span className="text-[10px] text-[var(--text-muted)]">{k === "success" ? "成功" : k === "warning" ? "警告" : k === "error" ? "错误" : "信息"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Full palette */}
            <div>
              <Label>完整色盘</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {dna.colors.palette.map((c) => (
                  <div
                    key={c.hex}
                    className="w-8 h-8 rounded-lg border border-black/5 cursor-default group relative"
                    style={{ backgroundColor: c.hex }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      {c.hex}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Typography — 2 cols */}
          <div className="col-span-2 card p-6 space-y-5">
            <SectionTitle>字体规范</SectionTitle>

            <div>
              <Label>主字体</Label>
              <p className="text-2xl font-bold mt-1" style={{ fontFamily: dna.typography.primary_font.family }}>
                Aa
              </p>
              <p className="text-sm font-medium">{dna.typography.primary_font.family}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {dna.typography.primary_font.source} · {dna.typography.primary_font.weights.join(", ")}
              </p>
            </div>

            <div className="space-y-3">
              <Label>字阶</Label>
              {[
                { key: "display", label: "Display", sample: "展示标题" },
                { key: "heading1", label: "H1", sample: "一级标题" },
                { key: "heading2", label: "H2", sample: "二级标题" },
                { key: "body", label: "Body", sample: "正文段落" },
                { key: "caption", label: "Caption", sample: "辅助说明" },
              ].map(({ key, label, sample }) => {
                const s = dna.typography.scale[key as keyof typeof dna.typography.scale];
                if (!s) return null;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)] w-14">{label}</span>
                    <span
                      className="flex-1 truncate"
                      style={{
                        fontSize: Math.min(s.size, 22),
                        fontWeight: s.weight,
                        lineHeight: s.line_height,
                      }}
                    >
                      {sample}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-2 shrink-0">
                      {s.size}px/{s.weight}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom row: Spacing + Radius + Components + Aesthetic */}
        <div className="grid grid-cols-4 gap-6">

          {/* Spacing */}
          <div className="card p-6">
            <SectionTitle>空间系统</SectionTitle>
            <p className="text-xs text-[var(--text-muted)] mt-3 mb-3">
              基础 {dna.spacing.base_unit}px · 容器 {dna.spacing.container_max_width}px
            </p>
            <div className="flex items-end gap-1">
              {dna.spacing.scale.slice(0, 8).map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <div
                    className="rounded-sm w-2"
                    style={{
                      height: Math.min(s * 1.8, 56),
                      background: "linear-gradient(180deg, #F97316, #EF4444)",
                    }}
                  />
                  <span className="text-[9px] text-[var(--text-muted)]">{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div className="card p-6">
            <SectionTitle>圆角语言</SectionTitle>
            <div className="space-y-3 mt-3">
              {(["sm", "md", "lg", "xl"] as const).map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 border-2 border-orange-300 bg-orange-50 shrink-0"
                    style={{ borderRadius: dna.radius[key] }}
                  />
                  <div>
                    <p className="text-xs font-medium">
                      {key.toUpperCase()}
                      {dna.radius.default === key && (
                        <span className="ml-1 text-[10px] text-orange-500">默认</span>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">{dna.radius[key]}px</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Components */}
          <div className="card p-6">
            <SectionTitle>组件语言</SectionTitle>
            <div className="space-y-3 mt-3">
              <ComponentRow icon="⬜" label="按钮" value={`${dna.components.button.style} · ${dna.components.button.radius_ref}${dna.components.button.has_shadow ? " · shadow" : ""}`} />
              <ComponentRow icon="⬛" label="输入框" value={`${dna.components.input.style} · ${dna.components.input.radius_ref}`} />
              <ComponentRow icon="🃏" label="卡片" value={`${dna.components.card.style} · ${dna.components.card.radius_ref}`} />
              <ComponentRow icon="📌" label="导航" value={`${dna.components.nav.type} · ${dna.components.nav.style}`} />
            </div>
          </div>

          {/* Aesthetic */}
          <div className="card p-6">
            <SectionTitle>整体美学</SectionTitle>
            <div className="space-y-2 mt-3">
              <AestheticRow label="明暗" value={dna.aesthetic.mode === "light" ? "浅色" : dna.aesthetic.mode === "dark" ? "深色" : "双模式"} />
              <AestheticRow label="密度" value={dna.aesthetic.density === "compact" ? "紧凑" : dna.aesthetic.density === "airy" ? "宽松" : "适中"} />
              <AestheticRow label="动效" value={dna.aesthetic.motion === "none" ? "无" : dna.aesthetic.motion === "subtle" ? "微妙" : "丰富"} />
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {dna.aesthetic.personality.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-orange-50 text-orange-600 border border-orange-100">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Style prompt */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Style Prompt</SectionTitle>
            <button
              onClick={copyPrompt}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-orange-300 transition-colors"
            >
              {copied ? "✓ 已复制" : "复制"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-muted)] bg-[var(--bg)] rounded-xl p-4">
            {dna.aesthetic.language}
          </p>
        </div>

      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{children}</h2>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text-muted)] mb-1.5">{children}</p>;
}

function BigSwatch({ color }: { color: { hex: string; name: string; usage: string } }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl border border-black/5 shadow-sm shrink-0" style={{ backgroundColor: color.hex }} />
      <div>
        <p className="text-sm font-semibold">{color.hex}</p>
        <p className="text-xs text-[var(--text-muted)]">{color.name}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{color.usage}</p>
      </div>
    </div>
  );
}

function SmallSwatch({ color }: { color: { hex: string; name: string; usage: string } }) {
  return (
    <div className="flex items-center gap-2 group cursor-default">
      <div className="w-8 h-8 rounded-lg border border-black/5 shadow-sm" style={{ backgroundColor: color.hex }} />
      <div>
        <p className="text-xs font-medium">{color.hex}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{color.name}</p>
      </div>
    </div>
  );
}

function ComponentRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{value}</p>
      </div>
    </div>
  );
}

function AestheticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}
