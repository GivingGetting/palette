import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type ModelKey = "gpt-4o" | "gemini-flash-image" | "ideogram-v2" | "comfyui" | "claude-svg";

interface GenerateResult {
  model: ModelKey;
  status: "done" | "failed";
  imageUrl?: string;
  imageBase64?: string;
  svgCode?: string;
  elapsedMs: number;
  error?: string;
}

type UpscaleMode = "none" | "lanczos_2x" | "ai_4x";

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, models, user_api_keys, comfyui_upscale, comfyui_steps } = body as {
    prompt: string;
    models: ModelKey[];
    user_api_keys: { openai?: string; google?: string; ideogram?: string; comfyui_url?: string; comfyui_model?: string };
    comfyui_upscale?: UpscaleMode;
    comfyui_steps?: number;
  };

  if (!prompt || !models?.length) {
    return NextResponse.json({ error: "prompt and models required" }, { status: 400 });
  }

  const results = await Promise.all(
    models.map((model) => generateImage(model, prompt, user_api_keys, comfyui_upscale ?? "lanczos_2x", comfyui_steps))
  );

  return NextResponse.json({ results });
}

async function generateImage(
  model: ModelKey,
  prompt: string,
  keys: { openai?: string; google?: string; ideogram?: string; comfyui_url?: string; comfyui_model?: string },
  upscaleMode: UpscaleMode,
  customSteps?: number
): Promise<GenerateResult> {
  const start = Date.now();
  try {
    switch (model) {
      case "gpt-4o":             return await generateOpenAI(prompt, keys.openai, start);
      case "gemini-flash-image": return await generateGemini(prompt, keys.google, start);
      case "ideogram-v2":        return await generateIdeogram(prompt, keys.ideogram, start);
      case "comfyui":            return await generateComfyUI(prompt, keys.comfyui_url, keys.comfyui_model, upscaleMode, start, customSteps);
      case "claude-svg":         return await generateClaudeSVG(prompt, start);
    }
  } catch (err) {
    return { model, status: "failed", error: err instanceof Error ? err.message : "未知错误", elapsedMs: Date.now() - start };
  }
}

async function generateOpenAI(prompt: string, apiKey: string | undefined, start: number): Promise<GenerateResult> {
  if (!apiKey) throw new Error("未填写 OpenAI API Key，请前往设置页添加");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return { model: "gpt-4o", status: "done", imageBase64: data.data[0].b64_json, elapsedMs: Date.now() - start };
}

async function generateGemini(prompt: string, apiKey: string | undefined, start: number): Promise<GenerateResult> {
  if (!apiKey) throw new Error("未填写 Google API Key，请前往设置页添加");

  const modelId = "gemini-2.5-flash-image";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gemini error ${res.status}`);
  }

  const data = await res.json();
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> =
    data?.candidates?.[0]?.content?.parts ?? [];

  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) throw new Error("Gemini 未返回图片数据");

  return {
    model: "gemini-flash-image",
    status: "done",
    imageBase64: imagePart.inlineData.data,
    elapsedMs: Date.now() - start,
  };
}

async function generateIdeogram(prompt: string, apiKey: string | undefined, start: number): Promise<GenerateResult> {
  if (!apiKey) throw new Error("未填写 Ideogram API Key，请前往设置页添加");

  const res = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": apiKey },
    body: JSON.stringify({
      image_request: { prompt, model: "V_2", magic_prompt_option: "OFF", aspect_ratio: "ASPECT_1_1" },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Ideogram error ${res.status}`);
  }

  const data = await res.json();
  const imgUrl: string = data.data?.[0]?.url;
  if (!imgUrl) throw new Error("Ideogram 未返回图片链接");

  // Fetch and convert to base64 so the browser can download it directly
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) throw new Error("Ideogram 图片下载失败");
  const buf = await imgRes.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");

  return { model: "ideogram-v2", status: "done", imageBase64: b64, elapsedMs: Date.now() - start };
}

async function generateComfyUI(
  prompt: string,
  serverUrl: string | undefined,
  modelName: string | undefined,
  upscaleMode: UpscaleMode,
  start: number,
  customSteps?: number
): Promise<GenerateResult> {
  if (!serverUrl) throw new Error("未填写 ComfyUI 地址，请前往设置页添加");
  const base = serverUrl.replace(/\/$/, "");
  const unetName = modelName || "flux1-dev-Q4_K_S.gguf";
  const isDev = unetName.includes("dev");
  const steps = customSteps ?? (isDev ? 20 : 2);
  const guidance = isDev ? 3.0 : 3.5;
  const scheduler = isDev ? "beta" : "simple";
  const seed = Math.floor(Math.random() * 2 ** 32);

  // Build output node based on upscale mode
  // none → 1024×1024 直接保存
  // lanczos_2x → Lanczos 放大到 2048×2048
  // ai_4x → 4x-UltraSharp AI 放大到 4096×4096
  const outputNodes =
    upscaleMode === "ai_4x"
      ? {
          "10": { class_type: "UpscaleModelLoader",    inputs: { model_name: "4x-UltraSharp.pth" } },
          "11": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["10", 0], image: ["8", 0] } },
          "9":  { class_type: "SaveImage",             inputs: { filename_prefix: "palette_4x", images: ["11", 0] } },
        }
      : upscaleMode === "lanczos_2x"
      ? {
          "10": { class_type: "ImageScale", inputs: { image: ["8", 0], upscale_method: "lanczos", width: 2048, height: 2048, crop: "disabled" } },
          "9":  { class_type: "SaveImage",  inputs: { filename_prefix: "palette_2x", images: ["10", 0] } },
        }
      : {
          "9": { class_type: "SaveImage", inputs: { filename_prefix: "palette", images: ["8", 0] } },
        };

  const workflow = {
    "1": { class_type: "UnetLoaderGGUF",      inputs: { unet_name: unetName } },
    "2": { class_type: "DualCLIPLoader",       inputs: { clip_name1: "t5xxl_fp8_e4m3fn.safetensors", clip_name2: "clip_l.safetensors", type: "flux" } },
    "3": { class_type: "VAELoader",            inputs: { vae_name: "ae.safetensors" } },
    "4": { class_type: "EmptySD3LatentImage",  inputs: { width: 1024, height: 1024, batch_size: 1 } },
    "5": { class_type: "CLIPTextEncode",       inputs: { clip: ["2", 0], text: prompt } },
    "6": { class_type: "FluxGuidance",         inputs: { conditioning: ["5", 0], guidance } },
    "7": { class_type: "KSampler",             inputs: { model: ["1", 0], positive: ["6", 0], negative: ["5", 0], latent_image: ["4", 0], seed, steps, cfg: 1, sampler_name: "euler", scheduler, denoise: 1 } },
    "8": { class_type: "VAEDecode",            inputs: { samples: ["7", 0], vae: ["3", 0] } },
    ...outputNodes,
  };

  // Submit prompt
  const submitRes = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!submitRes.ok) {
    const errBody = await submitRes.text().catch(() => "");
    throw new Error(`ComfyUI 提交失败 ${submitRes.status}: ${errBody.slice(0, 500)}`);
  }
  const { prompt_id } = await submitRes.json();

  // Poll history until done — timeout scales with step count (120s/step + 600s buffer)
  const maxPolls = Math.ceil((steps * 120 + 600) / 2);
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const histRes = await fetch(`${base}/history/${prompt_id}`);
    if (!histRes.ok) continue;
    const hist = await histRes.json();
    const entry = hist[prompt_id];
    if (!entry?.outputs) continue;

    // Find the first image output
    for (const nodeOut of Object.values(entry.outputs) as Array<{ images?: Array<{ filename: string; subfolder: string; type: string }> }>) {
      if (!nodeOut.images?.length) continue;
      const img = nodeOut.images[0];
      const viewRes = await fetch(`${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`);
      if (!viewRes.ok) throw new Error("ComfyUI 图片读取失败");
      const buf = await viewRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      return { model: "comfyui", status: "done", imageBase64: b64, elapsedMs: Date.now() - start };
    }
  }

  throw new Error(`ComfyUI 生成超时（超过 ${maxPolls * 2} 秒）`);
}

async function generateClaudeSVG(prompt: string, start: number): Promise<GenerateResult> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: `Create a simple, clean SVG illustration for: "${prompt}"\n\nRules:\n- Return ONLY valid SVG code, starting with <svg and ending with </svg>\n- No markdown, no code blocks, no explanation\n- Keep it concise (under 200 elements)\n- Use viewBox="0 0 512 512" width="512" height="512"`,
    }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log(`[claude-svg] stop_reason=${response.stop_reason} text_len=${text.length}`);

  const fullMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  const svgStart = text.indexOf("<svg");
  const svgCode = fullMatch ? fullMatch[0] : svgStart >= 0 ? text.slice(svgStart).trim() : "";

  if (!svgCode.startsWith("<svg")) {
    throw new Error(`Claude 未能生成有效的 SVG（stop_reason: ${response.stop_reason}）`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("SVG 生成被截断（内容过长），请简化 Prompt 再试");
  }

  return { model: "claude-svg", status: "done", svgCode, elapsedMs: Date.now() - start };
}
