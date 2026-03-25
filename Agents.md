# Palette — AI Agent 架构

**日期** 2026-03-22

本文档描述 Palette 中所有 AI Agent 的职责、调用方式与配置。

---

## 一、Agent 总览

```
用户输入 URL
     │
     ▼
┌─────────────────────┐
│  Scraper Agent      │  Playwright 抓取页面截图 + CSS 样式
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Style DNA Agent    │  Claude Vision 分析，输出结构化 StyleDNA JSON
│  (claude-opus-4-6)  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Prompt Builder     │  StyleDNA → 生图 Prompt（buildStylePrompt）
└────────┬────────────┘
         │
    ┌────┴────────────────────────────────┐
    │    并发图像生成 Agents              │
    ├────────────┬───────────┬────────────┤
    ▼            ▼           ▼            ▼
DALL-E 3    Gemini Flash  Ideogram v2  ComfyUI
(OpenAI)    (Google)      (Ideogram)   (本地)
```

---

## 二、Style DNA Agent

### 职责
分析任意网站的视觉风格，输出结构化的设计参数（StyleDNA）。

### 实现

**文件**：`src/lib/analyzer/claude-analyzer.ts`

**调用模型**：`claude-opus-4-6`（Anthropic SDK，服务端）

**输入**：
- 页面截图（base64 PNG，Playwright 全页截图）
- CSS 样式摘要（computed styles JSON，top 100 元素）

**输出**：`StyleDNA` JSON（严格 Zod schema 校验）

**Prompt 策略**：
- System：Style DNA 提取专家角色，要求输出符合固定 JSON schema
- User：截图 + CSS 摘要
- 校验失败时最多重试 1 次

**Schema 核心字段**（详见 `src/lib/analyzer/schema.ts`）：
```typescript
{
  meta:       { source_url, analyzed_at, confidence }
  colors:     { primary, secondary[], background, accent[], palette[] }
  typography: { primary_font, scale: { heading1, body, caption } }
  spacing:    { base_unit, container_max_width }
  radius:     { sm, md, lg, xl, default }
  components: { button, input, card, nav }
  aesthetic:  { mode, density, personality[], language }
}
```

**环境变量**：`ANTHROPIC_API_KEY`（`.env.local`，不暴露给客户端）

---

## 三、图像生成 Agents

所有生图 Agent 均在 `src/app/api/v1/compare/route.ts` 中实现，由前端 `/compare` 页面并发调用。

API Key 由用户通过设置页填写，存 `localStorage`，每次请求时前端随 body 传入后端。

### 3.1 DALL-E 3 Agent

| 属性 | 值 |
|------|-----|
| 模型 ID | `gpt-4o` |
| 实际调用 | DALL-E 3（`dall-e-3`） |
| API Endpoint | `https://api.openai.com/v1/images/generations` |
| 输出尺寸 | 1024×1024 |
| 响应格式 | `b64_json`（base64 PNG） |
| Key 字段 | `user_api_keys.openai` |

```typescript
body: { model: "dall-e-3", prompt, n: 1, size: "1024x1024", response_format: "b64_json" }
```

---

### 3.2 Gemini Flash Image Agent

| 属性 | 值 |
|------|-----|
| 模型 ID | `gemini-flash-image` |
| 实际调用 | `gemini-2.5-flash-image` |
| API Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/...` |
| 响应格式 | `inlineData`（base64） |
| Key 字段 | `user_api_keys.google` |

```typescript
generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
```

---

### 3.3 Ideogram v2 Agent

| 属性 | 值 |
|------|-----|
| 模型 ID | `ideogram-v2` |
| 实际调用 | Ideogram V_2 |
| API Endpoint | `https://api.ideogram.ai/generate` |
| 响应格式 | URL → 服务端 fetch → base64 |
| Key 字段 | `user_api_keys.ideogram` |

```typescript
image_request: { prompt, model: "V_2", magic_prompt_option: "OFF", aspect_ratio: "ASPECT_1_1" }
```

---

### 3.4 ComfyUI Local Agent

| 属性 | 值 |
|------|-----|
| 模型 ID | `comfyui` |
| 推理引擎 | FLUX.1-schnell GGUF（本地） |
| 访问地址 | `http://127.0.0.1:8188`（用户配置） |
| 通信协议 | ComfyUI REST API（`/prompt` + `/history` 轮询） |
| 默认模型文件 | `flux1-schnell-Q4_K_S.gguf` |
| 推理步数 | 2 steps（euler sampler，simple scheduler） |
| 超时 | 700s（350 次轮询 × 2s） |
| Key 字段 | `user_api_keys.comfyui_url`, `user_api_keys.comfyui_model` |

**Workflow 节点（GGUF 版）**：
```
UnetLoaderGGUF → DualCLIPLoader → CLIPTextEncode → FluxGuidance
                VAELoader     ↗                              ↓
                EmptySD3LatentImage                    KSampler
                                                           ↓
                                                      VAEDecode
                                                           ↓
                                            [ImageScale / UpscaleModelLoader]
                                                           ↓
                                                       SaveImage
```

**输出尺寸模式（`comfyui_upscale`）**：

| 模式 | 节点 | 输出 |
|------|------|------|
| `none` | 直接 `SaveImage` | 1024×1024 |
| `lanczos_2x` | `ImageScale`（lanczos） | 2048×2048 |
| `ai_4x` | `UpscaleModelLoader` + `ImageUpscaleWithModel` | 4096×4096 |

**已安装 ComfyUI 插件**：
- `ComfyUI-GGUF`：支持 `.gguf` 格式模型加载（`UnetLoaderGGUF` 节点）

**已下载放大模型**：
- `4x-UltraSharp.pth`（`models/upscale_models/`）：AI 神经网络 4x 放大

---

## 四、Prompt Builder

**文件**：`src/lib/analyzer/prompt.ts`

函数 `buildStylePrompt(dna: StyleDNA): string` 将 Style DNA 序列化为自然语言，拼入生图请求的 prompt 前缀：

```
Design style reference:
- Color palette: #635BFF (primary), ... (accents)
- Background: #FFFFFF
- Typography: Inter, body 16px/1.5
- Border radius: md (8px)
- Density: medium
- Mode: light
- Style: [aesthetic.language 约 100 字]

Apply this design language strictly to the generated image.
```

---

## 五、Agent 配置汇总

| Agent | 部署位置 | 授权方式 | 超时 |
|-------|---------|---------|------|
| Style DNA（Claude） | Next.js API Route（服务端） | `ANTHROPIC_API_KEY` 环境变量 | 默认 |
| DALL-E 3 | Next.js API Route（服务端代理） | 用户 BYOK | 默认 fetch |
| Gemini Flash Image | Next.js API Route（服务端代理） | 用户 BYOK | 默认 fetch |
| Ideogram v2 | Next.js API Route（服务端代理） | 用户 BYOK | 默认 fetch |
| ComfyUI | 用户本地机器（`127.0.0.1:8188`） | 无认证（本地） | 700s |
