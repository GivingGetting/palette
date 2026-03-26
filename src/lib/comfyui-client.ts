type UpscaleMode = "none" | "lanczos_2x" | "ai_4x";

export interface ComfyUIResult {
  imageBase64: string;
  elapsedMs: number;
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateComfyUI(
  prompt: string,
  serverUrl: string,
  modelName: string | undefined,
  upscaleMode: UpscaleMode,
  customSteps?: number
): Promise<ComfyUIResult> {
  const start = Date.now();
  const base = serverUrl.replace(/\/$/, "");
  const unetName = modelName || "flux1-dev-Q4_K_S.gguf";
  const isDev = unetName.includes("dev");
  const steps = customSteps ?? (isDev ? 20 : 2);
  const guidance = isDev ? 3.0 : 3.5;
  const scheduler = isDev ? "beta" : "simple";
  const seed = Math.floor(Math.random() * 2 ** 32);

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

  const maxPolls = Math.ceil((steps * 120 + 600) / 2);
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const histRes = await fetch(`${base}/history/${prompt_id}`);
    if (!histRes.ok) continue;
    const hist = await histRes.json();
    const entry = hist[prompt_id];
    if (!entry?.outputs) continue;

    for (const nodeOut of Object.values(entry.outputs) as Array<{ images?: Array<{ filename: string; subfolder: string; type: string }> }>) {
      if (!nodeOut.images?.length) continue;
      const img = nodeOut.images[0];
      const viewRes = await fetch(`${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`);
      if (!viewRes.ok) throw new Error("ComfyUI 图片读取失败");
      const buf = await viewRes.arrayBuffer();
      const imageBase64 = await arrayBufferToBase64(buf);
      return { imageBase64, elapsedMs: Date.now() - start };
    }
  }

  throw new Error(`ComfyUI 生成超时（超过 ${maxPolls * 2} 秒）`);
}
