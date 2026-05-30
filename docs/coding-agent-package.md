# @earendil-works/pi-coding-agent

Pi 是一个极简的终端编码工具。通过 TypeScript 扩展、技能、提示模板和主题来适配 Pi 到你的工作流程，而不是反过来，无需 fork 和修改 Pi 内部代码。将你的扩展、技能、提示模板和主题打包到 Pi 包中，通过 npm 或 git 与他人分享。

Pi 附带强大的默认配置，但跳过了子代理和计划模式等功能。你可以让 pi 构建你想要的功能，或安装匹配你工作流程的第三方 pi 包。

Pi 运行在四种模式下：交互式、打印或 JSON、用于进程集成的 RPC，以及用于嵌入你自己应用的 SDK。

## 分享你的 OSS 编码代理会话

如果你使用 pi 进行开源工作，请分享你的编码代理会话。

公开的 OSS 会话数据有助于使用真实开发工作流程来改进模型、提示、工具和评估。

要发布会话，请使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。

## 快速开始

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 在安装期间禁用依赖的生命周期脚本。Pi 在正常 npm 安装中不需要安装脚本。

安装脚本替代方案：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

使用 API 密钥认证：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

或使用现有订阅：

```bash
pi
/login  # 然后选择供应商
```

然后直接与 pi 对话。默认情况下，pi 给模型四个工具：`read`、`write`、`edit` 和 `bash`。模型使用这些工具来完成你的请求。通过技能、提示模板、扩展或 pi 包添加能力。

**平台说明：** [Windows](windows.md) | [Termux (Android)](termux.md) | [tmux](tmux.md) | [终端设置](terminal-setup.md) | [Shell 别名](shell-aliases.md)

## 供应商和模型

对于每个内置供应商，pi 维护一个支持工具的模型列表，每次发布都会更新。通过订阅（`/login`）或 API 密钥认证，然后通过 `/model`（或 Ctrl+L）选择该供应商的任何模型。

**订阅：**
- Anthropic Claude Pro/Max
- OpenAI ChatGPT Plus/Pro (Codex)
- GitHub Copilot

**API 密钥：**
- Anthropic、OpenAI、Azure OpenAI、DeepSeek、Google Gemini、Google Vertex、Amazon Bedrock、Mistral、Groq、Cerebras、Cloudflare AI Gateway、Cloudflare Workers AI、xAI、OpenRouter、Vercel AI Gateway、ZAI、OpenCode Zen、OpenCode Go、Hugging Face、Fireworks、Together AI、Kimi For Coding、MiniMax、Xiaomi MiMo 等

详见 [供应商](providers.md) 设置说明。

**自定义供应商和模型：** 如果供应商使用支持的 API（OpenAI、Anthropic、Google），通过 `~/.pi/agent/models.json` 添加。对于自定义 API 或 OAuth，使用扩展。参见 [自定义模型](models.md) 和 [自定义供应商](custom-provider.md)。

## 交互模式

界面从上到下：

- **启动头部** - 显示快捷方式、加载的 AGENTS.md 文件、提示模板、技能和扩展
- **消息** - 你的消息、助手响应、工具调用和结果、通知、错误和扩展 UI
- **编辑器** - 输入区域；边框颜色指示思考级别
- **底部** - 工作目录、会话名称、总令牌/缓存使用量、费用、上下文使用量、当前模型

### 编辑器

| 功能 | 方式 |
|---------|-----|
| 文件引用 | 输入 `@` 模糊搜索项目文件 |
| 路径补全 | Tab 补全路径 |
| 多行 | Shift+Enter（Windows Terminal 上用 Ctrl+Enter） |
| 图像 | Ctrl+V 粘贴（Windows 上用 Alt+V），或拖放到终端 |
| Bash 命令 | `!command` 运行并发送输出到 LLM，`!!command` 运行但不发送 |

### 命令

在编辑器中输入 `/` 触发命令。扩展可以注册自定义命令，技能作为 `/skill:name` 可用，提示模板通过 `/templatename` 展开。

| 命令 | 描述 |
|--------|-------------|
| `/login`、`/logout` | OAuth 认证 |
| `/model` | 切换模型 |
| `/settings` | 思考级别、主题、消息传递、传输 |
| `/resume` | 从之前的会话中选择 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置会话显示名称 |
| `/session` | 显示会话信息 |
| `/tree` | 跳转到会话中的任何点并从那里继续 |
| `/fork` | 从之前的用户消息创建新会话 |
| `/clone` | 将当前活跃分支复制到新会话 |
| `/compact [prompt]` | 手动压缩上下文 |
| `/copy` | 复制最后的助手消息到剪贴板 |
| `/export [file]` | 导出会话到 HTML 文件 |
| `/share` | 上传为私有 GitHub gist |
| `/reload` | 重新加载快捷键、扩展、技能、提示和上下文文件 |
| `/hotkeys` | 显示所有键盘快捷方式 |
| `/quit` | 退出 pi |

### 键盘快捷方式

| 按键 | 动作 |
|-----|--------|
| Ctrl+C | 清空编辑器 |
| Ctrl+C 两次 | 退出 |
| Escape | 取消/中止 |
| Escape 两次 | 打开 `/tree` |
| Ctrl+L | 打开模型选择器 |
| Ctrl+P / Shift+Ctrl+P | 循环切换模型 |
| Shift+Tab | 循环思考级别 |
| Ctrl+O | 折叠/展开工具输出 |
| Ctrl+T | 折叠/展开思考块 |

### 消息队列

在代理工作时提交消息：

- **Enter** 排队一个*转向*消息，在当前助手回合完成工具调用执行后传递
- **Alt+Enter** 排队一个*后续*消息，仅在代理完成所有工作后传递
- **Escape** 中止并将排队消息恢复到编辑器

## 会话

会话存储为带树形结构的 JSONL 文件。每个条目有 `id` 和 `parentId`，支持原地分支而无需创建新文件。

### 管理

会话自动保存到 `~/.pi/agent/sessions/`，按工作目录组织。

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览并选择过去的会话
pi --no-session        # 临时模式（不保存）
pi --name "my task"    # 启动时设置会话显示名称
pi --session <path|id> # 使用特定会话文件或 ID
pi --fork <path|id>    # Fork 特定会话到新会话
```

### 分支

**`/tree`** - 原地导航会话树。选择任何之前的点，从那里继续，并在分支之间切换。所有历史保存在单个文件中。

**`/fork`** - 从活跃分支上的之前用户消息创建新会话文件。

**`/clone`** - 在当前位置将当前活跃分支复制到新会话文件。

### 压缩

长会话可能耗尽上下文窗口。压缩总结旧消息，同时保留最近的消息。

**手动：** `/compact` 或 `/compact <自定义指令>`

**自动：** 默认启用。在上下文溢出时触发（恢复并重试）或在接近限制时触发（主动）。

## 设置

使用 `/settings` 修改常用选项，或直接编辑 JSON 文件：

| 位置 | 范围 |
|----------|-------|
| `~/.pi/agent/settings.json` | 全局（所有项目） |
| `.pi/settings.json` | 项目（覆盖全局） |

### 遥测和更新检查

- **更新检查：** 获取最新版本信息。使用 `PI_SKIP_VERSION_CHECK=1` 禁用。
- **安装/更新遥测：** 发送匿名版本 ping。设置 `enableInstallTelemetry` 为 `false` 或 `PI_TELEMETRY=0` 退出。

使用 `--offline` 或 `PI_OFFLINE=1` 禁用所有启动网络操作。

## 上下文文件

Pi 启动时加载 `AGENTS.md`（或 `CLAUDE.md`）：
- `~/.pi/agent/AGENTS.md`（全局）
- 父目录（从 cwd 向上查找）
- 当前目录

用于项目指令、约定、常用命令。所有匹配的文件被连接在一起。

使用 `--no-context-files`（或 `-nc`）禁用上下文文件加载。

### 系统提示

使用 `.pi/SYSTEM.md`（项目）或 `~/.pi/agent/SYSTEM.md`（全局）替换默认系统提示。通过 `APPEND_SYSTEM.md` 追加而不替换。

## 自定义

### 提示模板

作为 Markdown 文件的可复用提示。输入 `/name` 展开。

放在 `~/.pi/agent/prompts/`、`.pi/prompts/` 或 pi 包中。参见 [提示模板](prompt-templates.md)。

### 技能

遵循 [Agent Skills 标准](https://agentskills.io) 的按需能力包。通过 `/skill:name` 调用或让代理自动加载。

放在 `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/` 或 `.agents/skills/` 中。参见 [技能](skills.md)。

### 扩展

扩展 pi 的 TypeScript 模块，提供自定义工具、命令、键盘快捷方式、事件处理器和 UI 组件。

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

**可能实现的功能：**
- 自定义工具（或完全替换内置工具）
- 子代理和计划模式
- 自定义压缩和总结
- 权限门和路径保护
- 自定义编辑器和 UI 组件
- 状态行、标题、底部栏
- Git 检查点和自动提交
- SSH 和沙箱执行
- MCP 服务器集成
- 让 pi 看起来像 Claude Code
- 等待时的游戏（是的，Doom 可以运行）

放在 `~/.pi/agent/extensions/`、`.pi/extensions/` 或 pi 包中。参见 [扩展](extensions.md)。

### 主题

内置：`dark`、`light`。主题热重载：修改活跃主题文件，pi 立即应用更改。

### Pi 包

通过 npm 或 git 打包和分享扩展、技能、提示和主题。

> **安全：** Pi 包以完全系统访问权限运行。扩展执行任意代码，技能可以指示模型执行任何操作，包括运行可执行文件。安装第三方包前请审查源代码。

```bash
pi install npm:@foo/pi-tools
pi install git:github.com/user/repo
pi remove npm:@foo/pi-tools
pi list
pi update
pi config
```

## 编程使用

### SDK

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

await session.prompt("What files are in the current directory?");
```

参见 [SDK](sdk.md)。

### RPC 模式

用于非 Node.js 集成，通过 stdin/stdout 使用 RPC 模式：

```bash
pi --mode rpc
```

参见 [RPC 模式](rpc.md)。

## 设计理念

Pi 是激进可扩展的，因此它不必规定你的工作流程。其他工具内置的功能可以用扩展、技能构建，或从第三方 pi 包安装。这保持核心极简，同时让你可以塑造 pi 以适合你的工作方式。

**无 MCP。** 构建带 README 的 CLI 工具（参见技能），或构建添加 MCP 支持的扩展。

**无子代理。** 有很多方式实现这个。通过 tmux 生成 pi 实例，或用扩展构建你自己的。

**无权限弹窗。** 在容器中运行，或用扩展构建你自己的确认流程。

**无计划模式。** 将计划写入文件，或用扩展构建它。

**无内置待办事项。** 它们会混淆模型。使用 TODO.md 文件。

**无后台 bash。** 使用 tmux。完全可观察性，直接交互。

## CLI 参考

```bash
pi [options] [@files...] [messages...]
```

### 模式

| 标志 | 描述 |
|------|-------------|
| (默认) | 交互模式 |
| `-p`、`--print` | 打印响应并退出 |
| `--mode json` | 以 JSON 行输出所有事件 |
| `--mode rpc` | 用于进程集成的 RPC 模式 |

### 模型选项

| 选项 | 描述 |
|--------|-------------|
| `--provider <name>` | 供应商 |
| `--model <pattern>` | 模型模式或 ID |
| `--api-key <key>` | API 密钥 |
| `--thinking <level>` | 思考级别 |
| `--list-models [search]` | 列出可用模型 |

### 会话选项

| 选项 | 描述 |
|--------|-------------|
| `-c`、`--continue` | 继续最近的会话 |
| `-r`、`--resume` | 浏览并选择会话 |
| `--session <path\|id>` | 使用特定会话 |
| `--fork <path\|id>` | Fork 特定会话 |
| `--no-session` | 临时模式 |

### 工具选项

| 选项 | 描述 |
|--------|-------------|
| `--tools <list>` | 允许特定工具名称 |
| `--exclude-tools <list>` | 禁用特定工具 |
| `--no-builtin-tools` | 禁用内置工具 |
| `--no-tools` | 禁用所有工具 |

可用内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`

### 环境变量

| 变量 | 描述 |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录（默认：`~/.pi/agent`） |
| `PI_OFFLINE` | 禁用启动网络操作 |
| `PI_SKIP_VERSION_CHECK` | 跳过版本更新检查 |
| `PI_TELEMETRY` | 覆盖安装/更新遥测 |
| `PI_CACHE_RETENTION` | 设为 `long` 用于扩展提示缓存 |

## 许可证

MIT

## 另见

- [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)：核心 LLM 工具包
- [@earendil-works/pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core)：Agent 框架
- [@earendil-works/pi-tui](https://www.npmjs.com/package/@earendil-works/pi-tui)：终端 UI 组件
