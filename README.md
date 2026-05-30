# Pi 中文文档

Pi Coding Agent 的中文翻译文档站点，基于 [VitePress](https://vitepress.dev/) 构建。

原始文档来自 [earendil-works/pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs)。

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

启动后访问 `http://localhost:5173` 查看文档站点。

### 构建部署

```bash
npm run build
```

构建产物在 `docs/.vitepress/dist` 目录中，可以部署到任何静态托管服务（如 GitHub Pages、Vercel、Netlify 等）。

### 预览构建结果

```bash
npm run preview
```

## 部署到 GitHub Pages

本项目已配置 GitHub Actions 自动部署。推送到 `main` 分支后会自动构建并部署到 GitHub Pages。

手动部署步骤：

1. 在仓库 Settings > Pages 中，将 Source 设置为 "GitHub Actions"
2. 推送代码到 `main` 分支即可触发自动部署

## 文档目录

- [快速开始](docs/quickstart.md)
- [文档首页](docs/index.md)
- [使用指南](docs/usage.md)
- [自定义模型](docs/models.md)
- [提供商](docs/providers.md)
- [自定义提供商](docs/custom-provider.md)
- [扩展](docs/extensions.md)
- [设置](docs/settings.md)
- [快捷键](docs/keybindings.md)
- [会话](docs/sessions.md)
- [会话格式](docs/session-format.md)
- [压缩](docs/compaction.md)
- [技能](docs/skills.md)
- [包管理](docs/packages.md)
- [提示模板](docs/prompt-templates.md)
- [TUI 组件](docs/tui.md)
- [RPC 模式](docs/rpc.md)
- [SDK](docs/sdk.md)
- [JSON 事件流](docs/json.md)
- [主题](docs/themes.md)
- [终端设置](docs/terminal-setup.md)
- [Shell 别名](docs/shell-aliases.md)
- [tmux 设置](docs/tmux.md)
- [Termux 支持](docs/termux.md)
- [Windows 设置](docs/windows.md)
- [开发指南](docs/development.md)
