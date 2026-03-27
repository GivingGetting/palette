# Palette — Style DNA 提取与多模型对比生图

## 项目简介

**Palette** 是一个设计风格提取与生图对比工具：
1. 输入任意网站 URL，用 Claude 分析提取「Style DNA」（色彩、字体、版式、美学风格）
2. 将 Style DNA 注入 Prompt，在多个图像生成模型之间并排对比效果

## 技术栈

- **框架**：Next.js 15 App Router，TypeScript
- **样式**：Tailwind CSS
- **AI 解析引擎**：Claude（`ANTHROPIC_API_KEY`，服务端）或 Ollama（本地，免费）
- **生图模型**：DALL-E 3 / Gemini Flash Image / Ideogram v2 / ComfyUI（BYOK）

## 目录结构

```
src/
  app/
    page.tsx                  # 首页（URL 输入 → 触发分析）
    library/page.tsx          # 风格库（列出所有已分析的 Style DNA）
    compare/page.tsx          # 多模型对比生图页
    settings/page.tsx         # API Key 设置页（存 localStorage）
    analyze/[id]/page.tsx     # 单个 Style DNA 详情页
    api/v1/
      analyze/route.ts        # POST：抓取网页 → Claude/Ollama 分析 → 存库
      analyze/[task_id]/route.ts  # GET：轮询任务状态（读 Supabase tasks 表）
      library/[id]/route.ts   # GET：获取单个 Style DNA
      compare/route.ts        # POST：并发调用云端生图模型（OpenAI/Gemini/Ideogram/Claude SVG）
  lib/
    analyzer/
      claude-analyzer.ts      # Claude 调用逻辑
      ollama-analyzer.ts      # Ollama 本地模型调用逻辑
      schema.ts               # StyleDNA Zod schema
      prompt.ts               # buildStylePrompt() — DNA 转生图 Prompt
      scraper.ts              # 网页内容抓取
    store/
      library.ts              # Style DNA 持久化（Supabase library 表）
      tasks.ts                # 分析任务状态管理（Supabase tasks 表）
    comfyui-client.ts         # ComfyUI 浏览器直连逻辑（绕过 Vercel serverless）
```

## 关键数据类型

`StyleDNA`（定义在 `src/lib/analyzer/schema.ts`）：
- `meta`：来源 URL、标题、抓取时间
- `colors.palette`：主色调列表（hex + 语义标签）
- `typography`：字体家族、尺寸规律、字重
- `layout`：布局风格、间距密度、圆角风格
- `aesthetic`：personality 标签、情绪词、设计流派

## 生图模型配置

所有 API Key 存在用户浏览器 localStorage（`palette_api_keys`），每次请求时由前端传给后端。

| 模型 | keyId | 调用方式 | 说明 |
|------|-------|----------|------|
| DALL-E 3 | `openai` | 服务端（Vercel） | 返回 base64 (`b64_json`) |
| Gemini Flash Image | `google` | 服务端（Vercel） | 模型：`gemini-2.5-flash-image` |
| Ideogram v2 | `ideogram` | 服务端（Vercel） | 服务端转 base64 |
| ComfyUI | `comfyui_url` + `comfyui_model` | **浏览器直连** | 本地服务，轮询 history；绕过 Vercel serverless |
| Claude SVG | — | 服务端（Vercel） | Claude 生成 SVG 代码 |

> **ComfyUI 浏览器直连**：Vercel serverless 无法访问 `127.0.0.1`，因此 ComfyUI 请求由浏览器直接发出（`src/lib/comfyui-client.ts`）。其他模型仍走 `/api/v1/compare`。

## ComfyUI 本地配置

- **安装路径**：`~/ComfyUI`
- **启动命令**：`bash ~/ComfyUI/start.sh`（后台或终端运行）
- **访问地址**：`http://127.0.0.1:8188`
- **运行环境**：Apple M4，16GB 统一内存，MPS 加速
- **CORS**：`start.sh` 已加 `--enable-cors-header`，允许浏览器跨域访问（部署到 Vercel 后必须）

### 已下载模型文件

| 文件 | 路径 | 说明 |
|------|------|------|
| `flux1-dev-Q4_K_S.gguf` | `models/unet/` | **当前主模型**，dev Q4 量化，质量优先 |
| `flux1-schnell-Q4_K_S.gguf` | `models/unet/` | schnell Q4 量化（6.3GB），速度优先备用 |
| `flux1-schnell.safetensors` | `models/unet/` | 原始 bf16（22GB），内存不足无法使用 |
| `t5xxl_fp8_e4m3fn.safetensors` | `models/clip/` | T5 文本编码器 |
| `clip_l.safetensors` | `models/clip/` | CLIP-L 文本编码器 |
| `ae.safetensors` | `models/vae/` | FLUX VAE |

### FLUX.1-dev vs FLUX.1-schnell

| | dev | schnell |
|---|---|---|
| 训练方式 | 引导蒸馏 | 蒸馏 |
| 推荐步数 | **20–30 步** | 2 步（快）/ 10 步（清晰） |
| 生图时间（M4 16GB） | ~30–50 分钟 | 2步 ~3分钟 / 10步 ~20–30分钟 |
| 图像质量 | 明显更好 | 一般 |
| 许可证 | 非商业 | Apache 2.0 |

> **注意**：dev 模型在 4 步时图像模糊是正常现象（去噪严重不足），需要 20+ 步才能收敛。代码通过 `unetName.includes("dev")` 自动切换参数（steps=20, scheduler="beta"）。

### 已安装 ComfyUI 插件

- `ComfyUI-GGUF`（`custom_nodes/ComfyUI-GGUF`）：支持 GGUF 格式模型加载

### ComfyUI Workflow 说明

使用 FLUX.1 GGUF 工作流（定义在 `src/lib/comfyui-client.ts`，浏览器端执行）：
- `UnetLoaderGGUF` 加载主模型（非 `UNETLoader`，因为是 GGUF 格式）
- `weight_dtype` 不可用 `fp8_e4m3fn`（MPS 不支持）
- dev 默认 20 步，耗时约 30–50 分钟；schnell 默认 2 步，耗时约 3–4 分钟
- schnell 步数建议：2 步（最快）或 10 步（更清晰）；4 步是已知次优区间，反而可能模糊
- 超时设置随步数动态计算（120s/步 + 600s buffer）：10步约30分钟，20步约50分钟

## Ollama 本地解析引擎

用户可在设置页切换 Claude ↔ Ollama，Ollama 完全本地运行、零费用。

### 已安装模型

| 模型 | 大小 | 用途 |
|------|------|------|
| `llama3.2-vision:11b` | 7.8 GB | URL 分析（CSS）+ 图片视觉分析 |

### 关键参数配置（`ollama-analyzer.ts`）

```
num_ctx:      8192   # 16384 在 16GB M4 会触发 swap，推理超时；8192 是上限
num_predict:  8192   # 最大输出 token 数
repeat_penalty: 1.0  # 关闭重复惩罚；默认 1.1 会在 JSON 重复结构处提前停止生成
```

### URL 分析 vs 图片分析

| 场景 | 输入 | 限制 |
|------|------|------|
| URL 分析 | CSS 变量 + 计算样式（无截图） | 稳定，约 2–5 分钟 |
| 图片分析 | 截图 base64（< 1 MB） | 约 5–8 分钟；>1 MB 报错建议用 Claude |

### 输出格式要求

Prompt 要求模型输出 **minified JSON**（无空格无换行），原因：
- 格式化 JSON 约 4000–6000 字符，会撑满 8192 token 的可用输出空间
- Minified JSON 约 1500–2000 字符，能在 token 限制内完整输出

### 缺失字段自动补全

视觉模型（从图片分析）难以推断 `typography.scale` 和 `components.nav`，
`ollama-analyzer.ts` 在 Zod 校验前自动填入合理默认值，不影响其他字段。

### 流式读取实现注意事项

Ollama streaming API 每条 JSON line 对应一个 token chunk。`reader.read()` 按字节分块，
**一行 JSON 可能横跨两个 chunk**，必须用 `lineBuffer` 缓冲不完整行再拼接，
否则 `JSON.parse` 失败后静默丢弃内容，导致输出截断（历史 bug：len=1728）。

## 部署

- **平台**：Vercel（`donna-lius-projects` 团队，项目名 `palette`）
- **生产 URL**：`https://palette-lemon.vercel.app`
- **框架设置**：`vercel.json` 中 `"framework": "nextjs"`
- **任务状态持久化**：Supabase `tasks` 表（带 RLS），解决 serverless 多实例内存隔离问题
- **部署命令**：`VERCEL_ORG_ID=team_65UWDbQdcJSupmqakMu6sVP4 VERCEL_PROJECT_ID=prj_XGR9WHFS5FdfVh50p7Wx3abY5lUw vercel --prod --yes`

### Supabase 表结构

```sql
-- tasks 表（分析任务状态）
create table tasks (
  id text primary key,
  user_id uuid references auth.users not null,
  status text not null default 'queued',
  step text,
  percent float,
  result jsonb,
  error text,
  created_at bigint not null
);
alter table tasks enable row level security;
create policy "用户只能访问自己的任务" on tasks for all using (auth.uid() = user_id);
```

## 已知限制

- ComfyUI 每次生图约 3–4 分钟（MPS + GGUF 推理速度限制）
- `flux1-schnell.safetensors`（22GB bf16）在 16GB 机器上会 OOM，必须用 GGUF 版本
- fp8 类型在 Apple MPS 上不支持（报 `TypeError: Trying to convert Float8_e4m3fn`）
- ComfyUI 需要手动启动，不会随项目自动启动；关机后需重新运行 `bash ~/ComfyUI/start.sh`
- Ollama `num_ctx: 16384` 在 M4 16GB 上会 swap → 推理超时，上限为 8192
- ComfyUI 浏览器直连要求用户本地 ComfyUI 正在运行且 `--enable-cors-header` 已开启

## 环境变量

```
ANTHROPIC_API_KEY=              # Claude API Key（服务端，.env.local 本地 / Vercel 环境变量）
NEXT_PUBLIC_SUPABASE_URL=       # Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key
```

其余 Key（**Anthropic BYOK**、OpenAI、Google、Ideogram、ComfyUI）由用户在设置页填写，存 localStorage。

- `ANTHROPIC_API_KEY`（服务端环境变量）是默认 fallback；用户在设置页填写自己的 Anthropic Key 后优先使用，可覆盖服务端默认值。
