> pi 可以创建扩展。让它为你的使用场景构建一个。

# 扩展

扩展是用于扩展 pi 行为的 TypeScript 模块。它们可以订阅生命周期事件、注册可由 LLM 调用的自定义工具、添加命令等等。

> **`/reload` 的放置位置：** 将扩展放在 `~/.pi/agent/extensions/`（全局）或 `.pi/extensions/`（项目本地）中以便自动发现。仅在快速测试时使用 `pi -e ./path.ts`。放在自动发现位置中的扩展可以通过 `/reload` 热重载。

**核心能力：**
- **自定义工具** - 通过 `pi.registerTool()` 注册 LLM 可调用的工具
- **事件拦截** - 阻止或修改工具调用、注入上下文、自定义压缩
- **用户交互** - 通过 `ctx.ui` 向用户发起提示（select、confirm、input、notify）
- **自定义 UI 组件** - 通过 `ctx.ui.custom()` 提供带键盘输入的完整 TUI 组件，用于复杂交互
- **自定义命令** - 通过 `pi.registerCommand()` 注册如 `/mycommand` 这样的命令
- **会话持久化** - 通过 `pi.appendEntry()` 存储可在重启后保留的状态
- **自定义渲染** - 控制工具调用/结果及消息在 TUI 中的显示方式

**示例使用场景：**
- 权限门控（在执行 `rm -rf`、`sudo` 等之前确认）
- Git 检查点（每轮 turn 时 stash，在切换分支时恢复）
- 路径保护（阻止写入 `.env`、`node_modules/`）
- 自定义压缩（用你自己的方式总结对话）
- 对话摘要（参见 `summarize.ts` 示例）
- 交互式工具（提问、向导、自定义对话框）
- 有状态工具（todo 列表、连接池）
- 外部集成（文件监听器、webhook、CI 触发器）
- 等待时玩的游戏（参见 `snake.ts` 示例）

可在 [examples/extensions/](../examples/extensions/) 查看可运行的实现。

## 目录

- [快速开始](#快速开始)
- [扩展位置](#扩展位置)
- [可用导入](#可用导入)
- [编写扩展](#编写扩展)
  - [扩展风格](#扩展风格)
- [事件](#事件)
  - [生命周期概览](#生命周期概览)
  - [资源事件](#资源事件)
  - [会话事件](#会话事件)
  - [智能体事件](#智能体事件)
  - [模型事件](#模型事件)
  - [工具事件](#工具事件)
- [ExtensionContext](#extensioncontext)
- [ExtensionCommandContext](#extensioncommandcontext)
- [ExtensionAPI 方法](#extensionapi-方法)
- [状态管理](#状态管理)
- [自定义工具](#自定义工具)
- [自定义 UI](#自定义-ui)
- [错误处理](#错误处理)
- [模式行为](#模式行为)
- [示例参考](#示例参考)

## 快速开始

创建 `~/.pi/agent/extensions/my-extension.ts`：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // 响应事件
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // 注册一个自定义工具
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // 注册一个命令
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

使用 `--extension`（或 `-e`）标志测试：

```bash
pi -e ./my-extension.ts
```

## 扩展位置

> **安全性：** 扩展会以你系统的完整权限运行，并且可以执行任意代码。只从你信任的来源安装。

扩展会从以下位置自动发现：

| 位置 | 作用域 |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | 全局（所有项目） |
| `~/.pi/agent/extensions/*/index.ts` | 全局（子目录） |
| `.pi/extensions/*.ts` | 项目本地 |
| `.pi/extensions/*/index.ts` | 项目本地（子目录） |

可通过 `settings.json` 添加额外路径：

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

如果要通过 npm 或 git 以 pi package 的形式共享扩展，请参阅 [packages.md](packages.md)。

## 可用导入

| 包 | 用途 |
|---------|---------|
| `@earendil-works/pi-coding-agent` | 扩展类型（`ExtensionAPI`、`ExtensionContext`、events） |
| `typebox` | 工具参数的 schema 定义 |
| `@earendil-works/pi-ai` | AI 工具（用于 Google 兼容 enum 的 `StringEnum`） |
| `@earendil-works/pi-tui` | 用于自定义渲染的 TUI 组件 |

npm 依赖同样可用。在扩展旁边（或父目录中）添加 `package.json`，运行 `npm install`，随后会自动解析来自 `node_modules/` 的导入。

对于使用 `pi install` 安装的分发型 pi package（npm 或 git），运行时依赖必须放在 `dependencies` 中。package 安装默认使用生产安装（`npm install --omit=dev`），因此 `devDependencies` 在运行时不可用；当配置了 `npmCommand` 时，git package 会为兼容包装器而使用普通的 `install`。

Node.js 内置模块（`node:fs`、`node:path` 等）也可用。

## 编写扩展

扩展会导出一个默认工厂函数，并接收 `ExtensionAPI`。该工厂函数可以是同步的，也可以是异步的：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 订阅事件
  pi.on("event_name", async (event, ctx) => {
    // 使用 ctx.ui 与用户交互
    const ok = await ctx.ui.confirm("Title", "Are you sure?");
    ctx.ui.notify("Done!", "info");
    ctx.ui.setStatus("my-ext", "Processing...");  // 页脚状态
    ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);  // 编辑器上方的组件（默认）
  });

  // 注册工具、命令、快捷键、标志
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

扩展通过 [jiti](https://github.com/unjs/jiti) 加载，因此 TypeScript 无需编译即可运行。

如果工厂函数返回 `Promise`，pi 会在继续启动前等待它。这意味着异步初始化会在 `session_start` 之前、在 `resources_discover` 之前，以及在通过 `pi.registerProvider()` 排队的 provider 注册被刷新之前完成。

### 异步工厂函数

对于获取远程配置或动态发现可用模型等一次性启动工作，可使用异步工厂。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

这种模式会让获取到的模型在正常启动期间以及在 `pi --list-models` 中可用。

### 扩展风格

**单文件** - 最简单，适合小型扩展：

```
~/.pi/agent/extensions/
└── my-extension.ts
```

**带 `index.ts` 的目录** - 适用于多文件扩展：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts        # 入口点（导出默认函数）
    ├── tools.ts        # 辅助模块
    └── utils.ts        # 辅助模块
```

**带依赖的 package** - 适用于需要 npm package 的扩展：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json    # 声明依赖和入口点
    ├── package-lock.json
    ├── node_modules/   # 运行 npm install 后
    └── src/
        └── index.ts
```

```json
// package.json
{
  "name": "my-extension",
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

在扩展目录中运行 `npm install`，然后来自 `node_modules/` 的导入就会自动生效。

## 事件

### 生命周期概览

```
pi 启动
  │
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }
      │
      ▼
用户发送 prompt ─────────────────────────────────────────┐
  │                                                        │
  ├─►（先检查扩展命令，如找到则绕过）                      │
  ├─► input（可拦截、转换或处理）                          │
  ├─►（如果未处理则进行 skill/template 扩展）              │
  ├─► before_agent_start（可注入消息、修改 system prompt）
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn（当 LLM 调用工具时重复） ───┐              │
  │   │                                     │              │
  │   ├─► turn_start                        │              │
  │   ├─► context（可修改消息）             │              │
  │   ├─► before_provider_request（可检查或替换 payload）
  │   ├─► after_provider_response（状态 + headers，在消费 stream 前）
  │   │                                     │              │
  │   │   LLM 响应，可能会调用工具：        │              │
  │   │     ├─► tool_execution_start        │              │
  │   │     ├─► tool_call（可阻止）         │              │
  │   │     ├─► tool_execution_update       │              │
  │   │     ├─► tool_result（可修改）       │              │
  │   │     └─► tool_execution_end          │              │
  │   │                                     │              │
  │   └─► turn_end                          │              │
  │                                                        │
  └─► agent_end                                            │
                                                           │
用户发送另一条 prompt ◄────────────────────────────────────┘

/new（新会话）或 /resume（切换会话）
  ├─► session_before_switch（可取消）
  ├─► session_shutdown
  ├─► session_start { reason: "new" | "resume", previousSessionFile? }
  └─► resources_discover { reason: "startup" }

/fork 或 /clone
  ├─► session_before_fork（可取消）
  ├─► session_shutdown
  ├─► session_start { reason: "fork", previousSessionFile }
  └─► resources_discover { reason: "startup" }

/compact 或自动压缩
  ├─► session_before_compact（可取消或自定义）
  └─► session_compact

/tree 导航
  ├─► session_before_tree（可取消或自定义）
  └─► session_tree

/model 或 Ctrl+P（模型选择/切换）
  ├─► thinking_level_select（如果模型变化会改变/限制 thinking level）
  └─► model_select

thinking level 变化（settings、keybinding、pi.setThinkingLevel()）
  └─► thinking_level_select

退出（Ctrl+C、Ctrl+D、SIGHUP、SIGTERM）
  └─► session_shutdown
```

### 资源事件

#### resources_discover

在 `session_start` 之后触发，以便扩展可以贡献额外的 skill、prompt 和 theme 路径。
启动路径使用 `reason: "startup"`。重载使用 `reason: "reload"`。

```typescript
pi.on("resources_discover", async (event, _ctx) => {
  // event.cwd - 当前工作目录
  // event.reason - "startup" | "reload"
  return {
    skillPaths: ["/path/to/skills"],
    promptPaths: ["/path/to/prompts"],
    themePaths: ["/path/to/themes"],
  };
});
```

### 会话事件

有关会话存储内部机制和 SessionManager API，请参阅 [Session Format](session-format.md)。

#### session_start

当会话被启动、加载或重载时触发。

```typescript
pi.on("session_start", async (event, ctx) => {
  // event.reason - "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile - 在 "new"、"resume" 和 "fork" 时存在
  ctx.ui.notify(`Session: ${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`, "info");
});
```

#### session_before_switch

在启动新会话（`/new`）或切换会话（`/resume`）之前触发。

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason - "new" 或 "resume"
  // event.targetSessionFile - 要切换到的会话（仅用于 "resume"）

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("Clear?", "Delete all messages?");
    if (!ok) return { cancel: true };
  }
});
```

在成功切换或新建会话后，pi 会先为旧扩展实例发出 `session_shutdown`，为新会话重新加载并重新绑定扩展，然后发出带有 `reason: "new" | "resume"` 和 `previousSessionFile` 的 `session_start`。
请在 `session_shutdown` 中执行清理工作，然后在 `session_start` 中重新建立所有内存中的状态。

#### session_before_fork

在通过 `/fork` 进行 fork 或通过 `/clone` 进行 clone 时触发。

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId - 选中条目的 ID
  // event.position - /fork 时为 "before"，/clone 时为 "at"
  return { cancel: true }; // 取消 fork/clone
  // 或者
  return { skipConversationRestore: true }; // 为未来的对话恢复控制预留
});
```

在成功 fork 或 clone 后，pi 会先为旧扩展实例发出 `session_shutdown`，为新会话重新加载并重新绑定扩展，然后发出带有 `reason: "fork"` 和 `previousSessionFile` 的 `session_start`。
请在 `session_shutdown` 中执行清理工作，然后在 `session_start` 中重新建立所有内存中的状态。

#### session_before_compact / session_compact

在压缩时触发。详情请参阅 [compaction.md](compaction.md)。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});

pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry - 已保存的压缩结果
  // event.fromExtension - 是否由扩展提供
});
```

#### session_before_tree / session_tree

在 `/tree` 导航时触发。关于树导航概念，请参阅 [Sessions](sessions.md)。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;
  return { cancel: true };
  // 或提供自定义摘要：
  return { summary: { summary: "...", details: {} } };
});

pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId, oldLeafId, summaryEntry, fromExtension
});
```

#### session_shutdown

在扩展运行时被销毁前触发。

```typescript
pi.on("session_shutdown", async (event, ctx) => {
  // event.reason - "quit" | "reload" | "new" | "resume" | "fork"
  // event.targetSessionFile - 会话替换流程中的目标会话
  // 清理、保存状态等
});
```

### 智能体事件

#### before_agent_start

在用户提交 prompt 之后、agent 循环开始之前触发。可注入一条消息和/或修改 system prompt。

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - 用户的 prompt 文本
  // event.images - 附带的图片（如果有）
  // event.systemPrompt - 当前 handler 的链式 system prompt
  //   （包含更早的 before_agent_start handler 所做的更改）
  // event.systemPromptOptions - 用于构建 system prompt 的结构化选项
  //   .customPrompt - 任意自定义 system prompt（来自 --system-prompt、SYSTEM.md 或自定义模板）
  //   .selectedTools - 当前在 prompt 中激活的工具
  //   .toolSnippets - 每个工具的一行描述
  //   .promptGuidelines - 自定义 guideline 列表
  //   .appendSystemPrompt - 来自 --append-system-prompt 标志的文本
  //   .cwd - 工作目录
  //   .contextFiles - AGENTS.md 文件及其他已加载的上下文文件
  //   .skills - 已加载的 skills

  return {
    // 注入一条持久消息（存储到会话中，并发送给 LLM）
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
    // 替换本轮的 system prompt（在扩展间链式传递）
    systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
  };
});
```

`systemPromptOptions` 字段让扩展能够访问 Pi 用来构建 system prompt 的同一份结构化数据。这使你无需重新发现资源或重新解析标志，就能检查 Pi 已加载的内容——自定义 prompt、guideline、tool snippet、上下文文件、skills。若你的扩展需要在尊重用户提供配置的同时，对 system prompt 做深入且有依据的修改，就应使用它。

在 `before_agent_start` 内部，`event.systemPrompt` 和 `ctx.getSystemPrompt()` 都会反映截至当前 handler 为止的链式 system prompt。后续的 `before_agent_start` handler 仍然可以再次修改它。

#### agent_start / agent_end

每个用户 prompt 触发一次。

```typescript
pi.on("agent_start", async (_event, ctx) => {});

pi.on("agent_end", async (event, ctx) => {
  // event.messages - 本次 prompt 的消息
});
```

#### turn_start / turn_end

每个 turn 触发一次（一次 LLM 响应加若干工具调用）。

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});

pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});
```

#### message_start / message_update / message_end

在消息生命周期更新时触发。

- `message_start` 和 `message_end` 会对 user、assistant 和 toolResult 消息触发。
- `message_update` 会对 assistant 流式更新触发。
- `message_end` 处理器可以返回 `{ message }` 来替换最终定稿的消息。替换后的消息必须保持相同的 `role`。

```typescript
pi.on("message_start", async (event, ctx) => {
  // event.message
});

pi.on("message_update", async (event, ctx) => {
  // event.message
  // event.assistantMessageEvent (逐 token 的流事件)
});

pi.on("message_end", async (event, ctx) => {
  if (event.message.role !== "assistant") return;

  return {
    message: {
      ...event.message,
      usage: {
        ...event.message.usage,
        cost: {
          ...event.message.usage.cost,
          total: 0.123,
        },
      },
    },
  };
});
```

#### tool_execution_start / tool_execution_update / tool_execution_end

在工具执行生命周期更新时触发。

在并行工具模式下：
- `tool_execution_start` 会在预检阶段按照 assistant 源顺序发出
- `tool_execution_update` 事件可能会在不同工具之间交错出现
- `tool_execution_end` 会在每个工具最终完成后按工具完成顺序发出
- 最终的 `toolResult` 消息事件仍会稍后按照 assistant 源顺序发出

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args
});

pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args, event.partialResult
});

pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.result, event.isError
});
```

#### context

在每次 LLM 调用之前触发。以非破坏性的方式修改消息。消息类型见 [Session Format](session-format.md)。

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - 深拷贝，可安全修改
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

#### before_provider_request

在构建好 provider 专属 payload 之后、请求发送之前立即触发。处理器按扩展加载顺序运行。返回 `undefined` 会保持 payload 不变。返回任何其他值都会替换后续处理器以及实际请求使用的 payload。

这个 hook 可以重写 provider 层级的 system instructions，或将其完全移除。这些 payload 层级的更改不会反映在 `ctx.getSystemPrompt()` 中；它返回的是 Pi 的 system prompt 字符串，而不是最终序列化后的 provider payload。

```typescript
pi.on("before_provider_request", (event, ctx) => {
  console.log(JSON.stringify(event.payload, null, 2));

  // 可选：替换 payload
  // return { ...event.payload, temperature: 0 };
});
```

这主要适用于调试 provider 序列化和缓存行为。

#### after_provider_response

在收到 HTTP 响应之后、消费其流式 body 之前触发。处理器按扩展加载顺序运行。

```typescript
pi.on("after_provider_response", (event, ctx) => {
  // event.status - HTTP 状态码
  // event.headers - 规范化后的响应头
  if (event.status === 429) {
    console.log("rate limited", event.headers["retry-after"]);
  }
});
```

Header 是否可用取决于 provider 和传输方式。对 HTTP 响应做了抽象的 provider 可能不会暴露 headers。

### 模型事件

#### model_select

当模型通过 `/model` 命令、模型轮换（`Ctrl+P`）或会话恢复而发生变化时触发。

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model - 新选择的模型
  // event.previousModel - 上一个模型（如果是首次选择则为 undefined）
  // event.source - "set" | "cycle" | "restore"

  const prev = event.previousModel
    ? `${event.previousModel.provider}/${event.previousModel.id}`
    : "none";
  const next = `${event.model.provider}/${event.model.id}`;

  ctx.ui.notify(`Model changed (${event.source}): ${prev} -> ${next}`, "info");
});
```

用它在活动模型变化时更新 UI 元素（状态栏、页脚），或执行特定于模型的初始化。

#### thinking_level_select

当 thinking level 变化时触发。这仅用于通知；会忽略处理器返回值。

```typescript
pi.on("thinking_level_select", async (event, ctx) => {
  // event.level - 新选择的 thinking level
  // event.previousLevel - 上一个 thinking level

  ctx.ui.setStatus("thinking", `thinking: ${event.level}`);
});
```

用它在 `pi.setThinkingLevel()`、模型变化或内置 thinking-level 控件更改当前活动 thinking level 时更新扩展 UI。

### 工具事件

#### tool_call

在 `tool_execution_start` 之后、工具执行之前触发。**可以阻塞。** 使用 `isToolCallEventType` 做收窄并获取类型化输入。

在 `tool_call` 运行之前，pi 会等待此前已发出的智能体事件通过 `AgentSession` 完成排空。这意味着 `ctx.sessionManager` 已更新到当前 assistant 的工具调用消息为止。

在默认的并行工具执行模式下，同一条 assistant 消息中的同级工具调用会先按顺序完成预检，然后并发执行。`tool_call` 无法保证能在 `ctx.sessionManager` 中看到同一条 assistant 消息里其他同级工具的结果。

`event.input` 是可变的。可以直接原地修改它，以便在执行前修补工具参数。

行为保证：
- 对 `event.input` 的修改会影响实际的工具执行
- 后续的 `tool_call` 处理器可以看到前面处理器所做的修改
- 修改后不会再次执行校验
- `tool_call` 的返回值只用于通过 `{ block: true, reason?: string }` 控制阻塞

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName - "bash", "read", "write", "edit" 等
  // event.toolCallId
  // event.input - 工具参数（可变）

  // 内置工具：不需要类型参数
  if (isToolCallEventType("bash", event)) {
    // event.input 的类型是 { command: string; timeout?: number }
    event.input.command = `source ~/.profile\n${event.input.command}`;

    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
  }

  if (isToolCallEventType("read", event)) {
    // event.input 的类型是 { path: string; offset?: number; limit?: number }
    console.log(`Reading: ${event.input.path}`);
  }
});
```

#### 为自定义工具输入添加类型

自定义工具应导出其输入类型：

```typescript
// my-extension.ts
export type MyToolInput = Static<typeof myToolSchema>;
```

配合显式类型参数使用 `isToolCallEventType`：

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { MyToolInput } from "my-extension";

pi.on("tool_call", (event) => {
  if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
    event.input.action;  // 已类型化
  }
});
```

#### tool_result

在工具执行完成之后、`tool_execution_end` 以及最终工具结果消息事件发出之前触发。**可以修改结果。**

在并行工具模式下，`tool_result` 和 `tool_execution_end` 可能会按工具完成顺序交错出现，而最终的 `toolResult` 消息事件仍会稍后按 assistant 源顺序发出。

`tool_result` 处理器会像 middleware 一样串联：
- 处理器按扩展加载顺序运行
- 每个处理器看到的都是前一个处理器修改后的最新结果
- 处理器可以返回局部 patch（`content`、`details` 或 `isError`）；省略的字段会保留当前值

在处理器内部进行嵌套 async 工作时，使用 `ctx.signal`。这使得 Esc 可以取消由扩展启动的 model 调用、`fetch()` 以及其他支持 abort 的操作。

```typescript
import { isBashToolResult } from "@earendil-works/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError

  if (isBashToolResult(event)) {
    // event.details 的类型是 BashToolDetails
  }

  const response = await fetch("https://example.com/summarize", {
    method: "POST",
    body: JSON.stringify({ content: event.content }),
    signal: ctx.signal,
  });

  // 修改结果：
  return { content: [...], details: {...}, isError: false };
});
```

### 用户 Bash 事件

#### user_bash

当用户执行 `!` 或 `!!` 命令时触发。**可以拦截。**

```typescript
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

pi.on("user_bash", (event, ctx) => {
  // event.command - bash 命令
  // event.excludeFromContext - 如果是 !! 前缀则为 true
  // event.cwd - 工作目录

  // 选项 1：提供自定义操作（例如 SSH）
  return { operations: remoteBashOps };

  // 选项 2：包装 pi 的内置本地 bash 后端
  const local = createLocalBashOperations();
  return {
    operations: {
      exec(command, cwd, options) {
        return local.exec(`source ~/.profile\n${command}`, cwd, options);
      }
    }
  };

  // 选项 3：完全替换——直接返回结果
  return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

### 输入事件

#### input

当接收到用户输入时触发，发生在检查扩展命令之后、skill 和 template 展开之前。该事件看到的是原始输入文本，因此 `/skill:foo` 和 `/template` 此时尚未展开。

**处理顺序：**
1. 先检查扩展命令（`/cmd`）——如果找到，运行处理器并跳过 input 事件
2. 触发 `input` 事件——可拦截、转换或处理
3. 如果未处理：将 skill 命令（`/skill:name`）展开为 skill 内容
4. 如果未处理：将 prompt template（`/template`）展开为 template 内容
5. 开始 Agent 处理（`before_agent_start` 等）

```typescript
pi.on("input", async (event, ctx) => {
  // event.text - 原始输入（在 skill/template 展开之前）
  // event.images - 附带的图片（如果有）
  // event.source - "interactive"（键入）、"rpc"（API）或 "extension"（通过 sendUserMessage）
  // event.streamingBehavior - "steer" | "followUp" | undefined
  //   idle 时为 undefined，流处理中断时为 "steer"，
  //   对于排队到 agent 完成后再处理的消息则为 "followUp"

  // 转换：在展开前重写输入
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };

  // 处理：不经 LLM 直接响应（由扩展显示自己的反馈）
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // 按来源路由：跳过扩展注入消息的处理
  if (event.source === "extension") return { action: "continue" };

  // 在展开前拦截 skill 命令
  if (event.text.startsWith("/skill:")) {
    // 可以转换、阻止，或允许其继续
  }

  return { action: "continue" };  // 默认：继续进入展开流程
});
```

**结果：**
- `continue` - 原样继续（如果处理器未返回任何内容，则为默认值）
- `transform` - 修改 text/images，然后继续展开
- `handled` - 完全跳过 agent（第一个返回此值的处理器生效）

转换会在多个处理器之间串联。参见 [input-transform.ts](../examples/extensions/input-transform.ts) 和 [input-transform-streaming.ts](../examples/extensions/input-transform-streaming.ts)，了解能感知 `streamingBehavior` 的路由方式。

## ExtensionContext

所有处理器都会收到 `ctx: ExtensionContext`。

### ctx.ui

用于与用户交互的 UI 方法。完整细节见[自定义 UI](#自定义-ui)。

### ctx.hasUI

在 print 模式（`-p`）和 JSON 模式下为 `false`。在 interactive 和 RPC 模式下为 `true`。在 RPC 模式下，对话方法（`select`、`confirm`、`input`、`editor`）通过扩展 UI 子协议工作，而即发即弃的方法（`notify`、`setStatus`、`setWidget`、`setTitle`、`setEditorText`）会向客户端发出请求。某些 TUI 专用方法是 no-op 或返回默认值（见 [rpc.md](rpc.md#extension-ui-protocol)）。

### ctx.cwd

当前工作目录。

### ctx.sessionManager

对会话状态的只读访问。完整的 SessionManager API 和条目类型见 [Session Format](session-format.md)。

对于 `tool_call`，这部分状态会在处理器运行前同步到当前 assistant 消息为止。在并行工具执行模式下，它仍不能保证包含同一条 assistant 消息中其他同级工具的结果。

```typescript
ctx.sessionManager.getEntries()       // 所有条目
ctx.sessionManager.getBranch()        // 当前分支
ctx.sessionManager.getLeafId()        // 当前叶子条目 ID
```

### ctx.modelRegistry / ctx.model

访问模型和 API keys。

### ctx.signal

当前 agent 的 abort signal；当没有活动中的 agent turn 时为 `undefined`。

将它用于由扩展处理器启动、需要感知 abort 的嵌套工作，例如：
- `fetch(..., { signal: ctx.signal })`
- 接受 `signal` 的 model 调用
- 接受 `AbortSignal` 的文件或进程辅助方法

`ctx.signal` 通常会在活动 turn 事件期间定义，例如 `tool_call`、`tool_result`、`message_update` 和 `turn_end`。
而在 idle 或非 turn 上下文中通常为 `undefined`，例如会话事件、扩展命令，以及 pi 空闲时触发的快捷键。

```typescript
pi.on("tool_result", async (event, ctx) => {
  const response = await fetch("https://example.com/api", {
    method: "POST",
    body: JSON.stringify(event),
    signal: ctx.signal,
  });

  const data = await response.json();
  return { details: data };
});
```

### ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages()

控制流辅助方法。

### ctx.shutdown()

请求优雅地关闭 pi。

- **交互模式：** 延迟到 agent 变为空闲后执行（处理完所有排队的 steering 和 follow-up 消息之后）。
- **RPC 模式：** 延迟到下一个空闲状态执行（完成当前命令响应、等待下一个命令时）。
- **Print 模式：** no-op。当所有 prompts 处理完成后，进程会自动退出。

退出前会向所有扩展发出 `session_shutdown` 事件。在所有上下文中都可用（事件处理器、工具、命令、快捷键）。

```typescript
pi.on("tool_call", (event, ctx) => {
  if (isFatal(event.input)) {
    ctx.shutdown();
  }
});
```

### ctx.getContextUsage()

返回当前活动模型的上下文使用情况。优先使用最近一次 assistant 的 usage；如果没有，则为尾部消息估算 tokens。

```typescript
const usage = ctx.getContextUsage();
if (usage && usage.tokens > 100_000) {
  // ...
}
```

### ctx.compact()

触发 compact，但不等待其完成。使用 `onComplete` 和 `onError` 执行后续动作。

```typescript
ctx.compact({
  customInstructions: "Focus on recent changes",
  onComplete: (result) => {
    ctx.ui.notify("Compaction completed", "info");
  },
  onError: (error) => {
    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
  },
});
```

### ctx.getSystemPrompt()

返回 Pi 当前的 system prompt 字符串。

- 在 `before_agent_start` 期间，它反映当前 turn 中到目前为止串联后的 system-prompt 更改。
- 它不包含之后 `context` 对消息的修改。
- 它不包含 `before_provider_request` 对 payload 的重写。
- 如果在你之后加载的扩展随后运行，它们仍然可能改变最终发送的内容。

```typescript
pi.on("before_agent_start", (event, ctx) => {
  const prompt = ctx.getSystemPrompt();
  console.log(`System prompt length: ${prompt.length}`);
});
```

## ExtensionCommandContext

命令处理器会收到 `ExtensionCommandContext`，它在 `ExtensionContext` 基础上扩展了会话控制方法。这些方法仅在命令中可用，因为如果从事件处理器中调用，它们可能导致死锁。

### ctx.waitForIdle()

等待 agent 完成流式输出：

```typescript
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    // agent 现已空闲，可以安全修改会话
  },
});
```

### ctx.newSession(options?)

创建新会话：

```typescript
const parentSession = ctx.sessionManager.getSessionFile();
const kickoff = "Continue in the replacement session";

const result = await ctx.newSession({
  parentSession,
  setup: async (sm) => {
    sm.appendMessage({
      role: "user",
      content: [{ type: "text", text: "Context from previous session..." }],
      timestamp: Date.now(),
    });
  },
  withSession: async (ctx) => {
    // 这里只使用 replacement-session 的 ctx。
    await ctx.sendUserMessage(kickoff);
  },
});

if (result.cancelled) {
  // 扩展取消了新会话
}
```

选项：
- `parentSession`：在新会话头中记录的父会话文件
- `setup`：在 `withSession` 运行前修改新会话的 `SessionManager`
- `withSession`：切换后，基于全新的 replacement-session context 运行后续工作。不要使用捕获的旧 `pi` / 命令 `ctx`；见[会话替换生命周期与易踩坑点](#会话替换生命周期与易踩坑点)。

### ctx.fork(entryId, options?)

从特定条目分叉，创建一个新的会话文件：

```typescript
const result = await ctx.fork("entry-id-123", {
  withSession: async (ctx) => {
    // 这里只使用 replacement-session 的 ctx。
    ctx.ui.notify("Now in the forked session", "info");
  },
});
if (result.cancelled) {
  // 扩展取消了这次 fork
}

const cloneResult = await ctx.fork("entry-id-456", { position: "at" });
if (cloneResult.cancelled) {
  // 扩展取消了这次 clone
}
```

选项：
- `position`: `"before"`（默认）会在所选 user 消息之前分叉，并将该 prompt 恢复到编辑器中
- `position`: `"at"` 会复制经过所选条目的当前活动路径，但不会恢复编辑器文本
- `withSession`：在一个全新的 replacement-session 上下文中运行切换后的工作。不要使用已捕获的旧 `pi` / 命令 `ctx`；请参见[会话替换生命周期与易踩坑点](#session-replacement-lifecycle-and-footguns)。

### ctx.navigateTree(targetId, options?)

导航到会话树中的另一个位置：

```typescript
const result = await ctx.navigateTree("entry-id-456", {
  summarize: true,
  customInstructions: "Focus on error handling changes",
  replaceInstructions: false, // true = 完全替换默认 prompt
  label: "review-checkpoint",
});
```

选项：
- `summarize`：是否为被放弃的分支生成摘要
- `customInstructions`：传给摘要器的自定义指令
- `replaceInstructions`：如果为 true，`customInstructions` 将替换默认 prompt，而不是追加到其后
- `label`：附加到分支摘要条目上的标签（如果不生成摘要，则附加到目标条目上）

### ctx.switchSession(sessionPath, options?)

切换到另一个会话文件：

```typescript
const result = await ctx.switchSession("/path/to/session.jsonl", {
  withSession: async (ctx) => {
    await ctx.sendUserMessage("Resume work in the replacement session");
  },
});
if (result.cancelled) {
  // 某个扩展通过 session_before_switch 取消了这次切换
}
```

选项：
- `withSession`：在一个全新的 replacement-session 上下文中运行切换后的工作。不要使用已捕获的旧 `pi` / 命令 `ctx`；请参见[会话替换生命周期与易踩坑点](#session-replacement-lifecycle-and-footguns)。

要发现可用的会话，请使用静态方法 `SessionManager.list()` 或 `SessionManager.listAll()`：

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

pi.registerCommand("switch", {
  description: "Switch to another session",
  handler: async (args, ctx) => {
    const sessions = await SessionManager.list(ctx.cwd);
    if (sessions.length === 0) return;
    const choice = await ctx.ui.select(
      "Pick session:",
      sessions.map(s => s.file),
    );
    if (choice) {
      await ctx.switchSession(choice, {
        withSession: async (ctx) => {
          ctx.ui.notify("Switched session", "info");
        },
      });
    }
  },
});
```

### 会话替换生命周期与易踩坑点

`withSession` 会接收一个全新的 `ReplacedSessionContext`，它扩展自 `ExtensionCommandContext`，并提供绑定到 replacement session 的异步 `sendMessage()` 和 `sendUserMessage()` 辅助方法。

生命周期与易踩坑点：
- `withSession` 只有在旧会话发出 `session_shutdown`、旧运行时已被销毁、replacement session 已重新绑定，且新的扩展实例已经收到 `session_start` 之后才会运行。
- 回调仍然在原始闭包中执行，而不是在新的扩展实例内部执行。这意味着你的旧扩展实例可能已经在 `withSession` 开始前跑完了关闭清理逻辑。
- 已捕获的旧 `pi` / 旧命令 `ctx` 这类绑定到会话的对象，在替换后都会变成过期对象，使用时会抛错。对于与会话绑定的工作，只使用传给 `withSession` 的 `ctx`。
- 之前提取出的原始对象仍然由你自己负责。例如，如果你在替换前捕获了 `const sm = ctx.sessionManager`，那么 `sm` 仍然是旧的 `SessionManager` 对象。替换后不要复用它。
- `withSession` 中的代码应假定，任何被你的 `session_shutdown` handler 失效化的状态都已经不存在。只捕获那些能在关闭后安全保留的普通数据，例如字符串、id 和序列化后的配置。

安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const kickoff = "Continue from the replacement session";
    await ctx.newSession({
      withSession: async (ctx) => {
        await ctx.sendUserMessage(kickoff);
      },
    });
  },
});
```

不安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const oldSessionManager = ctx.sessionManager;
    await ctx.newSession({
      withSession: async (_ctx) => {
        // 过期的旧对象：不要这样做
        oldSessionManager.getSessionFile();
        pi.sendUserMessage("wrong");
      },
    });
  },
});
```

### ctx.reload()

运行与 `/reload` 相同的 reload 流程。

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, and themes",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;
  },
});
```

重要行为：
- `await ctx.reload()` 会为当前扩展运行时发出 `session_shutdown`
- 随后它会重新加载资源，并发出带有 `reason: "reload"` 的 `session_start`，以及 reason 为 `"reload"` 的 `resources_discover`
- 当前正在运行的 command handler 仍会在旧调用帧中继续执行
- `await ctx.reload()` 之后的代码仍然来自 reload 前的版本
- `await ctx.reload()` 之后的代码不能假定旧的内存中扩展状态仍然有效
- 当 handler 返回后，后续的命令 / 事件 / 工具调用将使用新的扩展版本

为了获得可预测的行为，请把 reload 视为该 handler 的终点（`await ctx.reload(); return;`）。

工具运行在 `ExtensionContext` 中，因此它们不能直接调用 `ctx.reload()`。请使用一个 command 作为 reload 入口，然后暴露一个工具，让它把该 command 排队为后续 user message。

LLM 可调用以触发 reload 的工具示例：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("reload-runtime", {
    description: "Reload extensions, skills, prompts, and themes",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_runtime",
    label: "Reload Runtime",
    description: "Reload extensions, skills, prompts, and themes",
    parameters: Type.Object({}),
    async execute() {
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued /reload-runtime as a follow-up command." }],
      };
    },
  });
}
```

## ExtensionAPI 方法

### pi.on(event, handler)

订阅事件。关于事件类型和返回值，请参见[事件](#事件)。

### pi.registerTool(definition)

注册一个可由 LLM 调用的自定义工具。完整细节请参见[自定义工具](#自定义工具)。

`pi.registerTool()` 既可以在扩展加载期间调用，也可以在启动后调用。你可以在 `session_start`、command handler 或其他事件 handler 中调用它。新工具会在当前会话中立即刷新，因此它们会出现在 `pi.getAllTools()` 中，并且无需 `/reload` 就能被 LLM 调用。

使用 `pi.setActiveTools()` 可以在运行时启用或禁用工具（包括动态添加的工具）。

使用 `promptSnippet` 可以让自定义工具在 `Available tools` 中加入一条单行条目，使用 `promptGuidelines` 可以在工具处于激活状态时，将该工具专属的要点追加到默认的 `Guidelines` 部分。

**重要：** `promptGuidelines` 中的条目会被平铺追加到 `Guidelines` 部分中，不会带工具名前缀。每条 guideline 都必须明确指出它所指的工具——避免写成“Use this tool when...”，因为 LLM 无法判断“this”指的是哪个工具。请写成“Use my_tool when...”之类的形式。

完整示例请参见 [dynamic-tools.ts](../examples/extensions/dynamic-tools.ts)。

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "Summarize or transform text according to action",
  promptGuidelines: ["Use my_tool when the user asks to summarize previously generated text."],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    // 可选的兼容性垫片。在 schema 校验前运行。
    // 返回当前 schema 形状，例如把旧字段折叠
    // 到现代参数对象中。
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 流式输出进度
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

### pi.sendMessage(message, options?)

向会话中注入一条自定义消息。

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,
  deliverAs: "steer",
});
```

**选项：**
- `deliverAs` - 投递模式：
  - `"steer"`（默认）- 在流式输出期间将消息加入队列。会在当前 assistant turn 执行完工具调用后、下一次 LLM 调用前投递。
  - `"followUp"` - 等待 agent 完成。仅在 agent 没有更多工具调用时投递。
  - `"nextTurn"` - 为下一次 user prompt 排队。不会打断或触发任何事情。
- `triggerTurn: true` - 如果 agent 处于空闲状态，立即触发一次 LLM 响应。只适用于 `"steer"` 和 `"followUp"` 模式（对 `"nextTurn"` 无效，会被忽略）。

### pi.sendUserMessage(content, options?)

向 agent 发送一条 user message。不同于 `sendMessage()` 发送的是自定义消息，这里发送的是真正的 user message，它看起来就像是用户亲自输入的一样。总是会触发一个 turn。

```typescript
// 简单文本消息
pi.sendUserMessage("What is 2+2?");

// 使用内容数组（文本 + 图片）
pi.sendUserMessage([
  { type: "text", text: "Describe this image:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// 在流式输出期间——必须指定投递模式
pi.sendUserMessage("Focus on error handling", { deliverAs: "steer" });
pi.sendUserMessage("And then summarize", { deliverAs: "followUp" });
```

**选项：**
- `deliverAs` - 当 agent 正在流式输出时为必填：
  - `"steer"` - 将消息排队，在当前 assistant turn 执行完工具调用后投递
  - `"followUp"` - 等待 agent 完成所有工具

在非流式输出时，消息会立即发送并触发一个新的 turn。在流式输出时如果没有提供 `deliverAs`，则会抛出错误。

完整示例请参见 [send-user-message.ts](../examples/extensions/send-user-message.ts)。

### pi.appendEntry(customType, data?)

持久化扩展状态（**不会**参与 LLM 上下文）。

```typescript
pi.appendEntry("my-state", { count: 42 });

// 在 reload 时恢复
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // 从 entry.data 重建
    }
  }
});
```

### pi.setSessionName(name)

设置会话显示名称（在会话选择器中显示，而不是第一条消息）。

```typescript
pi.setSessionName("Refactor auth module");
```

### pi.getSessionName()

获取当前会话名称（如果已设置）。

```typescript
const name = pi.getSessionName();
if (name) {
  console.log(`Session: ${name}`);
}
```

### pi.setLabel(entryId, label)

为一个条目设置或清除标签。标签是用户定义的标记，用于书签和导航（显示在 `/tree` 选择器中）。

```typescript
// 设置标签
pi.setLabel(entryId, "checkpoint-before-refactor");

// 清除标签
pi.setLabel(entryId, undefined);

// 通过 sessionManager 读取标签
const label = ctx.sessionManager.getLabel(entryId);
```

标签会持久保存在会话中，并在重启后继续存在。用它们来标记会话树中的重要位置（turn、checkpoint）。

### pi.registerCommand(name, options)

注册一个命令。

如果多个扩展注册了相同的命令名，pi 会全部保留，并按加载顺序分配数字调用后缀，例如 `/review:1` 和 `/review:2`。

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  }
});
```

可选：为 `/command ...` 添加参数自动补全：

```typescript
import type { AutocompleteItem } from "@earendil-works/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### pi.getCommands()

获取当前会话中可通过 `prompt` 调用的 slash command。包括扩展命令、prompt template 和 skill command。
该列表与 RPC `get_commands` 的顺序一致：先扩展，再 template，最后是 skill。

```typescript
const commands = pi.getCommands();
const bySource = commands.filter((command) => command.source === "extension");
const userScoped = commands.filter((command) => command.sourceInfo.scope === "user");
```

每个条目的结构如下：

```typescript
{
  name: string; // 可调用的命令名，不含前导斜杠。可能带有类似 "review:1" 的后缀
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}
```

请使用 `sourceInfo` 作为规范的来源字段。不要根据命令名或临时性的路径解析来推断归属。

内置的交互式命令（例如 `/model` 和 `/settings`）不会出现在这里。它们只在交互模式下处理，
如果通过 `prompt` 发送则不会执行。

### pi.registerMessageRenderer(customType, renderer)

为带有你的 `customType` 的消息注册一个自定义 TUI 渲染器。请参见[自定义 UI](#自定义-ui)。

### pi.registerShortcut(shortcut, options)

注册一个键盘快捷键。快捷键格式和内置快捷键请参见 [keybindings.md](keybindings.md)。

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!", "info");
  },
});
```

### pi.registerFlag(name, options)

注册一个 CLI flag。

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// 检查值
if (pi.getFlag("plan")) {
  // 已启用 plan mode
}
```

### pi.exec(command, args, options?)

执行一个 shell 命令。

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names)

管理激活中的工具。这同时适用于内置工具和动态注册的工具。

```typescript
const active = pi.getActiveTools();
const all = pi.getAllTools();
// [{
//   name: "read",
//   description: "Read file contents...",
//   parameters: ...,
//   promptGuidelines: ["Use read to examine files instead of cat or sed."],
//   sourceInfo: { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" }
// }, ...]
const names = all.map(t => t.name);
const builtinTools = all.filter((t) => t.sourceInfo.source === "builtin");
const extensionTools = all.filter((t) => t.sourceInfo.source !== "builtin" && t.sourceInfo.source !== "sdk");
pi.setActiveTools(["read", "bash"]); // 切换为只读
```

`pi.getAllTools()` 返回 `name`、`description`、`parameters`、`promptGuidelines` 和 `sourceInfo`。

典型的 `sourceInfo.source` 值：
- 内置工具对应 `builtin`
- 通过 `createAgentSession({ customTools })` 传入的工具对应 `sdk`
- 由扩展注册的工具对应扩展源元数据

### pi.setModel(model)

设置当前模型。如果该模型没有可用的 API key，则返回 `false`。关于配置自定义模型，请参见 [models.md](models.md)。

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify("No API key for this model", "error");
  }
}
```

### pi.getThinkingLevel() / pi.setThinkingLevel(level)

获取或设置 thinking level。level 会被限制在模型能力范围内（非 reasoning 模型始终使用 `"off"`）。更改会发出 `thinking_level_select`。

```typescript
const current = pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");
```

### pi.events

用于扩展之间通信的共享事件总线：

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { ... });
```

### pi.registerProvider(name, config)

动态注册或覆盖一个模型 provider。适用于代理、自定义 endpoint 或团队范围的模型配置。

在扩展工厂函数期间发起的调用会被排队，并在 runner 初始化后应用。之后发起的调用——例如用户完成 setup 流程后由 command handler 发起的调用——会立即生效，而不需要 `/reload`。

如果你需要从远程 endpoint 发现模型，优先使用异步扩展工厂，而不是把抓取延后到 `session_start`。pi 会在启动继续之前等待工厂完成，因此注册的模型会立即可用，包括对 `pi --list-models` 也是如此。

```typescript
// 注册一个带有自定义模型的新 provider
pi.registerProvider("my-proxy", {
  name: "My Proxy",
  baseUrl: "https://proxy.example.com",
  apiKey: "$PROXY_API_KEY",  // 环境变量引用
  api: "anthropic-messages",
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// 为现有 provider 覆盖 baseUrl（保留所有 models）
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// 注册支持 /login 的 OAuth provider
pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",
    async login(callbacks) {
      // 自定义 OAuth 流程
      callbacks.onAuth({ url: "https://sso.corp.com/..." });
      const code = await callbacks.onPrompt({ message: "Enter code:" });
      return { refresh: code, access: code, expires: Date.now() + 3600000 };
    },
    async refreshToken(credentials) {
      // 刷新逻辑
      return credentials;
    },
    getApiKey(credentials) {
      return credentials.access;
    }
  }
});
```

**配置选项：**
- `name` - provider 在 UI（例如 `/login`）中的显示名称。
- `baseUrl` - API endpoint URL。定义 models 时必需。
- `apiKey` - API key 字面量、环境变量插值（`$ENV_VAR` 或 `${ENV_VAR}`），或前缀为 `!command` 的命令。定义 models 时必需（除非提供了 `oauth`）。`$$` 会转义 `$`，`$!` 会转义字面量 `!` 而不会触发命令执行。
- `api` - API 类型：`"anthropic-messages"`、`"openai-completions"`、`"openai-responses"` 等。
- `headers` - 要包含在请求中的自定义 headers。
- `authHeader` - 若为 true，会自动添加 `Authorization: Bearer` header。
- `models` - model 定义数组。如果提供，会替换此 provider 的所有现有 models。model 定义可以设置 `baseUrl` 以覆盖该 model 的 provider endpoint。
- `oauth` - 用于支持 `/login` 的 OAuth provider 配置。提供后，该 provider 会出现在登录菜单中。
- `streamSimple` - 面向非标准 API 的自定义流式实现。

高级主题请参见 [custom-provider.md](custom-provider.md)：自定义流式 API、OAuth 细节、model 定义参考。

### pi.unregisterProvider(name)

移除一个先前注册的 provider 及其 models。被该 provider 覆盖的内置 models 会被恢复。如果该 provider 未注册，则不会产生任何效果。

与 `registerProvider` 一样，在初始加载阶段之后调用时会立即生效，因此不需要 `/reload`。

```typescript
pi.registerCommand("my-setup-teardown", {
  description: "Remove the custom proxy provider",
  handler: async (_args, _ctx) => {
    pi.unregisterProvider("my-proxy");
  },
});
```

## 状态管理

带有状态的扩展应将状态存储在 tool result 的 `details` 中，以获得正确的分支支持：

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // 从 session 重建状态
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // 存储以便重建
      };
    },
  });
}
```

## 自定义工具

注册 LLM 可通过 `pi.registerTool()` 调用的工具。工具会出现在 system prompt 中，并且可以拥有自定义渲染。

使用 `promptSnippet` 在默认 system prompt 的 `Available tools` 部分中添加一个简短的单行条目。如果省略，自定义工具不会出现在该部分中。

使用 `promptGuidelines` 为默认 system prompt 的 `Guidelines` 部分添加工具专属的 bullet。这些 bullet 仅在工具处于激活状态时包含（例如，在 `pi.setActiveTools([...])` 之后）。

**重要：** `promptGuidelines` 的 bullet 会被平铺追加到 `Guidelines` 部分中，不带工具名称前缀，也不会分组。每条 guideline 都必须点名它所指的工具——避免写成“Use this tool when...”，因为 LLM 无法判断 “this” 指的是哪个工具。应改为写 “Use my_tool when...”。

注意：有些 model 很蠢，会在工具路径参数中包含 @ 前缀。内置工具会在解析路径前去掉开头的 @。如果你的自定义工具接受路径参数，也应同样规范化开头的 @。

如果你的自定义工具会修改文件，请使用 `withFileMutationQueue()`，这样它就会参与与内置 `edit` 和 `write` 相同的按文件排队机制。这一点很重要，因为默认情况下 tool call 是并行运行的。如果没有这个队列，两个工具可能读取相同的旧文件内容，计算出不同的更新，然后最后落盘的那个写入会覆盖另一个。

失败示例：你的自定义工具编辑 `foo.ts`，同时内置 `edit` 也在同一个 assistant turn 中修改 `foo.ts`。如果你的工具不参与队列，两者都可能读取原始的 `foo.ts`，分别应用更改，结果其中一个更改会丢失。

传给 `withFileMutationQueue()` 的应是真实的目标文件路径，而不是原始的用户参数。先将其解析为相对于 `ctx.cwd` 或你的工具工作目录的绝对路径。对于已存在的文件，该辅助函数会通过 `realpath()` 做规范化，因此同一文件的 symlink 别名会共享同一个队列。对于新文件，由于尚无内容可供 `realpath()`，它会回退到已解析的绝对路径。

要把整个变更窗口都放入该目标路径的队列中。这包括 read-modify-write 逻辑，而不只是最后的写入。

```typescript
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

### 工具定义

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use my_tool for todo planning instead of direct file edits when the user asks for a task list."
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // 为兼容 Google，请使用 StringEnum
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;
    const input = args as { action?: string; oldAction?: string };
    if (typeof input.oldAction === "string" && input.action === undefined) {
      return { ...input, action: input.oldAction };
    }
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 检查是否已取消
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // 流式发送进度更新
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // 通过 pi.exec 运行命令（从扩展闭包中捕获）
    const result = await pi.exec("some-command", [], { signal });

    // 返回结果
    return {
      content: [{ type: "text", text: "Done" }],  // 发送给 LLM
      details: { data: result },                   // 用于渲染和状态
      // 可选：当且仅当该批次中每个已完成的 tool result
      // 也都返回 terminate: true 时，在此工具批次后停止。
      terminate: true,
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

**错误信号：** 要将一次 tool 执行标记为失败（在结果上设置 `isError: true` 并报告给 LLM），请在 `execute` 中抛出错误。无论你在返回对象中包含什么属性，返回值本身都不会设置错误标志。

**提前终止：** 从 `execute()` 返回 `terminate: true`，可提示在当前工具批次结束后跳过自动的后续 LLM 调用。只有当该批次中每个已完成的 tool result 都是 terminating 时，这才会生效。参见 [examples/extensions/structured-output.ts](../examples/extensions/structured-output.ts)，其中有一个最小示例：agent 在最终的 structured-output tool call 后结束。

```typescript
// 正确：通过抛出错误来表示错误
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

**重要：** 对于 string enum，请使用来自 `@earendil-works/pi-ai` 的 `StringEnum`。`Type.Union`/`Type.Literal` 不适用于 Google's API。

**参数预处理：** `prepareArguments(args)` 是可选的。如果定义了，它会在 schema 校验之前以及 `execute()` 之前运行。当 pi 恢复一个旧 session，而其中存储的 tool call 参数已不再匹配当前 schema 时，可以用它来兼容旧的输入结构。返回你希望按 `parameters` 校验的对象即可。请保持公开 schema 严格，不要为了兼容旧的恢复 session，而在 `parameters` 中加入已废弃的兼容字段。

示例：一个旧 session 中可能包含一个顶层带有 `oldText` 和 `newText` 的 `edit` tool call，而当前 schema 只接受 `edits: [{ oldText, newText }]`。

```typescript
pi.registerTool({
  name: "edit",
  label: "Edit",
  description: "Edit a single file using exact text replacement",
  parameters: Type.Object({
    path: Type.String(),
    edits: Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String(),
      }),
    ),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;

    const input = args as {
      path?: string;
      edits?: Array<{ oldText: string; newText: string }>;
      oldText?: unknown;
      newText?: unknown;
    };

    if (typeof input.oldText !== "string" || typeof input.newText !== "string") {
      return args;
    }

    return {
      ...input,
      edits: [...(input.edits ?? []), { oldText: input.oldText, newText: input.newText }],
    };
  },
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // params 现在匹配当前 schema
    return {
      content: [{ type: "text", text: `Applying ${params.edits.length} edit block(s)` }],
      details: {},
    };
  },
});
```

### 覆盖内置工具

扩展可以通过注册同名工具来覆盖内置工具（`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`）。交互模式会在发生这种情况时显示警告。

```bash
# 扩展的 read 工具会替换内置 read
pi -e ./tool-override.ts
```

或者，使用 `--no-builtin-tools` 可以在保留扩展工具启用的同时，不加载任何内置工具：
```bash
# 没有内置工具，只有扩展工具
pi --no-builtin-tools -e ./my-extension.ts
```

完整示例参见 [examples/extensions/tool-override.ts](../examples/extensions/tool-override.ts)，其中通过日志和访问控制覆盖了 `read`。

**渲染：** 内置渲染器的继承是按槽位解析的。执行覆盖与渲染覆盖彼此独立。如果你的覆盖未提供 `renderCall`，则会使用内置的 `renderCall`。如果你的覆盖未提供 `renderResult`，则会使用内置的 `renderResult`。如果两者都未提供，则会自动使用内置渲染器（语法高亮、diff 等）。这让你可以包装内置工具以实现日志或访问控制，而无需重新实现 UI。

**Prompt 元数据：** `promptSnippet` 和 `promptGuidelines` 不会从内置工具继承。如果你的覆盖需要保留这些 prompt 指令，请在覆盖中显式定义它们。

**你的实现必须与结果 shape 完全匹配**，包括 `details` 的类型。UI 和 session 逻辑依赖这些 shape 进行渲染和状态跟踪。

内置工具实现：
- [read.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/read.ts) - `ReadToolDetails`
- [bash.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts) - `BashToolDetails`
- [edit.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts)
- [write.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts)
- [grep.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/grep.ts) - `GrepToolDetails`
- [find.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/find.ts) - `FindToolDetails`
- [ls.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/ls.ts) - `LsToolDetails`

### 远程执行

内置工具支持可插拔的 operations，用于委托到远程系统（SSH、容器等）：

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@earendil-works/pi-coding-agent";

// 使用自定义 operations 创建工具
const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  }
});

// 注册时在执行阶段检查 flag
pi.registerTool({
  ...remoteRead,
  async execute(id, params, signal, onUpdate, _ctx) {
    const ssh = getSshConfig();
    if (ssh) {
      const tool = createReadTool(cwd, { operations: createRemoteOps(ssh) });
      return tool.execute(id, params, signal, onUpdate);
    }
    return localRead.execute(id, params, signal, onUpdate);
  },
});
```

**Operations 接口：** `ReadOperations`、`WriteOperations`、`EditOperations`、`BashOperations`、`LsOperations`、`GrepOperations`、`FindOperations`

对于 `user_bash`，扩展可以复用 pi 的本地 shell backend，即通过 `createLocalBashOperations()`，而不是重新实现本地进程生成、shell 解析和进程树终止。

bash 工具还支持一个 spawn hook，可在执行前调整命令、cwd 或 env：

```typescript
import { createBashTool } from "@earendil-works/pi-coding-agent";

const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

完整 SSH 示例请参见 [examples/extensions/ssh.ts](../examples/extensions/ssh.ts)，其中使用了 `--ssh` flag。

### 输出截断

**工具必须截断其输出**，以避免压垮 LLM 上下文。过大的输出可能导致：
- 上下文溢出错误（prompt 过长）
- 压缩失败
- model 性能下降

内置限制是 **50KB**（约 10k tokens）和 **2000 行**，以先达到者为准。请使用导出的截断工具：

```typescript
import {
  truncateHead,      // 保留前 N 行/字节（适用于文件读取、搜索结果）
  truncateTail,      // 保留后 N 行/字节（适用于日志、命令输出）
  truncateLine,      // 将单行截断到 maxBytes，并加上省略号
  formatSize,        // 人类可读的大小（例如 "50KB"、"1.5MB"）
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
} from "@earendil-works/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();

  // 应用截断
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;

  if (truncation.truncated) {
    // 将完整输出写入临时文件
    const tempFile = writeTempFile(output);

    // 告知 LLM 到哪里查找完整输出
    result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    result += ` Full output saved to: ${tempFile}]`;
  }

  return { content: [{ type: "text", text: result }] };
}
```

**关键点：**
- 对于开头更重要的内容，请使用 `truncateHead`（搜索结果、文件读取）
- 对于结尾更重要的内容，请使用 `truncateTail`（日志、命令输出）
- 输出被截断时，始终告知 LLM，并说明完整版本的位置
- 在你的工具描述中记录截断限制

完整示例参见 [examples/extensions/truncated-tool.ts](../examples/extensions/truncated-tool.ts)，其中封装了 `rg`（ripgrep）并做了正确的截断处理。

### 多个工具

一个扩展可以注册多个共享状态的工具：

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null;

  pi.registerTool({ name: "db_connect", ... });
  pi.registerTool({ name: "db_query", ... });
  pi.registerTool({ name: "db_close", ... });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```

### 自定义渲染

工具可以提供 `renderCall` 和 `renderResult` 来实现自定义 TUI 显示。完整组件 API 请参见 [tui.md](tui.md)，tool 行如何组合请参见 [tool-execution.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/components/tool-execution.ts)。

默认情况下，tool 输出会包裹在一个处理内边距和背景的 `Box` 中。已定义的 `renderCall` 或 `renderResult` 必须返回一个 `Component`。如果某个槽位渲染器未定义，`tool-execution.ts` 会对该槽位使用后备渲染。

将 `renderShell: "self"` 设置为当工具应渲染其自己的 shell，而不是使用默认的 `Box` 时使用。这对于需要完全控制边框或背景行为的工具很有用，例如在工具稳定后必须保持视觉稳定的大型预览。

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Custom shell example",
  parameters: Type.Object({}),
  renderShell: "self",
  async execute() {
    return { content: [{ type: "text", text: "ok" }], details: undefined };
  },
  renderCall(args, theme, context) {
    return new Text(theme.fg("accent", "my custom shell"), 0, 0);
  },
});
```

`renderCall` 和 `renderResult` 都会接收一个 `context` 对象，其中包含：
- `args` - 当前工具调用参数
- `state` - 在 `renderCall` 和 `renderResult` 之间共享的行局部状态
- `lastComponent` - 该槽位上次返回的组件（如果有）
- `invalidate()` - 请求重新渲染此工具行
- `toolCallId`, `cwd`, `executionStarted`, `argsComplete`, `isPartial`, `expanded`, `showImages`, `isError`

将 `context.state` 用于跨槽位共享状态。当你希望在多次渲染间复用并修改同一个组件时，可将槽位局部缓存保存在返回的组件实例上。

#### renderCall

渲染工具调用或标题：

```typescript
import { Text } from "@earendil-works/pi-tui";

renderCall(args, theme, context) {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  let content = theme.fg("toolTitle", theme.bold("my_tool "));
  content += theme.fg("muted", args.action);
  if (args.text) {
    content += " " + theme.fg("dim", `"${args.text}"`);
  }
  text.setText(content);
  return text;
}
```

#### renderResult

渲染工具结果或输出：

```typescript
renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Processing..."), 0, 0);
  }

  if (result.details?.error) {
    return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
  }

  let text = theme.fg("success", "✓ Done");
  if (expanded && result.details?.items) {
    for (const item of result.details.items) {
      text += "\n  " + theme.fg("dim", item);
    }
  }
  return new Text(text, 0, 0);
}
```

如果某个槽位有意不显示可见内容，请返回一个空的 `Component`，例如空的 `Container`。

#### 快捷键提示

使用 `keyHint()` 显示遵循当前活动快捷键配置的按键提示：

```typescript
import { keyHint } from "@earendil-works/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

可用函数：
- `keyHint(keybinding, description)` - 格式化已配置的快捷键 id，例如 `"app.tools.expand"` 或 `"tui.select.confirm"`
- `keyText(keybinding)` - 返回某个快捷键 id 配置的原始按键文本
- `rawKeyHint(key, description)` - 格式化原始按键字符串

使用带命名空间的快捷键 id：
- Coding-agent id 使用 `app.*` 命名空间，例如 `app.tools.expand`、`app.editor.external`、`app.session.rename`
- 共享 TUI id 使用 `tui.*` 命名空间，例如 `tui.select.confirm`、`tui.select.cancel`、`tui.input.tab`

关于快捷键 id 和默认值的完整列表，请参见 [keybindings.md](keybindings.md)。`keybindings.json` 使用这些相同的带命名空间 id。

自定义编辑器和 `ctx.ui.custom()` 组件会通过注入参数接收 `keybindings: KeybindingsManager`。它们应直接使用这个注入的管理器，而不是调用 `getKeybindings()` 或 `setKeybindings()`。

#### 最佳实践

- 使用带 `(0, 0)` 内边距的 `Text`。默认 `Box` 会处理内边距。
- 对多行内容使用 `\n`。
- 处理 `isPartial` 以支持流式进度。
- 支持 `expanded` 以按需显示详情。
- 保持默认视图紧凑。
- 在 `renderResult` 中读取 `context.args`，而不是把参数复制到 `context.state` 中。
- 仅将 `context.state` 用于必须在调用槽位和结果槽位之间共享的数据。
- 当同一个组件实例可以原地更新时，复用 `context.lastComponent`。
- 仅在默认的 boxed shell 会造成干扰时使用 `renderShell: "self"`。在 self-shell 模式下，工具需要自行负责边框、内边距和背景。

#### 回退行为

如果槽位渲染器未定义或抛出异常：
- `renderCall`：显示工具名称
- `renderResult`：显示来自 `content` 的原始文本

## 自定义 UI

扩展可以通过 `ctx.ui` 方法与用户交互，并自定义消息/工具的渲染方式。

**对于自定义组件，请参见 [tui.md](tui.md)**，其中提供了可直接复制粘贴的模式：
- 选择对话框（SelectList）
- 可取消的异步操作（BorderedLoader）
- 设置开关（SettingsList）
- 状态指示器（setStatus）
- 流式传输期间的工作消息、可见性和指示器（`setWorkingMessage`、`setWorkingVisible`、`setWorkingIndicator`）
- 编辑器上方/下方的小部件（setWidget）
- 叠加在内置 slash/path 补全之上的自动补全提供器（addAutocompleteProvider）
- 自定义页脚（setFooter）

### 对话框

```typescript
// 从选项中选择
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// 确认对话框
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// 文本输入
const name = await ctx.ui.input("Name:", "placeholder");

// 多行编辑器
const text = await ctx.ui.editor("Edit:", "prefilled text");

// 通知（非阻塞）
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

#### 带倒计时的定时对话框

对话框支持 `timeout` 选项，会通过实时倒计时显示自动关闭：

```typescript
// 对话框会显示“Title (5s)”→“Title (4s)”→……，并在倒计时到 0 时自动关闭
const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { timeout: 5000 }
);

if (confirmed) {
  // 用户已确认
} else {
  // 用户取消了，或已超时
}
```

**超时时的返回值：**
- `select()` 返回 `undefined`
- `confirm()` 返回 `false`
- `input()` 返回 `undefined`

#### 使用 AbortSignal 手动关闭

如需更多控制（例如区分超时和用户取消），请使用 `AbortSignal`：

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { signal: controller.signal }
);

clearTimeout(timeoutId);

if (confirmed) {
  // 用户已确认
} else if (controller.signal.aborted) {
  // 对话框已超时
} else {
  // 用户已取消（按下 Escape 或选择了 “No”）
}
```

完整示例见 [examples/extensions/timed-confirm.ts](../examples/extensions/timed-confirm.ts)。

### 小部件、状态与页脚

```typescript
// 页脚中的状态（持续显示直到被清除）
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // 清除

// 工作加载器（流式传输期间显示）
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // 恢复默认值
ctx.ui.setWorkingVisible(false);  // 完全隐藏内置工作加载器行
ctx.ui.setWorkingVisible(true);   // 显示内置工作加载器行

// 工作指示器（流式传输期间显示）
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });  // 静态圆点
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});
ctx.ui.setWorkingIndicator({ frames: [] });  // 隐藏指示器
ctx.ui.setWorkingIndicator();  // 恢复默认旋转器

// 编辑器上方的小部件（默认）
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
// 编辑器下方的小部件
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // 清除

// 自定义页脚（完全替换内置页脚）
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // 恢复内置页脚

// 终端标题
ctx.ui.setTitle("pi - my-project");

// 编辑器文本
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();

// 粘贴到编辑器（会触发粘贴处理，包括大内容折叠）
ctx.ui.pasteToEditor("pasted content");

// 在内置提供器之上叠加自定义自动补全行为
ctx.ui.addAutocompleteProvider((current) => ({
  async getSuggestions(lines, line, col, options) {
    const beforeCursor = (lines[line] ?? "").slice(0, col);
    const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
    if (!match) {
      return current.getSuggestions(lines, line, col, options);
    }

    return {
      prefix: `#${match[1] ?? ""}`,
      items: [{ value: "#2983", label: "#2983", description: "Extension API for autocomplete" }],
    };
  },
  applyCompletion(lines, line, col, item, prefix) {
    return current.applyCompletion(lines, line, col, item, prefix);
  },
  shouldTriggerFileCompletion(lines, line, col) {
    return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
  },
}));

// 工具输出展开
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);
ctx.ui.setToolsExpanded(wasExpanded);

// 自定义编辑器（vim mode、emacs mode 等）
ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimEditor(tui, theme, keybindings));
const currentEditor = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new WrappedEditor(tui, theme, keybindings, currentEditor?.(tui, theme, keybindings))
);
ctx.ui.setEditorComponent(undefined);  // 恢复默认编辑器

// 主题管理（创建主题见 themes.md）
const themes = ctx.ui.getAllThemes();  // [{ name: "dark", path: "/..." | undefined }, ...]
const lightTheme = ctx.ui.getTheme("light");  // 加载但不切换
const result = ctx.ui.setTheme("light");  // 按名称切换
if (!result.success) {
  ctx.ui.notify(`Failed: ${result.error}`, "error");
}
ctx.ui.setTheme(lightTheme!);  // 或按 Theme 对象切换
ctx.ui.theme.fg("accent", "styled text");  // 访问当前主题
```

自定义 working-indicator 帧会按原样渲染。如果你想要颜色，请自行将颜色添加到帧字符串中，例如使用 `ctx.ui.theme.fg(...)`。

### 自动补全提供器

使用 `ctx.ui.addAutocompleteProvider()` 可在内置 slash-command 和路径提供器之上叠加自定义自动补全逻辑。

典型模式：

- 检查光标前的文本
- 当匹配到你的扩展专用语法时返回你自己的建议
- 否则委托给 `current.getSuggestions(...)`
- 除非你需要自定义插入行为，否则委托 `applyCompletion(...)`

```typescript
pi.on("session_start", (_event, ctx) => {
  ctx.ui.addAutocompleteProvider((current) => ({
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
      if (!match) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `#${match[1] ?? ""}`,
        items: [
          { value: "#2983", label: "#2983", description: "Extension API for registering custom @ autocomplete providers" },
          { value: "#2753", label: "#2753", description: "Reload stale resource settings" },
        ],
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  }));
});
```

完整示例见 [github-issue-autocomplete.ts](../examples/extensions/github-issue-autocomplete.ts)。它会用 `gh issue list` 预加载最新的 GitHub open issues，并在本地过滤它们以实现快速 `#...` 补全。它需要 GitHub CLI (`gh`) 和一个 GitHub 仓库检出。

### 自定义组件

对于复杂 UI，请使用 `ctx.ui.custom()`。这会临时用你的组件替换编辑器，直到调用 `done()`：

```typescript
import { Text, Component } from "@earendil-works/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});

if (result) {
  // 用户按下了 Enter
}
```

回调接收：
- `tui` - TUI 实例（用于屏幕尺寸、焦点管理）
- `theme` - 用于样式的当前主题
- `keybindings` - 应用快捷键管理器（用于检查快捷键）
- `done(value)` - 调用后关闭组件并返回值

完整组件 API 见 [tui.md](tui.md)。

#### 叠加模式（实验性）

传入 `{ overlay: true }` 可将组件作为浮动模态框渲染在现有内容之上，而不会清空屏幕：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  { overlay: true }
);
```

对于高级定位（锚点、边距、百分比、响应式可见性），请传入 `overlayOptions`。使用 `onHandle` 以编程方式控制可见性：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => { /* handle.setHidden(true/false) */ }
  }
);
```

完整的 `OverlayOptions` API 见 [tui.md](tui.md)，示例见 [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts)。

### 自定义编辑器

使用自定义实现（vim mode、emacs mode 等）替换主输入编辑器：

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);  // App 快捷键 + 文本编辑
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
      new VimEditor(theme, keybindings)
    );
  });
}
```

**要点：**
- 扩展 `CustomEditor`（不是基础 `Editor`），以获得应用快捷键支持（escape 中止、ctrl+d、模型切换）
- 对于你未处理的按键，调用 `super.handleInput(data)`
- 工厂函数从应用接收 `theme` 和 `keybindings`
- 在 `setEditorComponent()` 之前使用 `ctx.ui.getEditorComponent()`，以包装先前已配置的自定义编辑器
- 传入 `undefined` 以恢复默认值：`ctx.ui.setEditorComponent(undefined)`

若要与另一个已替换编辑器的扩展组合，请在设置自己的编辑器之前先捕获之前的工厂：

```typescript
const previous = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new MyEditor(tui, theme, keybindings, { base: previous?.(tui, theme, keybindings) })
);
```

带模式指示器的完整示例见 [tui.md](tui.md) Pattern 7。

### 消息渲染

为带有你的 `customType` 的消息注册自定义渲染器：

```typescript
import { Text } from "@earendil-works/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;

  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }

  return new Text(text, 0, 0);
});
```

消息通过 `pi.sendMessage()` 发送：

```typescript
pi.sendMessage({
  customType: "my-extension",  // 对应 registerMessageRenderer
  content: "Status update",
  display: true,               // 在 TUI 中显示
  details: { ... },            // 可在渲染器中使用
});
```

### 主题颜色

所有渲染函数都会接收一个 `theme` 对象。创建自定义主题和完整色板请参见 [themes.md](themes.md)。

```typescript
// 前景色
theme.fg("toolTitle", text)   // 工具名称
theme.fg("accent", text)      // 高亮
theme.fg("success", text)     // 成功（绿色）
theme.fg("error", text)       // 错误（红色）
theme.fg("warning", text)     // 警告（黄色）
theme.fg("muted", text)       // 次级文本
theme.fg("dim", text)         // 三级文本

// 文本样式
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

对于自定义工具渲染器中的语法高亮：

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";

// 使用显式语言高亮代码
const highlighted = highlightCode("const x = 1;", "typescript", theme);

// 从文件路径自动检测语言
const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```

## 错误处理

- 扩展错误会被记录，agent 会继续运行
- `tool_call` 错误会阻止该工具（故障安全）
- 工具 `execute` 错误必须通过抛出异常来表示；抛出的错误会被捕获，并以 `isError: true` 报告给 LLM，然后执行继续

## 模式行为

| 模式 | UI 方法 | 说明 |
|------|-----------|-------|
| 交互 | 完整 TUI | 正常运行 |
| RPC (`--mode rpc`) | JSON 协议 | 主机处理 UI，参见 [rpc.md](rpc.md) |
| JSON (`--mode json`) | No-op | 事件流输出到 stdout，参见 [json.md](json.md) |
| Print (`-p`) | No-op | 扩展会运行，但不能发起提示 |

在非交互模式下，使用 UI 方法前请检查 `ctx.hasUI`。

## 示例参考

所有示例位于 [examples/extensions/](../examples/extensions/)。

| 示例 | 描述 | 关键 API |
|---------|-------------|----------|
| **工具** |||
| `hello.ts` | 最小化工具注册 | `registerTool` |
| `question.ts` | 带用户交互的工具 | `registerTool`, `ui.select` |
| `questionnaire.ts` | 多步骤向导工具 | `registerTool`, `ui.custom` |
| `todo.ts` | 带持久化的有状态工具 | `registerTool`, `appendEntry`, `renderResult`, 会话事件 |
| `dynamic-tools.ts` | 在启动后以及命令执行期间注册工具 | `registerTool`, `session_start`, `registerCommand` |
| `structured-output.ts` | 使用 `terminate: true` 的最终 structured-output 工具 | `registerTool`, 终止型工具结果 |
| `truncated-tool.ts` | 输出截断示例 | `registerTool`, `truncateHead` |
| `tool-override.ts` | 覆盖内置 read 工具 | `registerTool`（与内置工具同名） |
| **命令** |||
| `pirate.ts` | 在每轮中修改 system prompt | `registerCommand`, `before_agent_start` |
| `summarize.ts` | 对话摘要命令 | `registerCommand`, `ui.custom` |
| `handoff.ts` | 跨 provider 的模型切换 | `registerCommand`, `ui.editor`, `ui.custom` |
| `qna.ts` | 带自定义 UI 的问答 | `registerCommand`, `ui.custom`, `setEditorText` |
| `send-user-message.ts` | 注入用户消息 | `registerCommand`, `sendUserMessage` |
| `reload-runtime.ts` | 重载命令和 LLM 工具切换 | `registerCommand`, `ctx.reload()`, `sendUserMessage` |
| `shutdown-command.ts` | 优雅关闭命令 | `registerCommand`, `shutdown()` |
| **事件与门控** |||
| `permission-gate.ts` | 阻止危险命令 | `on("tool_call")`, `ui.confirm` |
| `protected-paths.ts` | 阻止写入特定路径 | `on("tool_call")` |
| `confirm-destructive.ts` | 确认会话更改 | `on("session_before_switch")`, `on("session_before_fork")` |
| `dirty-repo-guard.ts` | 在 git 仓库有未提交更改时发出警告 | `on("session_before_*")`, `exec` |
| `input-transform.ts` | 转换用户输入 | `on("input")` |
| `input-transform-streaming.ts` | 支持流式处理的输入转换 | `on("input")`, `streamingBehavior` |
| `model-status.ts` | 响应模型变更 | `on("model_select")`, `setStatus` |
| `provider-payload.ts` | 检查 payload 和 provider 响应头 | `on("before_provider_request")`, `on("after_provider_response")` |
| `system-prompt-header.ts` | 显示 system prompt 信息 | `on("agent_start")`, `getSystemPrompt` |
| `claude-rules.ts` | 从文件加载规则 | `on("session_start")`, `on("before_agent_start")` |
| `prompt-customizer.ts` | 使用 `systemPromptOptions` 添加与上下文相关的工具指导 | `on("before_agent_start")`, `BuildSystemPromptOptions` |
| `file-trigger.ts` | 文件监听器触发消息 | `sendMessage` |
| **压缩与会话** |||
| `custom-compaction.ts` | 自定义 compaction 摘要 | `on("session_before_compact")` |
| `trigger-compact.ts` | 手动触发 compaction | `compact()` |
| `git-checkpoint.ts` | 在各轮中执行 Git stash | `on("turn_start")`, `on("session_before_fork")`, `exec` |
| `git-merge-and-resolve.ts` | 获取、合并并解决冲突 | `on("agent_end")`, `exec`, `sendUserMessage` |
| `auto-commit-on-exit.ts` | 退出时自动提交 | `on("session_shutdown")`, `exec` |
| **UI 组件** |||
| `status-line.ts` | 页脚状态指示器 | `setStatus`, 会话事件 |
| `working-indicator.ts` | 自定义流式输出时的工作指示器 | `setWorkingIndicator`, `registerCommand` |
| `github-issue-autocomplete.ts` | 在内置自动补全基础上，通过预加载来自 `gh issue list` 的最近开放 issue，为 `#1234` 添加 issue 自动补全 | `addAutocompleteProvider`, `on("session_start")`, `exec` |
| `custom-footer.ts` | 完全替换页脚 | `registerCommand`, `setFooter` |
| `custom-header.ts` | 替换启动页眉 | `on("session_start")`, `setHeader` |
| `modal-editor.ts` | Vim 风格的模态编辑器 | `setEditorComponent`, `CustomEditor` |
| `rainbow-editor.ts` | 自定义编辑器样式 | `setEditorComponent` |
| `widget-placement.ts` | 将 widget 放在编辑器上方/下方 | `setWidget` |
| `overlay-test.ts` | Overlay 组件 | `ui.custom`，带 overlay 选项 |
| `overlay-qa-tests.ts` | 全面的 overlay 测试 | `ui.custom`，包含所有 overlay 选项 |
| `notify.ts` | 简单通知 | `ui.notify` |
| `timed-confirm.ts` | 带超时的对话框 | `ui.confirm`，带 timeout/signal |
| `mac-system-theme.ts` | 自动切换主题 | `setTheme`, `exec` |
| **复杂扩展** |||
| `plan-mode/` | 完整的 plan mode 实现 | 所有事件类型，`registerCommand`, `registerShortcut`, `registerFlag`, `setStatus`, `setWidget`, `sendMessage`, `setActiveTools` |
| `preset.ts` | 可保存的预设（model、tools、thinking） | `registerCommand`, `registerShortcut`, `registerFlag`, `setModel`, `setActiveTools`, `setThinkingLevel`, `appendEntry` |
| `tools.ts` | 切换工具开/关的 UI | `registerCommand`, `setActiveTools`, `SettingsList`, 会话事件 |
| **远程与沙箱** |||
| `ssh.ts` | SSH 远程执行 | `registerFlag`, `on("user_bash")`, `on("before_agent_start")`, 工具操作 |
| `interactive-shell.ts` | 持久化 shell 会话 | `on("user_bash")` |
| `sandbox/` | 沙箱化工具执行 | 工具操作 |
| `subagent/` | 生成 sub-agent | `registerTool`, `exec` |
| **游戏** |||
| `snake.ts` | 贪吃蛇游戏 | `registerCommand`, `ui.custom`, 键盘处理 |
| `space-invaders.ts` | 太空侵略者游戏 | `registerCommand`, `ui.custom` |
| `doom-overlay/` | 在 overlay 中运行 Doom | `ui.custom`，带 overlay |
| **提供器** |||
| `custom-provider-anthropic/` | 自定义 Anthropic 代理 | `registerProvider` |
| `custom-provider-gitlab-duo/` | GitLab Duo 集成（带 OAuth） | `registerProvider`，带 OAuth |
| **消息与通信** |||
| `message-renderer.ts` | 自定义消息渲染 | `registerMessageRenderer`, `sendMessage` |
| `event-bus.ts` | 扩展间事件总线 | `pi.events` |
| **会话元数据** |||
| `session-name.ts` | 为选择器中的会话命名 | `setSessionName`, `getSessionName` |
| `bookmark.ts` | 为 `/tree` 添加书签条目 | `setLabel` |
| **其他** |||
| `inline-bash.ts` | 在工具调用中内联 bash | `on("tool_call")` |
| `bash-spawn-hook.ts` | 在执行前调整 bash 命令、cwd 和 env | `createBashTool`, `spawnHook` |
| `with-deps/` | 带 npm 依赖的扩展 | 带 `package.json` 的包结构 |
