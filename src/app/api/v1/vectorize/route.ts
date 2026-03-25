import { NextResponse } from "next/server";
import potrace from "potrace";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB decoded limit

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64 } = body as { imageBase64?: string };
    if (!imageBase64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });

    const buffer = Buffer.from(imageBase64, "base64");
    console.log(`[vectorize] image ${Math.round(buffer.length / 1024)} KB`);

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `图片过大（${Math.round(buffer.length / 1024 / 1024 * 10) / 10} MB），矢量化仅支持 ≤ 2 MB。请在生图时选择"1024px 预览"再矢量化。` },
        { status: 400 }
      );
    }

    return await new Promise<NextResponse>((resolve) => {
      potrace.trace(buffer, { turdSize: 50, threshold: 128, color: "#1a1a1a" }, (err, svg) => {
        if (err) {
          console.error("[vectorize] potrace error:", err);
          resolve(NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ svg }));
        }
      });
    });
  } catch (err) {
    console.error("[vectorize] handler error:", err);
    return NextResponse.json({ error: String((err as Error)?.message ?? err) }, { status: 500 });
  }
}
