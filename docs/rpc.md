# RPC 模式

RPC 模式通过 stdin/stdout 上的 JSON 协议，使 coding agent 能够以无头方式运行。这对于将 agent 嵌入到其他应用、IDE 或自定义 UI 中非常有用。

**给 Node.js/TypeScript 用户的说明**：如果你正在构建 Node.js 应用，建议直接使用 `@earendil-works/pi-coding-agent` 中的 `AgentSession`，而不是启动一个子进程。API 请参见 [`src/core/agent-session.ts`](../src/core/agent-session.ts)。如果你需要基于子进程的 TypeScript 客户端，请参见 [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts)。

## 启动 RPC 模式

```bash
pi --mode rpc [options]
```

常用选项：
- `--provider <name>`：设置 LLM provider（anthropic、openai、google 等）
- `--model <pattern>`：模型模式或 ID（支持 `provider/id` 和可选的 `:<thinking>`）
- `--name <name>` / `-n <name>`：在启动时设置 session 显示名称
- `--no-session`：禁用 session 持久化
- `--session-dir <path>`：自定义 session 存储目录

## 协议概览

- **Commands**：发送到 stdin 的 JSON 对象，每行一个
- **Responses**：带有 `type: "response"` 的 JSON 对象，用于表示 command 成功或失败
- **Events**：以 JSON 行的形式流式输出到 stdout 的 agent 事件

所有 command 都支持可选的 `id` 字段，用于请求/响应关联。如果提供了该字段，对应的 response 也会包含相同的 `id`。

### 分帧

RPC 模式使用严格的 JSONL 语义，并且只使用 LF（`\n`）作为记录分隔符。

这对客户端很重要：
- 只按 `\n` 拆分记录
- 通过去掉结尾的 `\r` 来接受可选的 `\r\n` 输入
- 不要使用会把 Unicode 分隔符也当作换行符的通用行读取器

特别是，Node 的 `readline` 对 RPC 模式来说并不符合协议，因为它还会在 `U+2028` 和 `U+2029` 处拆分，而这两个字符在 JSON 字符串中是合法的。

## 命令

### 发送 Prompt

#### prompt

向 agent 发送用户 prompt。该 command 的 response 会在 prompt 被接受、入队或处理后发出。接受之后，events 会继续异步流式输出。

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

带图片：
```json
{"type": "prompt", "message": "What's in this image?", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

**在流式输出期间**：如果 agent 已经在流式输出，你必须指定 `streamingBehavior` 才能将消息加入队列：

```json
{"type": "prompt", "message": "New instruction", "streamingBehavior": "steer"}
```

- `"steer"`：当 agent 正在运行时将消息入队。该消息会在当前 assistant turn 执行完它的 tool calls 之后、下一次 LLM 调用之前被投递。
- `"followUp"`：等待 agent 完成。只有在 agent 停止后才会投递消息。

如果 agent 正在流式输出且没有指定 `streamingBehavior`，该 command 会返回错误。

**Extension commands**：如果消息是 extension command（例如 `/mycommand`），它会即使在流式输出期间也立即执行。Extension commands 通过 `pi.sendMessage()` 自行管理它们的 LLM 交互。

**Input expansion**：skill commands（`/skill:name`）和 prompt templates（`/template`）会在发送/入队前展开。

响应：
```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true}
```

`success: true` 表示 prompt 已被接受、入队或立即处理。`success: false` 表示 prompt 在被接受之前就被拒绝。接受之后发生的失败会通过正常的 event 和 message 流报告，而不会针对同一个 request id 再返回第二个 `response`。

`images` 字段是可选的。每张图片都使用 `ImageContent` 格式：`{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}`。

#### steer

在 agent 运行期间将一条 steering message 加入队列。该消息会在当前 assistant turn 执行完它的 tool calls 之后、下一次 LLM 调用之前被投递。skill commands 和 prompt templates 会被展开。Extension commands 不允许使用（请改用 `prompt`）。

```json
{"type": "steer", "message": "Stop and do this instead"}
```

带图片：
```json
{"type": "steer", "message": "Look at this instead", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段是可选的。每张图片都使用 `ImageContent` 格式（与 `prompt` 相同）。

响应：
```json
{"type": "response", "command": "steer", "success": true}
```

关于如何控制 steering messages 的处理方式，请参见 [set_steering_mode](#set_steering_mode)。

#### follow_up

将一条 follow-up message 加入队列，以便在 agent 完成后处理。只有当 agent 没有更多 tool calls 或 steering messages 时才会投递。skill commands 和 prompt templates 会被展开。Extension commands 不允许使用（请改用 `prompt`）。

```json
{"type": "follow_up", "message": "After you're done, also do this"}
```

带图片：
```json
{"type": "follow_up", "message": "Also check this image", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段是可选的。每张图片都使用 `ImageContent` 格式（与 `prompt` 相同）。

响应：
```json
{"type": "response", "command": "follow_up", "success": true}
```

关于如何控制 follow-up messages 的处理方式，请参见 [set_follow_up_mode](#set_follow_up_mode)。

#### abort

中止当前的 agent 操作。

```json
{"type": "abort"}
```

响应：
```json
{"type": "response", "command": "abort", "success": true}
```

#### new_session

启动一个全新的 session。可以被 `session_before_switch` extension event handler 取消。

```json
{"type": "new_session"}
```

带可选的 parent session 跟踪：
```json
{"type": "new_session", "parentSession": "/path/to/parent-session.jsonl"}
```

响应：
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": false}}
```

如果被 extension 取消：
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": true}}
```

### 状态

#### get_state

获取当前 session 状态。

```json
{"type": "get_state"}
```

响应：
```json
{
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "isCompacting": false,
    "steeringMode": "all",
    "followUpMode": "one-at-a-time",
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "sessionName": "my-feature-work",
    "autoCompactionEnabled": true,
    "messageCount": 5,
    "pendingMessageCount": 0
  }
}
```

`model` 字段是完整的 [Model](#model) 对象，或者为 `null`。`sessionName` 字段是通过 `set_session_name` 设置的显示名称；如果未设置，则会省略该字段。

#### get_messages

获取对话中的所有消息。

```json
{"type": "get_messages"}
```

响应：
```json
{
  "type": "response",
  "command": "get_messages",
  "success": true,
  "data": {"messages": [...]}
}
```

消息是 `AgentMessage` 对象（参见 [Message Types](#message-types)）。

### 模型

#### set_model

切换到指定模型。

```json
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
```

Response 包含完整的 [Model](#model) 对象：
```json
{
  "type": "response",
  "command": "set_model",
  "success": true,
  "data": {...}
}
```

#### cycle_model

切换到下一个可用模型。如果只有一个可用模型，则返回 `null` data。

```json
{"type": "cycle_model"}
```

响应：
```json
{
  "type": "response",
  "command": "cycle_model",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isScoped": false
  }
}
```

`model` 字段是完整的 [Model](#model) 对象。

#### get_available_models

列出所有已配置的模型。

```json
{"type": "get_available_models"}
```

Response 包含一个由完整 [Model](#model) 对象组成的数组：
```json
{
  "type": "response",
  "command": "get_available_models",
  "success": true,
  "data": {
    "models": [...]
  }
}
```

### Thinking

#### set_thinking_level

为支持该功能的模型设置 reasoning/thinking level。

```json
{"type": "set_thinking_level", "level": "high"}
```

级别：`"off"`、`"minimal"`、`"low"`、`"medium"`、`"high"`、`"xhigh"`

注意：`"xhigh"` 仅由 OpenAI codex-max 模型支持。

响应：
```json
{"type": "response", "command": "set_thinking_level", "success": true}
```

#### cycle_thinking_level

循环切换可用的 thinking levels。如果模型不支持 thinking，则返回 `null` data。

```json
{"type": "cycle_thinking_level"}
```

响应：
```json
{
  "type": "response",
  "command": "cycle_thinking_level",
  "success": true,
  "data": {"level": "high"}
}
```

### 队列模式

#### set_steering_mode

控制 steering messages（来自 `steer`）的投递方式。

```json
{"type": "set_steering_mode", "mode": "one-at-a-time"}
```

模式：
- `"all"`：在当前 assistant turn 执行完它的 tool calls 后，投递所有 steering messages
- `"one-at-a-time"`：每完成一个 assistant turn 投递一条 steering message（默认）

响应：
```json
{"type": "response", "command": "set_steering_mode", "success": true}
```

#### set_follow_up_mode

控制 follow-up messages（来自 `follow_up`）的投递方式。

```json
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

模式：
- `"all"`：在 agent 完成时投递所有 follow-up messages
- `"one-at-a-time"`：每次 agent 完成时投递一条 follow-up message（默认）

响应：
```json
{"type": "response", "command": "set_follow_up_mode", "success": true}
```

### Compaction

#### compact

手动压缩对话上下文，以减少 token 使用量。

```json
{"type": "compact"}
```

带自定义说明：
```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

响应：
```json
{
  "type": "response",
  "command": "compact",
  "success": true,
  "data": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  }
}
```

#### set_auto_compaction

在上下文接近满时启用或禁用自动 compaction。

```json
{"type": "set_auto_compaction", "enabled": true}
```

响应：
```json
{"type": "response", "command": "set_auto_compaction", "success": true}
```

### 重试

#### set_auto_retry

启用或禁用瞬时错误（overloaded、rate limit、5xx）时的自动重试。

```json
{"type": "set_auto_retry", "enabled": true}
```

响应：
```json
{"type": "response", "command": "set_auto_retry", "success": true}
```

#### abort_retry

中止正在进行的重试（取消延迟并停止继续重试）。

```json
{"type": "abort_retry"}
```

响应：
```json
{"type": "response", "command": "abort_retry", "success": true}
```

### Bash

#### bash

执行 shell command，并将输出添加到对话上下文中。

```json
{"type": "bash", "command": "ls -la"}
```

响应：
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x ...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": false
  }
}
```

如果输出被截断，则会包含 `fullOutputPath`：
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "truncated output...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": true,
    "fullOutputPath": "/tmp/pi-bash-abc123.log"
  }
}
```

**bash 结果如何传递给 LLM：**

`bash` command 会立即执行并返回一个 `BashResult`。在内部，会创建一个 `BashExecutionMessage` 并存储到 agent 的消息状态中。这个消息**不会**发出 event。

当下一个 `prompt` command 被发送时，所有消息（包括 `BashExecutionMessage`）都会在发送给 LLM 之前进行转换。`BashExecutionMessage` 会被转换为如下格式的 `UserMessage`：

````
Ran `ls -la`
```
total 48
drwxr-xr-x ...
```
````

这意味着：
1. Bash 输出会在**下一次 prompt** 时包含进 LLM 上下文，而不是立即包含
2. 在一次 prompt 之前可以执行多个 bash commands；所有输出都会被包含进去
3. `BashExecutionMessage` 自身不会发出 event

#### abort_bash

中止正在运行的 bash command。

```json
{"type": "abort_bash"}
```

响应：
```json
{"type": "response", "command": "abort_bash", "success": true}
```

### Session

#### get_session_stats

获取 token 使用量、cost 统计以及当前上下文窗口使用情况。

```json
{"type": "get_session_stats"}
```

响应：
```json
{
  "type": "response",
  "command": "get_session_stats",
  "success": true,
  "data": {
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "userMessages": 5,
    "assistantMessages": 5,
    "toolCalls": 12,
    "toolResults": 12,
    "totalMessages": 22,
    "tokens": {
      "input": 50000,
      "output": 10000,
      "cacheRead": 40000,
      "cacheWrite": 5000,
      "total": 105000
    },
    "cost": 0.45,
    "contextUsage": {
      "tokens": 60000,
      "contextWindow": 200000,
      "percent": 30
    }
  }
}
```

`tokens` 包含当前 session 状态下的 assistant usage 总计。`contextUsage` 包含用于 compaction 和 footer 显示的实际当前 context-window 估算值。

当没有可用的 model 或 context window 时，会省略 `contextUsage`。在 compaction 刚完成后、下一条新的 post-compaction assistant response 提供有效 usage 数据之前，`contextUsage.tokens` 和 `contextUsage.percent` 会是 `null`。

#### export_html

将 session 导出为 HTML 文件。

```json
{"type": "export_html"}
```

带自定义路径：
```json
{"type": "export_html", "outputPath": "/tmp/session.html"}
```

响应：
```json
{
  "type": "response",
  "command": "export_html",
  "success": true,
  "data": {"path": "/tmp/session.html"}
}
```

#### switch_session

加载另一个 session 文件。可以被 `session_before_switch` extension event handler 取消。

```json
{"type": "switch_session", "sessionPath": "/path/to/session.jsonl"}
```

响应：
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": false}}
```

如果扩展取消了切换：
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": true}}
```

#### fork

基于当前活跃分支上的某条先前用户消息创建一个新的 fork。可以被 `session_before_fork` extension event handler 取消。返回被 fork 起点消息的文本。

```json
{"type": "fork", "entryId": "abc123"}
```

响应：
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": false}
}
```

如果扩展取消了 fork：
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": true}
}
```

#### clone

将当前活跃分支在当前位置复制到一个新的 session 中。可以被 `session_before_fork` extension event handler 取消。

```json
{"type": "clone"}
```

响应：
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": false}
}
```

如果扩展取消了 clone：
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": true}
}
```

#### get_fork_messages

获取可用于 fork 的用户消息。

```json
{"type": "get_fork_messages"}
```

响应：
```json
{
  "type": "response",
  "command": "get_fork_messages",
  "success": true,
  "data": {
    "messages": [
      {"entryId": "abc123", "text": "First prompt..."},
      {"entryId": "def456", "text": "Second prompt..."}
    ]
  }
}
```

#### get_last_assistant_text

获取最后一条 assistant message 的文本内容。

```json
{"type": "get_last_assistant_text"}
```

响应：
```json
{
  "type": "response",
  "command": "get_last_assistant_text",
  "success": true,
  "data": {"text": "The assistant's response..."}
}
```

如果不存在 assistant messages，则返回 `{"text": null}`。

#### set_session_name

为当前 session 设置一个显示名称。该名称会出现在 session 列表中，便于识别 session。

```json
{"type": "set_session_name", "name": "my-feature-work"}
```

响应：
```json
{
  "type": "response",
  "command": "set_session_name",
  "success": true
}
```

当前 session 名称可通过 `get_state` 的 `sessionName` 字段获得。要在启动 RPC 模式时设置初始名称，请向 `pi --mode rpc` 进程传入 `--name <name>` 或 `-n <name>`。

### 命令

#### get_commands

获取可用 commands（extension commands、prompt templates 和 skills）。这些 commands 可以通过 `prompt` command 并在前面加上 `/` 来调用。

```json
{"type": "get_commands"}
```

响应：
```json
{
  "type": "response",
  "command": "get_commands",
  "success": true,
  "data": {
    "commands": [
      {"name": "session-name", "description": "Set or clear session name", "source": "extension", "path": "/home/user/.pi/agent/extensions/session.ts"},
      {"name": "fix-tests", "description": "Fix failing tests", "source": "prompt", "location": "project", "path": "/home/user/myproject/.pi/agent/prompts/fix-tests.md"},
      {"name": "skill:brave-search", "description": "Web search via Brave API", "source": "skill", "location": "user", "path": "/home/user/.pi/agent/skills/brave-search/SKILL.md"}
    ]
  }
}
```

每个 command 都有：
- `name`：command 名称（使用 `/name` 调用）
- `description`：面向人类的描述（对于 extension commands 可选）
- `source`：command 的类型：
  - `"extension"`：通过 extension 中的 `pi.registerCommand()` 注册
  - `"prompt"`：从 prompt template `.md` 文件加载
  - `"skill"`：从 skill 目录加载（名称会带上 `skill:` 前缀）
- `location`：它是从哪里加载的（可选，extensions 不会包含该字段）：
  - `"user"`：用户级（`~/.pi/agent/`）
  - `"project"`：项目级（`./.pi/agent/`）
  - `"path"`：通过 CLI 或 settings 显式指定的路径
- `path`：command 源的绝对文件路径（可选）

**注意**：内置的 TUI commands（`/settings`、`/hotkeys` 等）不包含在内。它们只在交互模式下处理，如果通过 `prompt` 发送，将不会执行。

## 事件

在 agent 运行期间，events 会以 JSON 行的形式流式输出到 stdout。Events **不**包含 `id` 字段（只有 responses 才有）。

### 事件类型

| Event | Description |
|-------|-------------|
| `agent_start` | Agent 开始处理 |
| `agent_end` | Agent 完成（包含本次运行生成的所有 messages） |
| `turn_start` | 新 turn 开始 |
| `turn_end` | Turn 完成（包含 assistant message 和 tool results） |
| `message_start` | Message 开始 |
| `message_update` | 流式更新（text/thinking/toolcall 增量） |
| `message_end` | Message 完成 |
| `tool_execution_start` | Tool 开始执行 |
| `tool_execution_update` | Tool 执行进度（流式输出） |
| `tool_execution_end` | Tool 完成 |
| `queue_update` | 待处理 steering/follow-up 队列发生变化 |
| `compaction_start` | Compaction 开始 |
| `compaction_end` | Compaction 完成 |
| `auto_retry_start` | Auto-retry 开始（在瞬时错误之后） |
| `auto_retry_end` | Auto-retry 完成（成功或最终失败） |
| `extension_error` | Extension 抛出错误 |

### agent_start

当 agent 开始处理一个 prompt 时发出。

```json
{"type": "agent_start"}
```

### agent_end

当 agent 完成时发出。包含本次运行期间生成的所有消息。

```json
{
  "type": "agent_end",
  "messages": [...]
}
```

### turn_start / turn_end

一个 turn 由一条 assistant response 以及由此产生的所有 tool calls 和 results 组成。

```json
{"type": "turn_start"}
```

```json
{
  "type": "turn_end",
  "message": {...},
  "toolResults": [...]
}
```

### message_start / message_end

当一条 message 开始和结束时发出。`message` 字段包含一个 `AgentMessage`。

```json
{"type": "message_start", "message": {...}}
{"type": "message_end", "message": {...}}
```

### message_update (Streaming)

在 assistant message 流式输出期间发出。同时包含部分 message 和一个流式 delta event。

```json
{
  "type": "message_update",
  "message": {...},
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "Hello ",
    "partial": {...}
  }
}
```

`assistantMessageEvent` 字段包含以下 delta 类型之一：

| Type | Description |
|------|-------------|
| `start` | Message 生成开始 |
| `text_start` | Text 内容块开始 |
| `text_delta` | Text 内容分块 |
| `text_end` | Text 内容块结束 |
| `thinking_start` | Thinking 块开始 |
| `thinking_delta` | Thinking 内容分块 |
| `thinking_end` | Thinking 块结束 |
| `toolcall_start` | Tool call 开始 |
| `toolcall_delta` | Tool call 参数分块 |
| `toolcall_end` | Tool call 结束（包含完整的 `toolCall` 对象） |
| `done` | Message 完成（原因：`"stop"`、`"length"`、`"toolUse"`） |
| `error` | 发生错误（原因：`"aborted"`、`"error"`） |

流式输出文本响应的示例：
```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_start","contentIndex":0,"partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":" world","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_end","contentIndex":0,"content":"Hello world","partial":{...}}}
```

### tool_execution_start / tool_execution_update / tool_execution_end

当一个 tool 开始、流式输出进度并完成执行时发出。

```json
{
  "type": "tool_execution_start",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"}
}
```

在执行期间，`tool_execution_update` events 会流式输出部分结果（例如 bash 输出到达时）：

```json
{
  "type": "tool_execution_update",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"},
  "partialResult": {
    "content": [{"type": "text", "text": "partial output so far..."}],
    "details": {"truncation": null, "fullOutputPath": null}
  }
}
```

完成时：

```json
{
  "type": "tool_execution_end",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "result": {
    "content": [{"type": "text", "text": "total 48\n..."}],
    "details": {...}
  },
  "isError": false
}
```

使用 `toolCallId` 关联这些 events。`tool_execution_update` 中的 `partialResult` 包含截至当前为止的累计输出（而不只是 delta），这样客户端只需在每次更新时替换自己的显示内容即可。

### queue_update

每当待处理的 steering 或 follow-up 队列发生变化时发出。

```json
{
  "type": "queue_update",
  "steering": ["Focus on error handling"],
  "followUp": ["After that, summarize the result"]
}
```

### compaction_start / compaction_end

当 compaction 运行时发出，无论是手动还是自动触发。

```json
{"type": "compaction_start", "reason": "threshold"}
```

`reason` 字段的值为 `"manual"`、`"threshold"` 或 `"overflow"`。

```json
{
  "type": "compaction_end",
  "reason": "threshold",
  "result": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  },
  "aborted": false,
  "willRetry": false
}
```

如果 `reason` 是 `"overflow"` 且 compaction 成功，`willRetry` 会是 `true`，agent 会自动重试该 prompt。

如果 compaction 被中止，`result` 为 `null`，`aborted` 为 `true`。

如果 compaction 失败（例如 API quota exceeded），`result` 为 `null`，`aborted` 为 `false`，并且 `errorMessage` 会包含错误描述。

### auto_retry_start / auto_retry_end

当在瞬时错误（overloaded、rate limit、5xx）之后触发自动重试时发出。

```json
{
  "type": "auto_retry_start",
  "attempt": 1,
  "maxAttempts": 3,
  "delayMs": 2000,
  "errorMessage": "529 {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}"
}
```

```json
{
  "type": "auto_retry_end",
  "success": true,
  "attempt": 2
}
```

在最终失败时（超过最大重试次数）：
```json
{
  "type": "auto_retry_end",
  "success": false,
  "attempt": 3,
  "finalError": "529 overloaded_error: Overloaded"
}
```

### extension_error

当某个 extension 抛出错误时发出。

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_call",
  "error": "Error message..."
}
```

## Extension UI 协议

Extensions 可以通过 `ctx.ui.select()`、`ctx.ui.confirm()` 等请求用户交互。在 RPC 模式中，这些会被转换为构建在基础 command/event 流之上的一套请求/响应子协议。

Extension UI methods 分为两类：

- **Dialog methods**（`select`、`confirm`、`input`、`editor`）：在 stdout 上发出一个 `extension_ui_request`，并阻塞，直到客户端在 stdin 上发送一个带有匹配 `id` 的 `extension_ui_response`。
- **Fire-and-forget methods**（`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`）：在 stdout 上发出一个 `extension_ui_request`，但不期望收到 response。客户端可以显示这些信息，也可以忽略。

如果某个 dialog method 包含 `timeout` 字段，agent 端会在超时后自动以默认值解析。客户端无需自行跟踪超时。

某些 `ExtensionUIContext` methods 在 RPC 模式中不受支持或能力受限，因为它们需要直接访问 TUI：
- `custom()` 返回 `undefined`
- `setWorkingMessage()`、`setWorkingIndicator()`、`setFooter()`、`setHeader()`、`setEditorComponent()`、`setToolsExpanded()` 都是 no-op
- `getEditorText()` 返回 `""`
- `getToolsExpanded()` 返回 `false`
- `pasteToEditor()` 会委托给 `setEditorText()`（不处理 paste/collapse）
- `getAllThemes()` 返回 `[]`
- `getTheme()` 返回 `undefined`
- `setTheme()` 返回 `{ success: false, error: "..." }`

注意：在 RPC 模式下 `ctx.hasUI` 为 `true`，因为 dialog 和 fire-and-forget methods 可以通过 extension UI 子协议正常工作。

### Extension UI 请求（stdout）

所有请求都带有 `type: "extension_ui_request"`、唯一的 `id` 以及 `method` 字段。

#### select

提示用户从列表中选择。带有 `timeout` 字段的 dialog methods 会包含以毫秒为单位的超时时间；如果客户端没有及时响应，agent 会自动以 `undefined` 解析。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-1",
  "method": "select",
  "title": "Allow dangerous command?",
  "options": ["Allow", "Block"],
  "timeout": 10000
}
```

期望的 response：带有 `value`（所选选项字符串）或 `cancelled: true` 的 `extension_ui_response`。

#### confirm

提示用户进行 yes/no 确认。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-2",
  "method": "confirm",
  "title": "Clear session?",
  "message": "All messages will be lost.",
  "timeout": 5000
}
```

期望的 response：带有 `confirmed: true/false` 或 `cancelled: true` 的 `extension_ui_response`。

#### input

提示用户输入自由格式文本。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-3",
  "method": "input",
  "title": "Enter a value",
  "placeholder": "type something..."
}
```

期望的 response：带有 `value`（输入文本）或 `cancelled: true` 的 `extension_ui_response`。

#### editor

打开一个多行文本编辑器，并可选择预填充内容。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-4",
  "method": "editor",
  "title": "Edit some text",
  "prefill": "Line 1\nLine 2\nLine 3"
}
```

期望的 response：带有 `value`（编辑后的文本）或 `cancelled: true` 的 `extension_ui_response`。

#### notify

显示一条通知。Fire-and-forget，不期望 response。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-5",
  "method": "notify",
  "message": "Command blocked by user",
  "notifyType": "warning"
}
```

`notifyType` 字段的值为 `"info"`、`"warning"` 或 `"error"`。如果省略，默认为 `"info"`。

#### setStatus

在 footer/status bar 中设置或清除一条状态项。Fire-and-forget。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-6",
  "method": "setStatus",
  "statusKey": "my-ext",
  "statusText": "Turn 3 running..."
}
```

发送 `statusText: undefined`（或省略该字段）即可清除该 key 对应的状态项。

#### setWidget

设置或清除显示在 editor 上方或下方的 widget（文本行块）。Fire-and-forget。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-7",
  "method": "setWidget",
  "widgetKey": "my-ext",
  "widgetLines": ["--- My Widget ---", "Line 1", "Line 2"],
  "widgetPlacement": "aboveEditor"
}
```

发送 `widgetLines: undefined`（或省略该字段）即可清除 widget。`widgetPlacement` 字段的值为 `"aboveEditor"`（默认）或 `"belowEditor"`。在 RPC 模式下仅支持字符串数组；component factories 会被忽略。

#### setTitle

设置终端窗口/标签页标题。Fire-and-forget。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-8",
  "method": "setTitle",
  "title": "pi - my project"
}
```

#### set_editor_text

设置输入 editor 中的文本。Fire-and-forget。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-9",
  "method": "set_editor_text",
  "text": "prefilled text for the user"
}
```

### Extension UI 响应（stdin）

Responses 仅用于 dialog methods（`select`、`confirm`、`input`、`editor`）。`id` 必须与 request 匹配。

#### 值响应（select、input、editor）

```json
{"type": "extension_ui_response", "id": "uuid-1", "value": "Allow"}
```

#### 确认响应（confirm）

```json
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}
```

#### 取消响应（任意 dialog）

关闭任意 dialog method。Extension 会收到 `undefined`（对于 select/input/editor）或 `false`（对于 confirm）。

```json
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

## 错误处理

失败的 commands 会返回带有 `success: false` 的 response：

```json
{
  "type": "response",
  "command": "set_model",
  "success": false,
  "error": "Model not found: invalid/model"
}
```

解析错误：

```json
{
  "type": "response",
  "command": "parse",
  "success": false,
  "error": "Failed to parse command: Unexpected token..."
}
```

## 类型

源文件：
- [`packages/ai/src/types.ts`](../../ai/src/types.ts) - `Model`, `UserMessage`, `AssistantMessage`, `ToolResultMessage`
- [`packages/agent/src/types.ts`](../../agent/src/types.ts) - `AgentMessage`, `AgentEvent`
- [`src/core/messages.ts`](../src/core/messages.ts) - `BashExecutionMessage`
- [`src/modes/rpc/rpc-types.ts`](../src/modes/rpc/rpc-types.ts) - RPC command/response types、extension UI request/response types

### 模型

```json
{
  "id": "claude-sonnet-4-20250514",
  "name": "Claude Sonnet 4",
  "api": "anthropic-messages",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "reasoning": true,
  "input": ["text", "image"],
  "contextWindow": 200000,
  "maxTokens": 16384,
  "cost": {
    "input": 3.0,
    "output": 15.0,
    "cacheRead": 0.3,
    "cacheWrite": 3.75
  }
}
```

### UserMessage

```json
{
  "role": "user",
  "content": "Hello!",
  "timestamp": 1733234567890,
  "attachments": []
}
```

`content` 字段可以是字符串，也可以是由 `TextContent`/`ImageContent` blocks 组成的数组。

### AssistantMessage

```json
{
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Hello! How can I help?"},
    {"type": "thinking", "thinking": "User is greeting me..."},
    {"type": "toolCall", "id": "call_123", "name": "bash", "arguments": {"command": "ls"}}
  ],
  "api": "anthropic-messages",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input": 100,
    "output": 50,
    "cacheRead": 0,
    "cacheWrite": 0,
    "cost": {"input": 0.0003, "output": 0.00075, "cacheRead": 0, "cacheWrite": 0, "total": 0.00105}
  },
  "stopReason": "stop",
  "timestamp": 1733234567890
}
```

Stop reasons：`"stop"`、`"length"`、`"toolUse"`、`"error"`、`"aborted"`

### ToolResultMessage

```json
{
  "role": "toolResult",
  "toolCallId": "call_123",
  "toolName": "bash",
  "content": [{"type": "text", "text": "total 48\ndrwxr-xr-x ..."}],
  "isError": false,
  "timestamp": 1733234567890
}
```

### BashExecutionMessage

由 `bash` RPC command 创建（不是由 LLM tool calls 创建）：

```json
{
  "role": "bashExecution",
  "command": "ls -la",
  "output": "total 48\ndrwxr-xr-x ...",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "fullOutputPath": null,
  "timestamp": 1733234567890
}
```

### 附件

```json
{
  "id": "img1",
  "type": "image",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 102400,
  "content": "base64-encoded-data...",
  "extractedText": null,
  "preview": null
}
```

## 示例：Basic Client（Python）

```python
import subprocess
import json

proc = subprocess.Popen(
    ["pi", "--mode", "rpc", "--no-session"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True
)

def send(cmd):
    proc.stdin.write(json.dumps(cmd) + "\n")
    proc.stdin.flush()

def read_events():
    for line in proc.stdout:
        yield json.loads(line)

# Send prompt
send({"type": "prompt", "message": "Hello!"})

# Process events
for event in read_events():
    if event.get("type") == "message_update":
        delta = event.get("assistantMessageEvent", {})
        if delta.get("type") == "text_delta":
            print(delta["delta"], end="", flush=True)
    
    if event.get("type") == "agent_end":
        print()
        break
```

## 示例：Interactive Client（Node.js）

完整的交互示例请参见 [`test/rpc-example.ts`](../test/rpc-example.ts)，或者参见 [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts) 了解带类型的客户端实现。

关于处理 extension UI protocol 的完整示例，请参见 [`examples/rpc-extension-ui.ts`](../examples/rpc-extension-ui.ts)，它与 extension [`examples/extensions/rpc-demo.ts`](../examples/extensions/rpc-demo.ts) 配合使用。

```javascript
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

const agent = spawn("pi", ["--mode", "rpc", "--no-session"]);

function attachJsonlReader(stream, onLine) {
    const decoder = new StringDecoder("utf8");
    let buffer = "";

    stream.on("data", (chunk) => {
        buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);

        while (true) {
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex === -1) break;

            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            onLine(line);
        }
    });

    stream.on("end", () => {
        buffer += decoder.end();
        if (buffer.length > 0) {
            onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
        }
    });
}

attachJsonlReader(agent.stdout, (line) => {
    const event = JSON.parse(line);

    if (event.type === "message_update") {
        const { assistantMessageEvent } = event;
        if (assistantMessageEvent.type === "text_delta") {
            process.stdout.write(assistantMessageEvent.delta);
        }
    }
});

// Send prompt
agent.stdin.write(JSON.stringify({ type: "prompt", message: "Hello" }) + "\n");

// Abort on Ctrl+C
process.on("SIGINT", () => {
    agent.stdin.write(JSON.stringify({ type: "abort" }) + "\n");
});
```
