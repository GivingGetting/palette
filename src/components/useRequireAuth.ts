"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";

/** 在需要登录的页面顶部调用，未登录自动跳转 /login */
export function useRequireAuth() {
  const router = useRouter();
  useEffect(() => {
    isLoggedIn().then((ok) => {
      if (!ok) router.replace("/login");
    });
  }, [router]);
}
