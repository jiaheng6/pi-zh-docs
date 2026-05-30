# @earendil-works/pi-agent-core

带工具执行和事件流的有状态代理。基于 `@earendil-works/pi-ai` 构建。

## 安装

```bash
npm install @earendil-works/pi-agent-core
```

## 快速开始

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("Hello!");
```

## 核心概念

### AgentMessage 与 LLM 消息

代理使用 `AgentMessage`，这是一种灵活的类型，可以包含：
- 标准 LLM 消息（`user`、`assistant`、`toolResult`）
- 通过声明合并的自定义应用特定消息类型

LLM 只理解 `user`、`assistant` 和 `toolResult`。`convertToLlm` 函数在每次 LLM 调用前通过过滤和转换消息来弥合这一差距。

### 消息流

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    (可选)                              (必需)
```

1. **transformContext**：修剪旧消息，注入外部上下文
2. **convertToLlm**：过滤掉仅 UI 的消息，将自定义类型转换为 LLM 格式

## 事件流

代理发出事件用于 UI 更新。理解事件序列有助于构建响应式界面。

### prompt() 事件序列

当你调用 `prompt("Hello")` 时：

```
prompt("Hello")
├─ agent_start
├─ turn_start
├─ message_start   { message: userMessage }
├─ message_end     { message: userMessage }
├─ message_start   { message: assistantMessage }
├─ message_update  { message: partial... }
├─ message_update  { message: partial... }
├─ message_end     { message: assistantMessage }
├─ turn_end        { message, toolResults: [] }
└─ agent_end       { messages: [...] }
```

### 带工具调用

如果助手调用工具，循环继续：

```
prompt("Read config.json")
├─ agent_start
├─ turn_start
├─ message_start/end  { userMessage }
├─ message_start      { assistantMessage with toolCall }
├─ message_update...
├─ message_end        { assistantMessage }
├─ tool_execution_start  { toolCallId, toolName, args }
├─ tool_execution_update { partialResult }
├─ tool_execution_end    { toolCallId, result }
├─ message_start/end  { toolResultMessage }
├─ turn_end           { message, toolResults: [toolResult] }
│
├─ turn_start
├─ message_start      { assistantMessage }
├─ message_update...
├─ message_end
├─ turn_end
└─ agent_end
```

工具执行模式可配置：

- `parallel`（默认）：顺序预检工具调用，并发执行允许的工具，每个工具完成后立即发出 `tool_execution_end`，然后按助手源顺序发出 toolResult 消息和 `turn_end.toolResults`
- `sequential`：逐一执行工具调用，匹配历史行为

在并行模式下，工具完成事件遵循工具完成顺序，但持久化的 toolResult 消息仍遵循助手源顺序。

`beforeToolCall` 钩子在 `tool_execution_start` 和验证的参数解析之后运行。它可以阻止执行。`afterToolCall` 钩子在工具执行完成后、`tool_execution_end` 和最终工具结果消息事件发出之前运行。

工具也可以返回 `terminate: true` 来提示应跳过自动后续 LLM 调用。仅当该批次中的每个最终工具结果都设置 `terminate: true` 时，循环才提前停止。

低级循环调用者可以设置 `shouldStopAfterTurn` 在当前回合完成后优雅停止。

### continue() 事件序列

`continue()` 从现有上下文恢复而不添加新消息。用于错误后重试。

### 事件类型

| 事件 | 描述 |
|-------|-------------|
| `agent_start` | 代理开始处理 |
| `agent_end` | 运行的最终事件 |
| `turn_start` | 新回合开始（一次 LLM 调用 + 工具执行） |
| `turn_end` | 回合完成，带助手消息和工具结果 |
| `message_start` | 任何消息开始（user、assistant、toolResult） |
| `message_update` | **仅助手**。包含带 delta 的 `assistantMessageEvent` |
| `message_end` | 消息完成 |
| `tool_execution_start` | 工具开始 |
| `tool_execution_update` | 工具流式进度 |
| `tool_execution_end` | 工具完成 |

## Agent 选项

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: string,
    model: Model<any>,
    thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
    tools: AgentTool<any>[],
    messages: AgentMessage[],
  },
  convertToLlm: (messages) => messages.filter(...),
  transformContext: async (messages, signal) => pruneOldMessages(messages),
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  streamFn: streamProxy,
  sessionId: "session-123",
  getApiKey: async (provider) => refreshToken(),
  toolExecution: "parallel",
  beforeToolCall: async ({ toolCall, args, context }) => { ... },
  afterToolCall: async ({ toolCall, result, isError, context }) => { ... },
  thinkingBudgets: { minimal: 128, low: 512, medium: 1024, high: 2048 },
});
```

## Agent 状态

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

通过 `agent.state` 访问状态。

赋值 `agent.state.tools = [...]` 或 `agent.state.messages = [...]` 在存储前复制顶层数组。修改返回的数组会修改当前代理状态。

## 方法

### 提示

```typescript
await agent.prompt("Hello");
await agent.prompt("What's in this image?", [
  { type: "image", data: base64Data, mimeType: "image/jpeg" }
]);
await agent.prompt({ role: "user", content: "Hello", timestamp: Date.now() });
await agent.continue();
```

### 状态管理

```typescript
agent.state.systemPrompt = "New prompt";
agent.state.model = getModel("openai", "gpt-4o");
agent.state.thinkingLevel = "medium";
agent.state.tools = [myTool];
agent.reset();
```

### 控制

```typescript
agent.abort();
await agent.waitForIdle();
```

### 事件

```typescript
const unsubscribe = agent.subscribe(async (event, signal) => { ... });
unsubscribe();
```

## 转向和后续

转向消息让你在工具运行时中断代理。后续消息让你在代理本应停止后排队工作。

```typescript
agent.steer({ role: "user", content: "Stop! Do this instead.", timestamp: Date.now() });
agent.followUp({ role: "user", content: "Also summarize the result.", timestamp: Date.now() });
agent.clearSteeringQueue();
agent.clearFollowUpQueue();
agent.clearAllQueues();
```

## 自定义消息类型

通过声明合并扩展 `AgentMessage`：

```typescript
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: { role: "notification"; text: string; timestamp: number };
  }
}
```

在 `convertToLlm` 中处理自定义类型。

## 工具

使用 `AgentTool` 定义工具：

```typescript
import { Type } from "typebox";

const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  executionMode: "sequential",
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, "utf-8");
    onUpdate?.({ content: [{ type: "text", text: "Reading..." }], details: {} });
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};
```

### 错误处理

工具失败时**抛出错误**。不要将错误消息作为内容返回。

```typescript
execute: async (toolCallId, params, signal, onUpdate) => {
  if (!fs.existsSync(params.path)) {
    throw new Error(`File not found: ${params.path}`);
  }
  return { content: [{ type: "text", text: "..." }] };
}
```

## 代理使用

用于通过后端代理的浏览器应用：

```typescript
import { Agent, streamProxy } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: "...",
      proxyUrl: "https://your-server.com",
    }),
});
```

## 低级 API

不使用 Agent 类的直接控制：

```typescript
import { agentLoop, agentLoopContinue } from "@earendil-works/pi-agent-core";

const context: AgentContext = {
  systemPrompt: "You are helpful.",
  messages: [],
  tools: [],
};

const config: AgentLoopConfig = {
  model: getModel("openai", "gpt-4o"),
  convertToLlm: (msgs) => msgs.filter(m => ["user", "assistant", "toolResult"].includes(m.role)),
  toolExecution: "parallel",
};

const userMessage = { role: "user", content: "Hello", timestamp: Date.now() };

for await (const event of agentLoop([userMessage], context, config)) {
  console.log(event.type);
}
```

这些低级流是观察性的。它们保持事件顺序，但不会等待你的异步事件处理在后续生产者阶段继续前完成。如果你需要消息处理在工具预检前作为屏障，请使用 `Agent` 类。

## 许可证

MIT
