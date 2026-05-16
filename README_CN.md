<div align="center">
  <a href="https://github.com/poixeai/translate">
    <img src="./public/x.svg" alt="logo" width="100" height="100">
  </a>
  <h1>Poixe Translate</h1>
  <p>一款基于 AI 大模型的轻量化 Web 翻译工具</p>

[English](./README.md) / 简体中文

  <p>
    <a href="https://github.com/poixeai/translate/blob/main/LICENSE">
      <img alt="License" src="https://img.shields.io/github/license/poixeai/translate?style=for-the-badge&color=blue">
    </a>
    <a href="https://github.com/poixeai/translate">
      <img alt="Vite" src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white">
    </a>
    <a href="https://github.com/poixeai/translate/stargazers">
      <img alt="Stars" src="https://img.shields.io/github/stars/poixeai/translate?style=for-the-badge&logo=github">
    </a>
    <a href="https://github.com/poixeai/translate/issues">
      <img alt="Issues" src="https://img.shields.io/github/issues/poixeai/translate?style=for-the-badge&logo=github">
    </a>
  </p>

  <h4>
    <a href="https://translate.poixe.com">演示网站</a>
    <span> · </span>
    <a href="#quick-start">快速开始</a>
    <span> · </span>
    <a href="#deploy">部署教程</a>
    <span> · </span>
    <a href="#model">支持模型</a>
    <span> · </span>
    <a href="#language">翻译语言</a>
  </h4>
  
  <img src="./docs/assets/poster-1.png" alt="poster">
</div>

---

Poixe Translate 是一个基于 AI 大模型的开源 Web 翻译工具。翻译请求仍然由浏览器直接发送到你配置的模型服务商，而内置的 Go 后端负责登录鉴权、管理接口、Provider 密钥加密存储以及用户偏好保存。

## 功能特性

- **浏览器直连模型服务商**：翻译请求直接从浏览器发往你配置的服务商，模型流量始终由你自己掌控。
- **服务端鉴权**：内置登录、刷新令牌、退出登录和受保护的管理接口，适合多用户或受管部署场景。
- **Provider 密钥落库加密**：模型服务商的 API Key 会先加密，再写入后端数据库。
- **支持自定义模型提供商**：可自定义模型厂商，配置 API Endpoint、API Key、接口协议和模型列表，自由切换模型。
- **支持 4 种主流 AI 接口协议**：可接入不同 AI 服务商或兼容平台，灵活扩展。
- **支持自定义翻译提示词**：支持自定义提示词（Prompts），用户可根据专业领域（如法律、IT、医学）或特殊口吻自由定制翻译逻辑，实现高度精准的上下文翻译。
- **支持 186 种翻译语言**：覆盖自然语言、地区语言变体、方言、古语言以及部分人造语言等多种语言类型。
- **支持 15 种 UI 界面语言**：适合全球化使用和开源分发。
- **主题切换**：支持系统主题跟随，也支持手动切换。
- **本地持久化存储**：通过 IndexedDB 保存配置数据，提升使用体验。

## 技术栈

本项目基于现代 Web 技术栈构建，确保高性能与良好的开发体验：

- React
- Vite
- TypeScript
- shadcn/ui
- Tailwind CSS 
- Dexie.js (IndexedDB)
- Gin
- SQLite

## 开始使用 <a id="quick-start"></a>

1. **准备后端密钥配置**：启动后端前先设置 `ADMIN_PASSWORD`、`JWT_SECRET` 和 `ENCRYPTION_KEY`。如果开发时前后端分开运行，还需要配置 `CORS_ALLOWED_ORIGINS`。
2. **启动应用**：最快方式是直接使用 Docker Compose，也可以分别启动前端和后端。
3. **登录系统**：打开应用后，使用配置好的管理员账号登录。
4. **配置模型厂商**：点击右上角设置按钮，进入配置页面，添加一个模型提供商（Provider），填入对应厂商的 Endpoint、API Key，选择对应的接口协议，输入支持的模型列表。
5. **选择模型和目标语言**：在主界面选择需要使用的 AI 模型、目标语言和翻译提示词。
6. **执行翻译**：在输入框内输入需要翻译的内容，点击翻译按钮即可获取结果。

> 图文教程参见 [使用教程（图文版本）](docs/cn/guild.md)。

## 支持的 AI 模型 <a id="model"></a>

Poixe Translate 当前支持 4 种主流 AI 接口协议，可接入兼容这些协议的平台、模型服务或自建网关。

### 已支持的接口协议

| 名称 | 路径 | 官方文档 |
|---|---|---|
| OpenAI Chat Completions | `/v1/chat/completions` | [官方文档](https://developers.openai.com/api/reference/resources/chat) |
| OpenAI Responses | `/v1/responses` | [官方文档](https://developers.openai.com/api/reference/resources/responses/methods/create) |
| Anthropic Messages | `/v1/messages` | [官方文档](https://platform.claude.com/docs/en/api/messages/create) |
| Google Gemini Generate Content | `/v1beta/models/{model}:generateContent` | [官方文档](https://ai.google.dev/gemini-api/docs/text-generation?hl=zh-cn) |

### 可接入的模型服务

只要你的服务商兼容上述协议，通常都可以接入，例如：

* OpenAI
* Anthropic Claude
* Google Gemini
* DeepSeek
* Grok
* Qwen
* 自建兼容网关
* 其他模型聚合平台

### 配置模型厂商时需要填写

* Name
* API Endpoint
* API Key
* API Style
* Model List

这意味着你可以根据自己的需求自由切换不同模型来源，而不被绑定在单一平台。

## 支持的翻译语言 <a id="language"></a>

Poixe Translate 当前支持 **186 种翻译语言**，覆盖全球主流语言及多种地区语言变体，可满足日常交流、学习、工作与专业场景下的翻译需求。

以下仅列举部分支持语言：

- English
- 简体中文
- 繁體中文
- 日本語
- 한국어
- Français
- Deutsch
- Español
- Português
- Русский
- हिन्दी
- Bahasa Indonesia
- Italiano
- Nederlands

> 完整语言列表请以应用内实际支持内容为准。

## 部署 <a id="deploy"></a>

Poixe Translate 现在是一个轻量级前后端一体应用：前端通过 Nginx 提供静态资源，后端负责 `/api` 接口、登录鉴权、Provider 加密存储和偏好设置持久化。

### Docker Compose

1. 先准备好环境变量，至少设置 `ADMIN_PASSWORD`、`JWT_SECRET` 和 `ENCRYPTION_KEY`。
2. 启动服务：

```bash
docker compose up -d --build
```

应用启动后可通过 `http://localhost:8080` 访问。

### Docker

```bash
# 克隆源码
git clone https://github.com/poixeai/translate.git
cd translate

# 构建镜像
docker build -t poixeai/translate:latest .

# 运行容器，并显式传入必须的密钥配置
docker run -d \
  -p 8080:80 \
  --name poixe-translate \
  --restart=always \
  -e ADMIN_PASSWORD='replace-me' \
  -e JWT_SECRET='replace-with-a-long-random-secret' \
  -e ENCRYPTION_KEY='replace-with-a-long-random-secret' \
  poixeai/translate:latest
```

### Vercel 或纯静态托管

当前带鉴权的版本依赖后端 `/api` 接口，因此单独部署静态前端已经不够。如果你要分开部署前端，需要同时运行 Go 后端，并把 `/api` 请求反向代理到后端服务。

### 手动部署

```bash
# 安装前端依赖
npm install

# 构建前端静态资源
npm run build

# 启动后端 API
cd backend
go run .
```

将生成后的 `dist/` 目录交给任意静态文件服务器，再把 `/api` 请求反向代理到 Go 后端即可。

## 测试

```bash
npm run test
```

## 贡献

欢迎提交 Issue 和 Pull Request。

## 开源协议

本项目采用 [MIT License](./LICENSE) 开源协议。
