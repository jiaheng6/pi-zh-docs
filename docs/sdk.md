> pi 可以帮助你使用 SDK。可以让它为你的使用场景构建集成。

# SDK

SDK 提供了以编程方式访问 pi agent 能力的入口。你可以用它将 pi 嵌入到其他应用中、构建自定义界面，或集成到自动化工作流中。

**示例使用场景：**
- 构建自定义 UI（web、desktop、mobile）
- 将 agent 能力集成到现有应用中
- 构建带有 agent 推理能力的自动化流水线
- 构建可生成 sub-agent 的自定义工具
- 以编程方式测试 agent 行为

参见 [examples/sdk/](../examples/sdk/) 获取从最小用法到完全控制的可运行示例。

## 快速开始

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

// 设置凭证存储和 model registry
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

## 安装

```bash
npm install @earendil-works/pi-coding-agent
```

SDK 已包含在主包中，无需单独安装。

## 核心概念

### createAgentSession()

用于创建单个 `AgentSession` 的主要工厂函数。

`createAgentSession()` 使用 `ResourceLoader` 提供扩展、skills、prompt templates、themes 和 context files。如果你没有提供，它会使用带有标准发现机制的 `DefaultResourceLoader`。

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

// 最简用法：使用带有 DefaultResourceLoader 的默认配置
const { session } = await createAgentSession();

// 自定义：覆盖特定选项
const { session } = await createAgentSession({
  model: myModel,
  tools: ["read", "bash"],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession

session 负责管理 agent 生命周期、消息历史、model 状态、压缩以及事件流。

```typescript
interface AgentSession {
  // 发送 prompt 并等待完成
  prompt(text: string, options?: PromptOptions): Promise<void>;

  // 在流式输出期间将消息加入队列
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;

  // 订阅事件（返回取消订阅函数）
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;

  // Session 信息
  sessionFile: string | undefined;
  sessionId: string;

  // Model 控制
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;

  // 状态访问
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;

  // 在当前 session 文件内进行原地树导航
  navigateTree(targetId: string, options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string }): Promise<{ editorText?: string; cancelled: boolean }>;

  // 压缩
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;

  // 中止当前操作
  abort(): Promise<void>;

  // 清理
  dispose(): void;
}
```

像 new-session、resume、fork 和 import 这样的 session 替换 API 位于 `AgentSessionRuntime` 上，而不在 `AgentSession` 上。

### createAgentSessionRuntime() 和 AgentSessionRuntime

当你需要替换活动 session 并重建与 cwd 绑定的 runtime 状态时，请使用 runtime API。
这也是内置 interactive、print 和 RPC 模式所使用的同一层。

`createAgentSessionRuntime()` 接收一个 runtime factory，以及初始 cwd/session 目标。该 factory 会闭包保存进程级全局固定输入，为生效的 cwd 重新创建与 cwd 绑定的服务，基于这些服务解析 session 选项，并返回完整的 runtime 结果。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
```

`AgentSessionRuntime` 负责在以下操作中替换活动 runtime：

- `newSession()`
- `switchSession()`
- `fork()`
- 通过 `fork(entryId, { position: "at" })` 进行 clone 流程
- `importFromJsonl()`

重要行为：

- `runtime.session` 会在这些操作之后发生变化
- 事件订阅绑定在特定 `AgentSession` 上，因此替换后需要重新订阅
- 如果你使用了扩展，需要为新的 session 再次调用 `runtime.session.bindExtensions(...)`
- 创建结果会在 `runtime.diagnostics` 上返回 diagnostics
- 如果 runtime 创建或替换失败，该方法会抛出异常，由调用方决定如何处理

```typescript
let session = runtime.session;
let unsubscribe = session.subscribe(() => {});

await runtime.newSession();

unsubscribe();
session = runtime.session;
unsubscribe = session.subscribe(() => {});
```

### Prompting 和 Message Queueing

`PromptOptions` 用于控制 prompt 展开、流式输出时的排队行为，以及 prompt 预检通知：

```typescript
interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

`preflightResult` 会在每次调用 `prompt()` 时调用一次：

- 当 prompt 被接受、排队或立即处理时为 `true`
- 当 prompt 在接受前被预检拒绝时为 `false`

它会在 `prompt()` resolve 之前触发。`prompt()` 仍然只会在完整的已接受执行结束后 resolve，其中包括重试。接受之后的失败会通过正常的事件流和消息流上报，而不会通过 `preflightResult(false)` 上报。

`prompt()` 方法负责处理 prompt templates、扩展命令和消息发送：

```typescript
// 基本 prompt（在非流式输出时）
await session.prompt("What files are here?");

// 带图片
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// 在流式输出期间：必须指定如何将消息加入队列
await session.prompt("Stop and do this instead", { streamingBehavior: "steer" });
await session.prompt("After you're done, also check X", { streamingBehavior: "followUp" });
```

**行为：**
- **扩展命令**（例如 `/mycommand`）：即使在流式输出期间也会立即执行。它们通过 `pi.sendMessage()` 自行管理自己的 LLM 交互。
- **基于文件的 prompt templates**（来自 `.md` 文件）：在发送或排队前会先展开为其内容。
- **在流式输出期间且未提供 `streamingBehavior`**：会抛出错误。请直接使用 `steer()` 或 `followUp()`，或显式指定该选项。
- **`preflightResult(true)`**：表示 prompt 已被接受、排队或立即处理。
- **`preflightResult(false)`**：表示预检在接受前已拒绝。

如需在流式输出期间显式排队：

```typescript
// 将一条 steering 消息加入队列，在当前 assistant turn 完成其 tool 调用后投递
await session.steer("New instruction");

// 等待 agent 完成（仅在 agent 停止时投递）
await session.followUp("After you're done, also do this");
```

`steer()` 和 `followUp()` 都会展开基于文件的 prompt templates，但在扩展命令上会报错（扩展命令不能加入队列）。

### Agent 和 AgentState

`Agent` 类（来自 `@earendil-works/pi-agent-core`）处理核心 LLM 交互。可通过 `session.agent` 访问。

```typescript
// 访问当前状态
const state = session.agent.state;

// state.messages: AgentMessage[] - 对话历史
// state.model: Model - 当前 model
// state.thinkingLevel: ThinkingLevel - 当前 thinking level
// state.systemPrompt: string - system prompt
// state.tools: AgentTool[] - 可用 tools
// state.streamingMessage?: AgentMessage - 当前部分 assistant 消息
// state.errorMessage?: string - 最近的 assistant 错误

// 替换 messages（适用于分支或恢复）
session.agent.state.messages = messages; // 会复制顶层数组

// 替换 tools
session.agent.state.tools = tools; // 会复制顶层数组

// 等待 agent 完成处理
await session.agent.waitForIdle();
```

### 事件

订阅事件以接收流式输出和生命周期通知。

```typescript
session.subscribe((event) => {
  switch (event.type) {
    // 来自 assistant 的流式文本
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        // Thinking 输出（如果启用了 thinking）
      }
      break;
    
    // Tool 执行
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_update":
      // 流式 tool 输出
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.isError ? "error" : "success"}`);
      break;
    
    // 消息生命周期
    case "message_start":
      // 新消息开始
      break;
    case "message_end":
      // 消息完成
      break;
    
    // Agent 生命周期
    case "agent_start":
      // Agent 开始处理 prompt
      break;
    case "agent_end":
      // Agent 结束（event.messages 包含新消息）
      break;
    
    // Turn 生命周期（一次 LLM 响应 + tool 调用）
    case "turn_start":
      break;
    case "turn_end":
      // event.message: assistant 响应
      // event.toolResults: 此 turn 的 tool 结果
      break;
    
    // Session 事件（队列、压缩、重试）
    case "queue_update":
      console.log(event.steering, event.followUp);
      break;
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
      break;
  }
});
```

## 选项参考

### 目录

```typescript
const { session } = await createAgentSession({
  // DefaultResourceLoader 用于发现资源的工作目录
  cwd: process.cwd(), // 默认值
  
  // 全局配置目录
  agentDir: "~/.pi/agent", // 默认值（会展开 ~）
});
```

`cwd` 被 `DefaultResourceLoader` 用于：
- 项目扩展（`.pi/extensions/`）
- 项目 skills：
  - `.pi/skills/`
  - 位于 `cwd` 及其祖先目录中的 `.agents/skills/`（向上直到 git 仓库根目录；若不在仓库中，则到文件系统根目录）
- 项目 prompts（`.pi/prompts/`）
- Context files（从 cwd 向上查找的 `AGENTS.md`）
- Session 目录命名

`agentDir` 被 `DefaultResourceLoader` 用于：
- 全局扩展（`extensions/`）
- 全局 skills：
  - `agentDir` 下的 `skills/`（例如 `~/.pi/agent/skills/`）
  - `~/.agents/skills/`
- 全局 prompts（`prompts/`）
- 全局 context file（`AGENTS.md`）
- Settings（`settings.json`）
- 自定义 models（`models.json`）
- 凭证（`auth.json`）
- Sessions（`sessions/`）

当你传入自定义 `ResourceLoader` 时，`cwd` 和 `agentDir` 将不再控制资源发现。但它们仍会影响 session 命名和 tool 路径解析。

### Model

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// 查找特定内置 model（不会检查 API key 是否存在）
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("Model not found");

// 按 provider/id 查找任意 model，包括来自 models.json 的自定义 models
// （不会检查 API key 是否存在）
const customModel = modelRegistry.find("my-provider", "my-model");

// 仅获取已配置有效 API key 的 models
const available = await modelRegistry.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh
  
  // 用于循环切换的 models（interactive 模式中按 Ctrl+P）
  scopedModels: [
    { model: opus, thinkingLevel: "high" },
    { model: haiku, thinkingLevel: "off" },
  ],
  
  authStorage,
  modelRegistry,
});
```

如果未提供 model：
1. 尝试从 session 恢复（如果是继续已有 session）
2. 使用 settings 中的默认值
3. 回退到第一个可用 model

> 参见 [examples/sdk/02-custom-model.ts](../examples/sdk/02-custom-model.ts)

### API Keys 和 OAuth

API key 解析优先级（由 AuthStorage 处理）：
1. Runtime 覆盖（通过 `setRuntimeApiKey`，不会持久化）
2. 存储在 `auth.json` 中的凭证（API keys 或 OAuth tokens）
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
4. 回退解析器（用于来自 `models.json` 的自定义 provider key）

```typescript
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

// 默认：使用 ~/.pi/agent/auth.json 和 ~/.pi/agent/models.json
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// Runtime API key 覆盖（不会持久化到磁盘）
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");

// 自定义 auth storage 位置
const customAuth = AuthStorage.create("/my/app/auth.json");
const customRegistry = ModelRegistry.create(customAuth, "/my/app/models.json");

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: customAuth,
  modelRegistry: customRegistry,
});

// 不使用自定义 models.json（仅内置 models）
const simpleRegistry = ModelRegistry.inMemory(authStorage);
```

> 参见 [examples/sdk/09-api-keys-and-oauth.ts](../examples/sdk/09-api-keys-and-oauth.ts)

### System Prompt

使用 `ResourceLoader` 覆盖 system prompt：

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/03-custom-prompt.ts](../examples/sdk/03-custom-prompt.ts)

### Tools

指定要启用哪些内置 tools：

- 内置 tool 名称：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`
- 默认内置 tools：`read`、`bash`、`edit`、`write`
- `noTools: "all"` 会禁用所有 tools
- `noTools: "builtin"` 会禁用默认内置 tools，同时保留扩展和自定义 tools 可用
- `excludeTools` 会在应用 `tools` allowlist（如果有）后，禁用指定的内置、扩展或自定义 tool 名称

`edit` tool 会返回 `details.diff` 供 Pi 的 TUI 显示，并为 SDK 使用者返回标准 unified patch 格式的 `details.patch`。

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

// 只读模式
const { session } = await createAgentSession({
  tools: ["read", "grep", "find", "ls"],
});

// 选择特定 tools
const { session } = await createAgentSession({
  tools: ["read", "bash", "grep"],
});

// 禁用一个 tool，同时保留其他 tool 可用
const { session } = await createAgentSession({
  excludeTools: ["ask_question"],
});
```

#### 使用自定义 cwd 的 Tools

当你传入自定义 `cwd` 时，`createAgentSession()` 会为该 cwd 构建所选的内置 tools。

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const cwd = "/path/to/project";

// 为自定义 cwd 使用默认 tools
const { session } = await createAgentSession({
  cwd,
  sessionManager: SessionManager.inMemory(cwd),
});

// 或者为自定义 cwd 选择特定 tools
const { session } = await createAgentSession({
  cwd,
  tools: ["read", "bash", "grep"],
  sessionManager: SessionManager.inMemory(cwd),
});
```

> 参见 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### 自定义 Tools

```typescript
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

// 内联自定义 tool
const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

// 直接传入自定义 tools
const { session } = await createAgentSession({
  customTools: [myTool],
});
```

对于独立定义和类似 `customTools: [myTool]` 这样的数组，请使用 `defineTool()`。内联 `pi.registerTool({ ... })` 已经可以正确推断参数类型。

通过 `customTools` 传入的自定义 tools 会与扩展注册的 tools 组合。由 ResourceLoader 加载的扩展也可以通过 `pi.registerTool()` 注册 tools。

如果你传入 `tools`，请把想启用的每个自定义或扩展 tool 名称都包含进去，例如 `tools: ["read", "bash", "my_tool"]`。

> 参见 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### Extensions

Extensions 由 `ResourceLoader` 加载。`DefaultResourceLoader` 会从 `~/.pi/agent/extensions/`、`.pi/extensions/` 以及 settings.json 中的 extension sources 发现扩展。

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[Inline Extension] Agent starting");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

Extensions 可以注册 tools、订阅事件、添加命令等。完整 API 请参见 [extensions.md](extensions.md)。

**Event Bus：** 扩展可以通过 `pi.events` 进行通信。如果你需要从外部发射或监听事件，请向 `DefaultResourceLoader` 传入共享的 `eventBus`：

```typescript
import { createEventBus, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const eventBus = createEventBus();
const loader = new DefaultResourceLoader({
  eventBus,
});
await loader.reload();

eventBus.on("my-extension:status", (data) => console.log(data));
```

> 参见 [examples/sdk/06-extensions.ts](../examples/sdk/06-extensions.ts) 和 [docs/extensions.md](extensions.md)

### Skills

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@earendil-works/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/04-skills.ts](../examples/sdk/04-skills.ts)

### Context Files

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/07-context-files.ts](../examples/sdk/07-context-files.ts)

### Slash Commands

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type PromptTemplate,
} from "@earendil-works/pi-coding-agent";

const customCommand: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  source: "(custom)",
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  promptsOverride: (current) => ({
    prompts: [...current.prompts, customCommand],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/08-prompt-templates.ts](../examples/sdk/08-prompt-templates.ts)

### Session 管理

Sessions 使用 `id`/`parentId` 链接的树结构，从而支持原地分支。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// 内存中（不持久化）
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// 新的持久化 session
const { session: persisted } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// 继续最近的 session
const { session: continued, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) {
  console.log("Note:", modelFallbackMessage);
}

// 打开指定文件
const { session: opened } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// 列出 sessions
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 用于 /new、/resume、/fork、/clone 和 import 流程的 session 替换 API。
const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// 用一个全新的 session 替换当前活动 session
await runtime.newSession();

// 用另一个已保存 session 替换当前活动 session
await runtime.switchSession("/path/to/session.jsonl");

// 用从特定用户条目分叉出的 session 替换当前活动 session
await runtime.fork("entry-id");

// 克隆经过特定条目的活动路径
await runtime.fork("entry-id", { position: "at" });
```

**SessionManager tree API：**

```typescript
const sm = SessionManager.open("/path/to/session.jsonl");

// Session 列表
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 树遍历
const entries = sm.getEntries();        // 所有条目（不含 header）
const tree = sm.getTree();              // 完整树结构
const path = sm.getPath();              // 从根到当前叶子的路径
const leaf = sm.getLeafEntry();         // 当前叶子条目
const entry = sm.getEntry(id);          // 按 ID 获取条目
const children = sm.getChildren(id);    // 条目的直接子节点

// Labels
const label = sm.getLabel(id);          // 获取条目的 label
sm.appendLabelChange(id, "checkpoint"); // 设置 label

// 分支
sm.branch(entryId);                     // 将叶子移动到更早的条目
sm.branchWithSummary(id, "Summary...");  // 带上下文摘要地分支
sm.createBranchedSession(leafId);       // 将路径提取到新文件
```

> 参见 [examples/sdk/11-sessions.ts](../examples/sdk/11-sessions.ts) 和 [Session Format](session-format.md)

### Settings 管理

```typescript
import { createAgentSession, SettingsManager, SessionManager } from "@earendil-works/pi-coding-agent";

// 默认：从文件加载（合并全局 + 项目）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// 带 overrides
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});
const { session } = await createAgentSession({ settingsManager });

// 内存中（无文件 I/O，用于测试）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});

// 自定义目录
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create("/custom/cwd", "/custom/agent"),
});
```

**静态工厂：**
- `SettingsManager.create(cwd?, agentDir?)` - 从文件加载
- `SettingsManager.inMemory(settings?)` - 无文件 I/O

**项目级 settings：**

Settings 会从两个位置加载并合并：
1. 全局：`~/.pi/agent/settings.json`
2. 项目：`<cwd>/.pi/settings.json`

项目配置会覆盖全局配置。嵌套对象会按 key 合并。setter 默认修改全局 settings。

**持久化与错误处理语义：**

- Settings 的 getter/setter 针对内存状态是同步的。
- Setter 会异步将持久化写入加入队列。
- 当你需要一个持久性边界时，请调用 `await settingsManager.flush()`（例如，在进程退出前，或在测试中断言文件内容之前）。
- `SettingsManager` 不会打印 settings I/O 错误。请使用 `settingsManager.drainErrors()` 并在你的应用层上报这些错误。

> 参见 [examples/sdk/10-settings.ts](../examples/sdk/10-settings.ts)

## ResourceLoader

使用 `DefaultResourceLoader` 来发现 extensions、skills、prompts、themes 和 context files。

```typescript
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
});
await loader.reload();

const extensions = loader.getExtensions();
const skills = loader.getSkills();
const prompts = loader.getPrompts();
const themes = loader.getThemes();
const contextFiles = loader.getAgentsFiles().agentsFiles;
```

## 返回值

`createAgentSession()` 返回：

```typescript
interface CreateAgentSessionResult {
  // session
  session: AgentSession;
  
  // Extensions 结果（用于 runner setup）
  extensionsResult: LoadExtensionsResult;
  
  // 当无法恢复 session model 时的警告
  modelFallbackMessage?: string;
}

interface LoadExtensionsResult {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
}
```

## 完整示例

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// 设置 auth storage（自定义位置）
const authStorage = AuthStorage.create("/custom/agent/auth.json");

// Runtime API key 覆盖（不会持久化）
if (process.env.MY_KEY) {
  authStorage.setRuntimeApiKey("anthropic", process.env.MY_KEY);
}

// Model registry（不使用自定义 models.json）
const modelRegistry = ModelRegistry.create(authStorage);

// 内联 tool
const statusTool = defineTool({
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
});

const model = getModel("anthropic", "claude-opus-4-5");
if (!model) throw new Error("Model not found");

// 带 overrides 的内存 settings
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  settingsManager,
  systemPromptOverride: () => "You are a minimal assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/custom/agent",

  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,

  tools: ["read", "bash", "status"],
  customTools: [statusTool],
  resourceLoader: loader,

  sessionManager: SessionManager.inMemory(),
  settingsManager,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Get status and list files.");
```

## 运行模式

SDK 导出了运行模式相关工具，用于在 `createAgentSession()` 之上构建自定义界面：

### InteractiveMode

完整的 TUI interactive 模式，带有 editor、聊天历史以及所有内置命令：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

const mode = new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: "Hello",
  initialImages: [],
  initialMessages: [],
});

await mode.run();
```

### runPrintMode

单次执行模式：发送 prompts、输出结果并退出：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runPrintMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runPrintMode(runtime, {
  mode: "text",
  initialMessage: "Hello",
  initialImages: [],
  messages: ["Follow up"],
});
```

### runRpcMode

用于子进程集成的 JSON-RPC 模式：

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runRpcMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runRpcMode(runtime);
```

JSON 协议请参见 [RPC documentation](rpc.md)。

## RPC 模式替代方案

如果你不想基于 SDK 构建，而是想进行基于子进程的集成，可以直接使用 CLI：

```bash
pi --mode rpc --no-session
```

JSON 协议请参见 [RPC documentation](rpc.md)。

在以下场景中，更推荐使用 SDK：
- 你希望获得类型安全
- 你位于同一个 Node.js 进程中
- 你需要直接访问 agent 状态
- 你希望以编程方式自定义 tools/extensions

在以下场景中，更推荐使用 RPC 模式：
- 你要从另一种语言进行集成
- 你希望获得进程隔离
- 你在构建与语言无关的客户端

## 导出项

主入口导出：

```typescript
// 工厂
createAgentSession
createAgentSessionRuntime
AgentSessionRuntime

// Auth 和 Models
AuthStorage
ModelRegistry

// 资源加载
DefaultResourceLoader
type ResourceLoader
createEventBus

// Helpers
defineTool

// Session 管理
SessionManager
SettingsManager

// Tool factories
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// Types
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

关于 extension types，完整 API 请参见 [extensions.md](extensions.md)。
