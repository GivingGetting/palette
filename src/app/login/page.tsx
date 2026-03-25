"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isLoggedIn } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    isLoggedIn().then((ok) => { if (ok) router.replace("/"); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setMessage({ text: error.message, ok: false }); return; }
        router.push("/");
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setMessage({ text: error.message, ok: false }); return; }
        if (!data.session) {
          setMessage({ text: "注册成功！请检查邮箱完成验证后再登录。", ok: true });
          setMode("login");
          return;
        }
        router.push("/");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) { setMessage({ text: error.message, ok: false }); return; }
        setMessage({ text: "重置邮件已发送，请检查收件箱。", ok: true });
        setMode("login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--bg)" }}>
      {/* Logo */}
      <a href="/" className="text-2xl font-bold tracking-tight gradient-text mb-8">
        Palette
      </a>

      <div className="card p-8 w-full max-w-sm">
        {/* Tab switcher */}
        {mode !== "reset" && (
          <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setMessage(null); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-white shadow-sm text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {m === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>
        )}
        {mode === "reset" && (
          <h2 className="text-lg font-semibold mb-6">重置密码</h2>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
              邮箱
            </label>
            <input
              type="email"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {mode !== "reset" && (
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium text-[var(--text-muted)]">
                  密码
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setMessage(null); }}
                    className="text-xs text-orange-500 hover:text-orange-600"
                  >
                    忘记密码？
                  </button>
                )}
              </div>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </div>
          )}

          {message && (
            <p className={`text-sm px-3 py-2 rounded-lg ${
              message.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary py-2 text-sm font-medium mt-1"
          >
            {loading ? "处理中…" : mode === "login" ? "登录" : mode === "register" ? "创建账号" : "发送重置邮件"}
          </button>

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => { setMode("login"); setMessage(null); }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] text-center"
            >
              返回登录
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
