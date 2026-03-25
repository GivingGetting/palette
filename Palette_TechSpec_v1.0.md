# Palette — 技术方案设计

**版本** v1.0 · **日期** 2026-03-22 · **关联 PRD** Palette_PRD_v1.1

---

## 一、系统架构总览

```
┌─────────────────────────────────────────────────────┐
│                      Client                         │
│              Next.js 15 (App Router)                │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│                  API Layer                          │
│              Next.js API Routes                     │
│         认证 / 配额校验 / 限流中间件                  │
└──────┬──────────────┬───────────────┬───────────────┘
       │              │               │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│  解析服务   │ │  生图服务  │ │  资源库    │
│  Analyze    │ │  Compare   │ │  Library   │
│  Service    │ │  Service   │ │  Service   │
└──────┬──────┘ └─────┬──────┘ └─────┬──────┘
       │              │               │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│ Playwright  │ │  OpenAI /  │ │ PostgreSQL │
│  抓取引擎   │ │  Anthropic │ │  + S3      │
│             │ │  / Google  │ │            │
└──────┬──────┘ └────────────┘ └────────────┘
       │
┌──────▼──────┐
│   Claude    │
│  Vision API │
│  (分析引擎) │
└─────────────┘
```

---

## 二、Style DNA JSON Schema

解析引擎的核心输出格式，所有模块共享此结构。

```typescript
interface StyleDNA {
  // 元信息
  meta: {
    source_url:    string        // 来源 URL，图片上传则为 null
    source_type:   "url" | "image"
    analyzed_at:   string        // ISO 8601
    analyzer_ver:  string        // "1.0.0"
    confidence:    number        // 0-1，整体置信度
  }

  // 色彩系统
  colors: {
    primary:    ColorToken
    secondary:  ColorToken[]
    background: ColorToken
    surface:    ColorToken
    accent:     ColorToken[]
    semantic: {
      success: ColorToken
      warning: ColorToken
      error:   ColorToken
      info:    ColorToken
    }
    palette:    ColorToken[]     // 完整色盘，最多 12 色
  }

  // 字体规范
  typography: {
    primary_font: FontToken
    secondary_font?: FontToken   // 如有双字体
    scale: {
      display:  TypographyStyle  // 展示型大标题
      heading1: TypographyStyle
      heading2: TypographyStyle
      body:     TypographyStyle
      caption:  TypographyStyle
      code?:    TypographyStyle
    }
  }

  // 空间系统
  spacing: {
    base_unit: number            // px，通常 4 或 8
    scale:     number[]          // 如 [4, 8, 12, 16, 24, 32, 48, 64]
    container_max_width: number  // px
  }

  // 圆角语言
  radius: {
    none:    0
    sm:      number
    md:      number
    lg:      number
    xl:      number
    full:    9999
    default: "sm" | "md" | "lg" | "xl"  // 主要使用哪个级别
  }

  // 组件语言
  components: {
    button: {
      style:       "filled" | "outlined" | "ghost" | "link"
      radius_ref:  "sm" | "md" | "lg" | "full"
      has_shadow:  boolean
    }
    input: {
      style:       "outlined" | "filled" | "underline"
      radius_ref:  "sm" | "md" | "lg"
    }
    card: {
      style:       "elevated" | "outlined" | "flat"
      radius_ref:  "sm" | "md" | "lg" | "xl"
    }
    nav: {
      type:        "top" | "sidebar" | "bottom"
      style:       "transparent" | "filled" | "blur"
    }
  }

  // 整体风格
  aesthetic: {
    mode:         "light" | "dark" | "both"
    density:      "compact" | "medium" | "airy"
    personality:  string[]      // 关键词，如 ["minimal", "technical", "trustworthy"]
    motion:       "none" | "subtle" | "expressive"
    language:     string        // 用于注入 prompt 的自然语言风格描述，约 100 字
  }
}

// 基础类型
interface ColorToken {
  hex:   string                  // "#635BFF"
  name:  string                  // "Brand Purple"
  usage: string                  // "主要按钮、链接、强调"
}

interface FontToken {
  family: string                 // "Inter"
  source: "system" | "google" | "custom"
  weights: number[]              // [400, 500, 600, 700]
}

interface TypographyStyle {
  size:           number         // px
  weight:         number
  line_height:    number         // 倍数
  letter_spacing: number         // em
}
```

---

## 三、API 接口设计

### 基础约定

```
Base URL:  /api/v1
Auth:      Bearer JWT (Authorization header)
Format:    application/json
错误格式:  { "error": { "code": string, "message": string } }
```

### 3.1 解析接口

**POST `/api/v1/analyze`**

发起解析任务（异步）

```typescript
// Request
{
  source_type: "url" | "image"
  url?:        string           // source_type = url 时必填
  image?:      string           // base64，source_type = image 时必填
}

// Response 202
{
  task_id:    string
  status:     "queued"
  poll_url:   "/api/v1/analyze/:task_id"
}
```

**GET `/api/v1/analyze/:task_id`**

轮询解析结果

```typescript
// Response
{
  task_id:    string
  status:     "queued" | "processing" | "done" | "failed"
  progress?:  { step: string; percent: number }  // processing 时返回
  result?:    StyleDNA                            // done 时返回
  error?:     string                              // failed 时返回
}
```

**GET `/api/v1/analyze/:task_id/report`**

获取格式化报告页数据（done 后可用）

---

### 3.2 资源库接口

**GET `/api/v1/library`**

```typescript
// Query Params
{
  page?:     number   // default 1
  limit?:    number   // default 20, max 50
  sort?:     "created_at" | "last_used"  // default created_at
  order?:    "asc" | "desc"             // default desc
  keyword?:  string   // 搜索来源 URL 或标签
}

// Response
{
  data:  LibraryItem[]
  total: number
  page:  number
}
```

**GET `/api/v1/library/:id`** — 获取单条完整 Style DNA

**PATCH `/api/v1/library/:id`** — 更新名称 / 标签

**DELETE `/api/v1/library/:id`** — 删除记录

**POST `/api/v1/library/:id/share`** — 生成只读分享链接

```typescript
// Response
{ share_url: string; expires_at: string | null }
```

---

### 3.3 生图接口

**POST `/api/v1/compare`**

发起多模型生图任务

```typescript
// Request
{
  prompt:       string
  style_dna_id?: string         // 挂载 Style DNA
  models:       ModelKey[]      // 最多 4 个
  user_api_keys: {
    openai?:    string
    anthropic?: string
    google?:    string
  }
}

type ModelKey = "gpt-4o" | "claude-3-5-sonnet" | "gemini-1-5-pro" | "ideogram-v2"

// Response 202
{
  compare_id: string
  jobs: { model: ModelKey; job_id: string; status: "queued" }[]
}
```

**GET `/api/v1/compare/:compare_id`**

轮询各模型状态

```typescript
// Response
{
  compare_id: string
  jobs: {
    model:      ModelKey
    status:     "queued" | "generating" | "done" | "failed" | "timeout"
    image_url?: string    // done 时返回，预签名 S3 URL
    elapsed_ms?: number
    error?:     string
  }[]
}
```

**POST `/api/v1/compare/:compare_id/jobs/:job_id/save`**

收藏某个生图结果到资源库

---

### 3.4 账户接口

**GET `/api/v1/account/quota`**

```typescript
// Response
{
  plan: "free" | "pro"
  analyze: { used: number; limit: number; resets_at: string }
  compare:  { used: number; limit: number; resets_at: string }
}
```

**PUT `/api/v1/account/api-keys`** — 保存用户 API Key（服务端加密存储）

---

## 四、数据库模型

技术栈：**PostgreSQL + Prisma ORM**

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String?
  plan         Plan      @default(FREE)
  created_at   DateTime  @default(now())

  api_keys     ApiKey?
  quota        Quota?
  library      LibraryItem[]
  compares     CompareJob[]
}

model ApiKey {
  id           String   @id @default(cuid())
  user_id      String   @unique
  user         User     @relation(fields: [user_id], references: [id])
  openai_enc   String?  // AES-256-GCM 加密存储
  anthropic_enc String?
  google_enc   String?
  updated_at   DateTime @updatedAt
}

model Quota {
  id              String   @id @default(cuid())
  user_id         String   @unique
  user            User     @relation(fields: [user_id], references: [id])
  analyze_used    Int      @default(0)
  compare_used    Int      @default(0)
  reset_at        DateTime // 每月 1 日 00:00 UTC
}

model LibraryItem {
  id           String    @id @default(cuid())
  user_id      String
  user         User      @relation(fields: [user_id], references: [id])
  name         String?
  source_url   String?
  source_type  SourceType
  thumbnail_url String?
  style_dna    Json      // StyleDNA 完整对象
  tags         String[]
  share_token  String?   @unique
  share_expires DateTime?
  last_used_at DateTime?
  created_at   DateTime  @default(now())
}

model CompareJob {
  id           String    @id @default(cuid())
  user_id      String
  user         User      @relation(fields: [user_id], references: [id])
  prompt       String
  style_dna_id String?
  results      CompareResult[]
  created_at   DateTime  @default(now())
}

model CompareResult {
  id           String       @id @default(cuid())
  compare_id   String
  compare      CompareJob   @relation(fields: [compare_id], references: [id])
  model        String
  status       ResultStatus
  image_url    String?
  elapsed_ms   Int?
  saved        Boolean      @default(false)
  created_at   DateTime     @default(now())
}

enum Plan         { FREE PRO }
enum SourceType   { URL IMAGE }
enum ResultStatus { QUEUED GENERATING DONE FAILED TIMEOUT }
```

---

## 五、解析引擎流程

```
输入 URL
   │
   ▼
Playwright 启动 headless Chrome
   ├── 等待 networkidle
   ├── 截全页截图（PNG）
   └── 提取 computed styles（top 100 元素）
         │ CSS 变量、font-family、color、border-radius...
   ▼
构建分析 payload
   ├── 截图（base64）
   └── CSS 摘要（JSON，<8k tokens）
   ▼
Claude claude-opus-4-6 Vision
   ├── system: Style DNA 提取专家 prompt
   ├── user: 截图 + CSS 摘要
   └── 要求输出严格符合 StyleDNA schema 的 JSON
   ▼
JSON Schema 校验（zod）
   ├── 校验通过 → 存库，返回 done
   └── 校验失败 → 重试一次（最多 2 次），仍失败则返回 failed
```

---

## 六、Style DNA → Prompt 注入规则

生图时将 Style DNA 序列化为自然语言，拼入各模型的 system prompt：

```typescript
function buildStylePrompt(dna: StyleDNA): string {
  return `
Design style reference:
- Color palette: ${dna.colors.primary.hex} (primary), ${dna.colors.accent.map(c => c.hex).join(", ")} (accents)
- Background: ${dna.colors.background.hex}
- Typography: ${dna.typography.primary_font.family}, body ${dna.typography.scale.body.size}px/${dna.typography.scale.body.line_height}
- Border radius: ${dna.radius.default} (${dna.radius[dna.radius.default]}px)
- Density: ${dna.aesthetic.density}
- Mode: ${dna.aesthetic.mode}
- Style: ${dna.aesthetic.language}

Apply this design language strictly to the generated image.
  `.trim()
}
```

---

## 七、技术栈汇总

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | Next.js 15 (App Router) |
| 样式 | Tailwind CSS v4 |
| 数据库 | PostgreSQL (Supabase) |
| ORM | Prisma |
| 文件存储 | AWS S3 / Cloudflare R2 |
| 抓取引擎 | Playwright (Node.js) |
| AI 分析 | Claude claude-opus-4-6（Anthropic SDK） |
| 任务队列 | BullMQ + Redis |
| 认证 | NextAuth.js v5 |
| API Key 加密 | Node.js `crypto` AES-256-GCM |
| Schema 校验 | Zod |
| 部署 | Vercel（前端）+ Railway（Playwright worker）|
