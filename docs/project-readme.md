# Pi Agent Harness 单体仓库

这是 pi agent harness 项目的主仓库，包括我们的自扩展编码代理。

* **[@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)**：交互式编码代理 CLI
* **[@earendil-works/pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent)**：带有工具调用和状态管理的 Agent 运行时
* **[@earendil-works/pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)**：统一的多供应商 LLM API（OpenAI、Anthropic、Google 等）

了解更多关于 pi 的信息：

* [访问 pi.dev](https://pi.dev)，项目网站和演示
* [阅读文档](https://pi.dev/docs/latest)，你也可以直接向代理询问相关解释

## 分享你的 OSS 编码代理会话

如果你在开源工作中使用 pi 或其他编码代理，请分享你的会话。

公开的 OSS 会话数据有助于通过真实任务、工具使用、失败和修复来改进编码代理，而不是依赖玩具基准测试。

完整说明请参见 [X 上的这篇帖子](https://x.com/badlogicgames/status/2037811643774652911)。

要发布会话，请使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。阅读其 README.md 获取设置说明。你只需要一个 Hugging Face 账户、Hugging Face CLI 和 `pi-share-hf`。

## 所有包

| 包 | 描述 |
|---------|-------------|
| **[@earendil-works/pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)** | 统一的多供应商 LLM API（OpenAI、Anthropic、Google 等） |
| **[@earendil-works/pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent)** | 带有工具调用和状态管理的 Agent 运行时 |
| **[@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)** | 交互式编码代理 CLI |
| **[@earendil-works/pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui)** | 终端 UI 库，支持差异渲染 |

Slack/聊天自动化和工作流请参见 [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat)。

## 贡献

参见 [贡献指南](contributing.md) 和 [开发规则](agents.md)（适用于人类和代理）。

## 开发

```bash
npm install --ignore-scripts  # 安装所有依赖，不运行生命周期脚本
npm run build        # 构建所有包
npm run check        # 代码检查、格式化和类型检查
./test.sh            # 运行测试（没有 API 密钥时跳过 LLM 相关测试）
./pi-test.sh         # 从源码运行 pi（可以从任何目录运行）
```

## 供应链加固

我们将 npm 依赖变更视为需要审查的代码变更。

- 直接外部依赖固定为精确版本。内部工作区包保持版本范围。
- `.npmrc` 设置 `save-exact=true` 和 `min-release-age=2`，以避免在 npm 解析期间使用当天发布的依赖。
- `package-lock.json` 是依赖的唯一真实来源。预提交钩子会阻止意外的 lockfile 提交，除非设置 `PI_ALLOW_LOCKFILE_CHANGE=1`。
- `npm run check` 验证固定的直接依赖、原生 TypeScript 导入兼容性和生成的 coding-agent shrinkwrap。
- 发布的 CLI 包包含 `packages/coding-agent/npm-shrinkwrap.json`，从根 lockfile 生成，用于为 npm 用户固定传递依赖。
- 发布冒烟测试使用 `npm run release:local` 在仓库外构建、打包并创建独立的 npm 和 Bun 安装。
- 本地发布安装、文档中的 npm 安装和 `pi update --self` 在支持的地方使用 `--ignore-scripts`。
- CI 使用 `npm ci --ignore-scripts` 安装，定时 GitHub 工作流运行 `npm audit --omit=dev` 和 `npm audit signatures --omit=dev`。
- Shrinkwrap 生成有明确的依赖生命周期脚本允许列表；新的生命周期脚本依赖在审查前会导致检查失败。

## 许可证

MIT
