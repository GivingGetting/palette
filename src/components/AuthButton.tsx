"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmail, signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function AuthButton() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Initialize from localStorage (sync, no flicker)
    setEmail(getEmail());

    // Keep in sync with auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (!email) {
    return (
      <a
        href="/login"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        登录
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-muted)] hidden sm:block truncate max-w-[120px]">
        {email}
      </span>
      <button
        onClick={handleSignOut}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        退出
      </button>
    </div>
  );
}
