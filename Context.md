# Palette — 项目上下文

**日期** 2026-03-22
**用途** 为 AI 编程助手、新成员、代码审查提供项目背景

---

## 一、项目现状

这是一个**单人开发的本地工具**，尚未部署到生产环境。当前实现是功能完整的 MVP，在本地运行良好。

**已完成的核心功能**：
- URL → Style DNA 解析（Claude 视觉分析）
- 风格库（本地 JSON 持久化）
- 多模型生图对比（DALL-E 3 / Gemini / Ideogram / ComfyUI）
- ComfyUI 本地生成，支持 1024px / 2048px / 4096px 三档输出
- 图片下载

**尚未实现（PRD 规划中）**：
- 用户账户系统
- 数据库（目前用本地 JSON 文件）
- 图片存储（目前返回 base64）
- SVG 输出
- 移动端适配

---

## 二、技术架构

### 框架与运行环境

- **Next.js 14 App Router**，TypeScript，Tailwind CSS
- 本地开发：`npm run dev`（端口 3000）
- Node.js API Routes 处理所有后端逻辑

### 数据存储（当前）

本地 JSON 文件，无数据库：
- `src/lib/store/library.ts`：Style DNA 库（读写本地 JSON）
- `src/lib/store/tasks.ts`：分析任务状态

### API 结构

```
src/app/api/v1/
  analyze/route.ts          POST：触发 URL 分析
  analyze/[id]/route.ts     GET：查询分析状态/结果
  library/route.ts          GET：获取风格库列表
  library/[id]/route.ts     GET：获取单个 Style DNA
  compare/route.ts          POST：并发多模型生图
```

### 关键业务文件

```
src/lib/analyzer/
  claude-analyzer.ts        Claude API 调用，输出 StyleDNA JSON
  schema.ts                 StyleDNA Zod schema（约束 Claude 输出格式）
  prompt.ts                 buildStylePrompt()：StyleDNA → 生图 Prompt
  scraper.ts                Playwright 抓取页面
```

### 前端页面

```
src/app/
  page.tsx                  首页（URL 输入框）
  library/page.tsx          风格库列表
  compare/page.tsx          多模型对比生图（核心交互页）
  settings/page.tsx         API Key 设置（localStorage）
```

---

## 三、关键架构决策

### 决策 1：API Key BYOK（用户自带）

**原因**：规避平台承担 AI API 成本。
**实现**：Key 存浏览器 localStorage（`palette_api_keys`），每次生图请求时前端读取后随 body 传给后端，后端只用于当次请求，不持久化存储。
**影响**：后端完全无状态，用户换设备需重新填写 Key。

### 决策 2：ComfyUI 本地推理（GGUF 量化）

**原因**：Apple M4 16GB 统一内存无法加载 FLUX.1-schnell 原始 bf16 模型（22GB），会 OOM。
**解法**：使用 Q4_K_S GGUF 量化版（6.3GB），配合 ComfyUI-GGUF 插件的 `UnetLoaderGGUF` 节点。
**影响**：生图速度约 3–5 分钟，需用户手动启动 ComfyUI 服务。

### 决策 3：fp8 dtype 在 Apple MPS 上不支持

**原因**：`TypeError: Trying to convert Float8_e4m3fn to the MPS backend`。
**解法**：`weight_dtype` 改为 `"default"`，让 ComfyUI 自动选择兼容 dtype（bfloat16）。
**记录在**：`src/app/api/v1/compare/route.ts` DualCLIPLoader 节点配置。

### 决策 4：ComfyUI 轮询超时设为 700s

**原因**：GGUF Q4_K_S + MPS，每步约 85–110s，2 步 = ~170–220s，加上 VAE 解码和放大节点，实测需 3–5 分钟。
**实现**：轮询 350 次 × 2s 间隔 = 700s 最大等待时间。

### 决策 5：本地 JSON 存储（暂不用数据库）

**原因**：MVP 阶段单人本地使用，避免引入数据库复杂性。
**未来**：生产化时迁移到 PostgreSQL + Prisma（技术方案已在 `Palette_TechSpec_v1.0.md` 中设计完毕）。

### 决策 6：Vercel Serverless 后台任务 waitUntil

**原因**：`analyze/route.ts` 需要在返回 202 后继续执行 Playwright 抓取 + Claude 分析（耗时 1–5 分钟）。Vercel Serverless 在返回 HTTP 响应后会立刻冻结执行上下文。
**解法**：使用 `@vercel/functions` 的 `waitUntil()` 包裹后台任务，并导出 `maxDuration = 300`（5 分钟）。
**影响**：需要 Vercel Pro Plan 才能使用超过 10s 的 maxDuration。

---

## 四、本地开发环境

### 环境变量

```bash
# .env.local（不提交 git）
ANTHROPIC_API_KEY=sk-ant-...
```

### 启动项目

```bash
# 启动 Next.js
cd ~/Desktop/Liu/antigravity/风格提取
npm run dev

# 启动 ComfyUI（需要生图时）
bash ~/ComfyUI/start.sh
# 默认监听 http://127.0.0.1:8188
```

### ComfyUI 配置

| 项 | 值 |
|----|----|
| 安装路径 | `~/ComfyUI` |
| 虚拟环境 | `~/ComfyUI/venv` |
| 启动脚本 | `~/ComfyUI/start.sh` |
| 监听地址 | `http://127.0.0.1:8188` |
| 主模型 | `models/unet/flux1-schnell-Q4_K_S.gguf` |
| CLIP | `models/clip/t5xxl_fp8_e4m3fn.safetensors` + `clip_l.safetensors` |
| VAE | `models/vae/ae.safetensors` |
| 放大模型 | `models/upscale_models/4x-UltraSharp.pth` |
| 自定义节点 | `custom_nodes/ComfyUI-GGUF` |

### ComfyUI 端口冲突处理

```bash
lsof -ti :8188 | xargs kill -9
bash ~/ComfyUI/start.sh
```

---

## 五、已知问题与限制

| 问题 | 原因 | 状态 |
|------|------|------|
| ComfyUI 生图约 3–5 分钟 | MPS + GGUF 推理速度限制 | 已知，接受 |
| `flux1-schnell.safetensors` 无法使用 | 22GB 超过 16GB 内存 | 已知，用 GGUF 替代 |
| fp8 在 MPS 上报错 | Apple MPS 不支持 Float8 | 已修复（`weight_dtype: "default"`） |
| ComfyUI 需手动启动 | 无自动服务管理 | 已知，接受 |
| API Key 重置问题 | localStorage 随浏览器清理 | 已知，接受（MVP 阶段） |
| 图片以 base64 传输 | 无文件存储服务 | 已知，未来迁移 S3 |
| Vercel 后台任务被终止 | Serverless 返回响应后冻结上下文 | 已修复（`waitUntil` + `maxDuration=300`） |

---

## 六、Printify 印刷规格参考

Palette 的 ComfyUI 高分辨率输出功能是为 Printify 等印刷平台设计的：

| 产品类型 | 最低分辨率 | Palette 对应选项 |
|---------|-----------|----------------|
| 贴纸/方形印刷品 | 2048×2048 @ 300 DPI | Lanczos 2x（2048px） |
| T-shirt | 4500×5400 @ 300 DPI | AI 4x（4096px，接近要求） |
| 海报 | 按尺寸定 | AI 4x（4096px） |

**格式要求**：PNG，透明背景（ComfyUI 当前输出白背景，透明背景需单独处理）

---

## 七、代码规范

- 所有前后端代码使用 TypeScript，严格类型
- Zod 用于 API 输入校验和 StyleDNA schema 验证
- 错误统一返回 `NextResponse.json({ error: "..." }, { status: 4xx })`
- 中文注释保留（项目为中文环境开发）
