# Palette — Style DNA 提取与多模型对比生图

输入任意网站 URL 或上传设计截图，自动提取视觉风格基因（色彩、字体、间距、组件语言），注入 Prompt 后在多个 AI 生图模型之间并排对比效果。

## 功能

- **风格提取**：分析网站 CSS 或设计截图，输出结构化 Style DNA
- **多模型对比**：同一 Prompt 发送至 DALL-E 3、Gemini Flash Image、Ideogram v2、ComfyUI，结果并排展示
- **风格库**：解析结果自动归档，支持查看详情、删除记录
- **本地生图**：通过 ComfyUI 接入本地 FLUX 模型，完全离线运行

## 技术栈

- **框架**：Next.js 14 App Router + TypeScript
- **样式**：Tailwind CSS
- **AI 解析**：Claude API 或 Ollama（本地，零费用）
- **生图模型**：DALL-E 3 / Gemini Flash Image / Ideogram v2 / ComfyUI（本地 FLUX）

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 填写 ANTHROPIC_API_KEY

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 环境变量

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API Key（服务端解析引擎） |

其余 API Key（OpenAI、Google、Ideogram）在设置页填写，存储于浏览器 localStorage。

## 生图模型配置

| 模型 | 来源 | 说明 |
|------|------|------|
| DALL-E 3 | OpenAI API | 需填写 OpenAI Key |
| Gemini Flash Image | Google API | 需填写 Google Key |
| Ideogram v2 | Ideogram API | 需填写 Ideogram Key |
| ComfyUI | 本地 | 需本地运行 ComfyUI + FLUX 模型 |

## 本地解析引擎（Ollama）

在设置页切换至 Ollama 引擎，无需 API Key，完全本地运行。

需提前安装：
```bash
# 安装 Ollama
brew install ollama

# 拉取视觉模型
ollama pull llama3.2-vision:11b
```

## ComfyUI 本地生图

```bash
# 启动 ComfyUI
bash ~/ComfyUI/start.sh
```

在设置页填写：
- ComfyUI 地址：`http://127.0.0.1:8188`
- 模型文件名：`flux1-dev-Q4_K_S.gguf`（推荐 20 步）或 `flux1-schnell-Q4_K_S.gguf`（推荐 2–10 步）
