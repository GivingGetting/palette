# Palette — Todo

**更新日期** 2026-03-22

---

## 进行中 / 待确认

- [ ] **测试 4096px AI 放大**：ComfyUI 已重启并加载 `4x-UltraSharp.pth`，在对比页选择 `4096px 4x-UltraSharp` 选项，验证端到端流程
- [ ] **透明背景支持**：Printify 需要 PNG 透明背景，当前 ComfyUI 输出白色背景，需添加背景移除处理（ComfyUI 节点或后处理）

---

## v1.1 功能规划

### 输出格式
- [ ] SVG 格式导出（图像 → SVG 矢量化）
- [ ] Style DNA 导出为 JSON 文件
- [ ] Style DNA 导出为 Figma Token 格式（`$value` / `$type` 结构）

### 解析增强
- [ ] 图片上传解析（拖拽 PNG/JPG → Claude Vision 分析）
- [ ] 批量解析（粘贴多个 URL → 队列处理）

### 用户体验
- [ ] 移动端适配（当前仅桌面端）
- [ ] 对比页图片全屏预览
- [ ] 生成历史记录（本地缓存最近 20 次对比）

---

## v1.2 规划（基础设施）

- [ ] 用户账户系统（NextAuth.js，邮箱 + Google OAuth）
- [ ] 数据库迁移（本地 JSON → PostgreSQL + Prisma）
- [ ] 图片存储（base64 → AWS S3 / Cloudflare R2）
- [ ] API Key 服务端加密存储（AES-256-GCM）
- [ ] 配额管理（免费版：20 次解析 / 50 次生图 / 月）
- [ ] 公开分享链接（只读，不做 SEO 索引）

---

## v1.3 规划（协作与发现）

- [ ] 团队协作空间（共享风格库）
- [ ] 风格相似度搜索（"找与这个风格相似的"）
- [ ] 浏览器插件（一键解析当前页面）

---

## 已完成 ✅

- [x] URL → Style DNA 解析（Playwright + Claude Vision）
- [x] 风格库归档与展示
- [x] 多模型并排生图对比
- [x] DALL-E 3 集成
- [x] Gemini Flash Image 集成
- [x] Ideogram v2 集成
- [x] ComfyUI 本地生成（FLUX.1-schnell GGUF）
- [x] ComfyUI MPS fp8 兼容性修复（`weight_dtype: "default"`）
- [x] ComfyUI 生图步数优化（4 步 → 2 步），超时延长至 700s
- [x] 三档输出尺寸（1024px / 2048px Lanczos / 4096px AI）
- [x] 4x-UltraSharp 放大模型下载与配置
- [x] 图片下载功能（PNG base64）
- [x] 设置页 ComfyUI 模型文件名配置
- [x] CLAUDE.md 项目文档
- [x] PRD.md / Agents.md / Context.md / Todo.md 文档
