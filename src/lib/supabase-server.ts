import { createClient } from "@supabase/supabase-js";

/**
 * 创建带用户 JWT 的服务端 Supabase client。
 * RLS 策略会自动限制该用户只能访问自己的数据。
 */
export function createServerClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { persistSession: false },
    }
  );
}

/** 从 Request 的 Authorization header 中提取 Bearer token */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return token || null;
}
