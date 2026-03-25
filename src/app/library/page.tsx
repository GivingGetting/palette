"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LibraryCard {
  id: string;
  createdAt: number;
  source_url: string | null;
  source_type: "url" | "image";
  confidence: number;
  palette: string[];
  primary: string;
  font: string;
  personality: string[];
  mode: string;
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/library")
      .then((r) => r.json())
      .then((d) => { setItems(d.data); setLoading(false); });
  }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除这条记录吗？")) return;
    await fetch(`/api/v1/library/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)]/90 backdrop-blur z-10">
        <a href="/" className="text-xl font-bold tracking-tight gradient-text">Palette</a>
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <span className="text-[var(--text)] font-medium">风格库</span>
          <a href="#" className="hover:text-[var(--text)] transition-colors">对比生图</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">风格库</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {loading ? "加载中…" : `${items.length} 条解析记录`}
            </p>
          </div>
          <Link href="/" className="btn-primary px-4 py-2 text-sm">
            + 新解析
          </Link>
        </div>

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center text-3xl">🎨</div>
            <h2 className="text-lg font-semibold">还没有解析记录</h2>
            <p className="text-sm text-[var(--text-muted)]">解析任意网站后，结果会自动归档到这里</p>
            <Link href="/" className="btn-primary px-5 py-2.5 text-sm mt-2">开始解析</Link>
          </div>
        )}

        {/* Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-5">
            {items.map((item) => (
              <Link key={item.id} href={`/analyze/${item.id}`}>
                <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer group relative">
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white border border-[var(--border)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:!text-red-500 hover:!border-red-300 transition-all flex items-center justify-center text-xs leading-none"
                    title="删除"
                  >
                    ✕
                  </button>

                  {/* Color bar */}
                  <div className="flex gap-1 mb-4">
                    {item.palette.map((hex, i) => (
                      <div
                        key={i}
                        className="h-8 flex-1 first:rounded-l-lg last:rounded-r-lg"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>

                  {/* Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-orange-600 transition-colors">
                        {item.source_url
                          ? new URL(item.source_url).hostname.replace(/^www\./, "")
                          : "上传图片"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.font}</p>
                    </div>
                    <div
                      className="w-6 h-6 rounded-full shrink-0 border-2 border-white shadow-sm mt-0.5"
                      style={{ backgroundColor: item.primary }}
                    />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {item.personality.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      置信度 {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
