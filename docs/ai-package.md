# @earendil-works/pi-ai

统一的 LLM API，支持自动模型发现、供应商配置、令牌和成本跟踪，以及简单的上下文持久化和会话中模型切换。

**注意**：此库仅包含支持工具调用（函数调用）的模型，因为这对代理工作流至关重要。

## 目录

- [支持的供应商](#支持的供应商)
- [安装](#安装)
- [快速开始](#快速开始)
- [工具](#工具)
- [图像输入](#图像输入)
- [图像生成](#图像生成)
- [思考/推理](#思考推理)
- [停止原因](#停止原因)
- [错误处理](#错误处理)
- [API、模型和供应商](#api模型和供应商)
- [跨供应商切换](#跨供应商切换)
- [上下文序列化](#上下文序列化)
- [浏览器使用](#浏览器使用)
- [OAuth 供应商](#oauth-供应商)
- [许可证](#许可证)

## 支持的供应商

- **OpenAI**
- **Azure OpenAI (Responses)**
- **OpenAI Codex**（ChatGPT Plus/Pro 订阅，需要 OAuth）
- **DeepSeek**
- **Anthropic**
- **Google**
- **Vertex AI**（通过 Vertex AI 使用 Gemini）
- **Mistral**
- **Groq**
- **Cerebras**
- **Cloudflare AI Gateway**
- **Cloudflare Workers AI**
- **xAI**
- **OpenRouter**
- **Vercel AI Gateway**
- **MiniMax**
- **Together AI**
- **GitHub Copilot**（需要 OAuth）
- **Amazon Bedrock**
- **OpenCode Zen**
- **OpenCode Go**
- **Fireworks**（使用 Anthropic 兼容 API）
- **Kimi For Coding**（Moonshot AI，使用 Anthropic 兼容 API）
- **Xiaomi MiMo**（使用 Anthropic 兼容 API）
- **任何 OpenAI 兼容 API**：Ollama、vLLM、LM Studio 等

## 安装

```bash
npm install @earendil-works/pi-ai
```

TypeBox 导出从 `@earendil-works/pi-ai` 重新导出：`Type`、`Static` 和 `TSchema`。

## 快速开始

```typescript
import { Type, getModel, stream, complete, Context, Tool, StringEnum } from '@earendil-works/pi-ai';

// 完全类型化，支持供应商和模型的自动补全
const model = getModel('openai', 'gpt-4o-mini');

// 使用 TypeBox schema 定义工具，提供类型安全和验证
const tools: Tool[] = [{
  name: 'get_time',
  description: 'Get the current time',
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({ description: 'Optional timezone (e.g., America/New_York)' }))
  })
}];

// 构建对话上下文（易于序列化并在模型间传输）
const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'What time is it?' }],
  tools
};

// 选项 1：带所有事件类型的流式输出
const s = stream(model, context);

for await (const event of s) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'toolcall_end':
      console.log(`\nTool called: ${event.toolCall.name}`);
      break;
    case 'done':
      console.log(`\nFinished: ${event.reason}`);
      break;
    case 'error':
      console.error(`Error: ${event.error}`);
      break;
  }
}

// 流式输出后获取最终消息，添加到上下文
const finalMessage = await s.result();
context.messages.push(finalMessage);

// 选项 2：不使用流式获取完整响应
const response = await complete(model, context);
```

## 工具

工具使 LLM 能够与外部系统交互。此库使用 TypeBox schema 进行类型安全的工具定义，并使用 TypeBox 内置的验证器和值转换工具进行自动验证。

### 定义工具

```typescript
import { Type, Tool, StringEnum } from '@earendil-works/pi-ai';

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: Type.Object({
    location: Type.String({ description: 'City name or coordinates' }),
    units: StringEnum(['celsius', 'fahrenheit'], { default: 'celsius' })
  })
};
```

> 注意：为了 Google API 兼容性，使用 `StringEnum` 辅助函数而非 `Type.Enum`。

### 处理工具调用

工具结果使用内容块，可以包含文本和图像：

```typescript
const response = await complete(model, context);

for (const block of response.content) {
  if (block.type === 'toolCall') {
    const result = await executeWeatherApi(block.arguments);
    context.messages.push({
      role: 'toolResult',
      toolCallId: block.id,
      toolName: block.name,
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
      timestamp: Date.now()
    });
  }
}
```

### 流式工具调用与部分 JSON

在流式传输期间，工具调用参数会随着到达而逐步解析。这使得在完整参数可用之前就能进行实时 UI 更新。

**关于部分工具参数的重要说明：**
- 在 `toolcall_delta` 事件期间，`arguments` 包含部分 JSON 的最佳解析结果
- 字段可能缺失或不完整——使用前始终检查是否存在
- 最低情况下，`arguments` 将是空对象 `{}`，永远不会是 `undefined`
- Google 供应商不支持函数调用流式传输

### 验证工具参数

使用 `agentLoop` 时，工具参数会在执行前自动根据 TypeBox schema 验证。如果验证失败，错误会作为工具结果返回给模型，允许它重试。

```typescript
import { stream, validateToolCall, Tool } from '@earendil-works/pi-ai';

const tools: Tool[] = [weatherTool, calculatorTool];
const s = stream(model, { messages, tools });

for await (const event of s) {
  if (event.type === 'toolcall_end') {
    try {
      const validatedArgs = validateToolCall(tools, event.toolCall);
      const result = await executeMyTool(event.toolCall.name, validatedArgs);
    } catch (error) {
      context.messages.push({
        role: 'toolResult',
        toolCallId: event.toolCall.id,
        toolName: event.toolCall.name,
        content: [{ type: 'text', text: error.message }],
        isError: true,
        timestamp: Date.now()
      });
    }
  }
}
```

### 完整事件参考

| 事件类型 | 描述 | 关键属性 |
|------------|-------------|----------------|
| `start` | 流开始 | `partial`：初始助手消息结构 |
| `text_start` | 文本块开始 | `contentIndex`：内容数组中的位置 |
| `text_delta` | 收到文本块 | `delta`：新文本 |
| `text_end` | 文本块完成 | `content`：完整文本 |
| `thinking_start` | 思考块开始 | `contentIndex`：位置 |
| `thinking_delta` | 收到思考块 | `delta`：新文本 |
| `thinking_end` | 思考块完成 | `content`：完整思考内容 |
| `toolcall_start` | 工具调用开始 | `contentIndex`：位置 |
| `toolcall_delta` | 工具参数流式传输 | `delta`：JSON 块 |
| `toolcall_end` | 工具调用完成 | `toolCall`：完整工具调用 |
| `done` | 流完成 | `reason`：停止原因，`message`：最终消息 |
| `error` | 发生错误 | `reason`：错误类型 |

不同内容块的流式事件不保证是连续的。消费者必须使用 `contentIndex` 将每个事件与其块关联。

## 图像输入

具有视觉能力的模型可以处理图像。你可以通过 `input` 属性检查模型是否支持图像。如果向非视觉模型传递图像，它们会被静默忽略。

```typescript
import { readFileSync } from 'fs';
import { getModel, complete } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');

const imageBuffer = readFileSync('image.png');
const base64Image = imageBuffer.toString('base64');

const response = await complete(model, {
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', data: base64Image, mimeType: 'image/png' }
    ]
  }]
});
```

## 图像生成

图像生成使用与文本/聊天生成不同的 API 接口。使用 `getImageModel()` / `getImageModels()` / `getImageProviders()` 发现图像生成模型，使用 `generateImages()` 获取最终结果。

不要将 `stream()` 或 `complete()` 用于图像生成。

```typescript
import { getImageModel, generateImages } from '@earendil-works/pi-ai';

const model = getImageModel('openrouter', 'google/gemini-2.5-flash-image');

const result = await generateImages(model, {
  input: [{ type: 'text', text: 'Generate a red circle on a plain white background.' }]
}, {
  apiKey: process.env.OPENROUTER_API_KEY
});
```

**注意事项：**
- 使用 `getImageModel(...)`，而非 `getModel(...)`
- 使用 `generateImages()`，而非 `stream()` / `complete()`
- 图像生成模型不参与工具调用
- 目前图像生成仅通过 OpenRouter 供应商可用

## 思考/推理

许多模型支持思考/推理功能，可以展示其内部思考过程。你可以通过 `reasoning` 属性检查模型是否支持推理。

### 统一接口 (streamSimple/completeSimple)

```typescript
import { getModel, streamSimple, completeSimple } from '@earendil-works/pi-ai';

const model = getModel('anthropic', 'claude-sonnet-4-20250514');

const response = await completeSimple(model, {
  messages: [{ role: 'user', content: 'Solve: 2x + 5 = 13' }]
}, {
  reasoning: 'medium'  // 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
});

for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Thinking:', block.thinking);
  } else if (block.type === 'text') {
    console.log('Response:', block.text);
  }
}
```

### 供应商特定选项 (stream/complete)

如需细粒度控制，使用供应商特定选项：

```typescript
// OpenAI 推理
await complete(openaiModel, context, { reasoningEffort: 'medium' });

// Anthropic 思考
await complete(anthropicModel, context, {
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192
});

// Google Gemini 思考
await complete(googleModel, context, {
  thinking: { enabled: true, budgetTokens: 8192 }
});
```

## 停止原因

每个 `AssistantMessage` 包含一个 `stopReason` 字段：

- `"stop"` - 正常完成
- `"length"` - 达到最大令牌限制
- `"toolUse"` - 模型正在调用工具
- `"error"` - 发生错误
- `"aborted"` - 通过中止信号取消

## 错误处理

当请求以错误结束时，流式 API 发出错误事件：

```typescript
for await (const event of stream) {
  if (event.type === 'error') {
    console.error(`Error (${event.reason}):`, event.error.errorMessage);
  }
}
```

### 中止请求

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

const s = stream(model, context, { signal: controller.signal });
```

### 中止后继续

中止的消息可以添加到上下文中继续对话：

```typescript
const partial = await complete(model, context, { signal: controller.signal });
context.messages.push(partial);
context.messages.push({ role: 'user', content: 'Please continue' });
const continuation = await complete(model, context);
```

## API、模型和供应商

此库使用 API 实现的注册表。内置 API 包括：

- **`anthropic-messages`**：Anthropic Messages API
- **`google-generative-ai`**：Google Generative AI API
- **`google-vertex`**：Google Vertex AI API
- **`mistral-conversations`**：Mistral Conversations API
- **`openai-completions`**：OpenAI Chat Completions API
- **`openai-responses`**：OpenAI Responses API
- **`openai-codex-responses`**：OpenAI Codex Responses API
- **`azure-openai-responses`**：Azure OpenAI Responses API
- **`bedrock-converse-stream`**：Amazon Bedrock Converse API

### 测试用 Faux 供应商

`registerFauxProvider()` 为测试和演示注册一个临时的内存供应商。

### 供应商和模型

一个**供应商**通过特定 API 提供模型：
- **Anthropic** 模型使用 `anthropic-messages` API
- **Google** 模型使用 `google-generative-ai` API
- **OpenAI** 模型使用 `openai-responses` API
- **xAI、Cerebras、Groq 等**使用 `openai-completions` API（OpenAI 兼容）

### 查询供应商和模型

```typescript
import { getProviders, getModels, getModel } from '@earendil-works/pi-ai';

const providers = getProviders();
const anthropicModels = getModels('anthropic');
const model = getModel('openai', 'gpt-4o-mini');
```

### 自定义模型

为本地推理服务器或自定义端点创建自定义模型：

```typescript
import { Model, stream } from '@earendil-works/pi-ai';

const ollamaModel: Model<'openai-completions'> = {
  id: 'llama-3.1-8b',
  name: 'Llama 3.1 8B (Ollama)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000
};
```

某些 OpenAI 兼容服务器不理解 `developer` 角色。设置 `compat.supportsDeveloperRole` 为 `false`，系统提示会作为 `system` 消息发送。

### OpenAI 兼容性设置

`openai-completions` API 被许多供应商实现，有细微差异。此库默认基于 `baseUrl` 自动检测兼容性设置。对于自定义代理或未知端点，可以通过 `compat` 字段覆盖：

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  supportsStrictMode?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  thinkingFormat?: 'openai' | 'openrouter' | 'deepseek' | 'together' | 'zai' | 'qwen';
  // ...更多选项
}
```

### 类型安全

模型按其 API 类型化，保持模型元数据准确。

## 跨供应商切换

此库支持在同一对话中无缝切换不同的 LLM 供应商，包括思考块、工具调用和工具结果。

当来自一个供应商的消息发送到另一个供应商时，库会自动转换：

- **用户和工具结果消息**原样传递
- **来自同一供应商的助手消息**保持原样
- **来自不同供应商的助手消息**的思考块转换为带 `<thinking>` 标签的文本

```typescript
// 从 Claude 开始
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
const claudeResponse = await complete(claude, context, { thinkingEnabled: true });
context.messages.push(claudeResponse);

// 切换到 GPT-5
const gpt5 = getModel('openai', 'gpt-5-mini');
const gptResponse = await complete(gpt5, context);
```

## 上下文序列化

`Context` 对象可以使用标准 JSON 方法轻松序列化和反序列化：

```typescript
const serialized = JSON.stringify(context);
const restored: Context = JSON.parse(serialized);
```

## 浏览器使用

此库支持浏览器环境。你必须显式传递 API 密钥：

```typescript
const response = await complete(model, {
  messages: [{ role: 'user', content: 'Hello!' }]
}, {
  apiKey: 'your-api-key'
});
```

> **安全警告**：在前端代码中暴露 API 密钥是危险的。仅在内部工具或演示中使用此方法。生产应用应使用后端代理。

### 浏览器兼容性说明

- Amazon Bedrock 在浏览器环境中不支持
- OAuth 登录流程在浏览器环境中不支持

### 环境变量（仅 Node.js）

| 供应商 | 环境变量 |
|----------|------------------------|
| OpenAI | `OPENAI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` |
| Anthropic | `ANTHROPIC_API_KEY` 或 `ANTHROPIC_OAUTH_TOKEN` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Vertex AI | `GOOGLE_CLOUD_API_KEY` 或 ADC |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Together AI | `TOGETHER_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` |
| Amazon Bedrock | AWS 凭据（区域 + 访问密钥或 SSO） |

## OAuth 供应商

多个供应商需要 OAuth 认证：

- **Anthropic**（Claude Pro/Max 订阅）
- **OpenAI Codex**（ChatGPT Plus/Pro 订阅）
- **GitHub Copilot**（Copilot 订阅）

### CLI 登录

```bash
npx @earendil-works/pi-ai login              # 交互式供应商选择
npx @earendil-works/pi-ai login anthropic    # 登录特定供应商
npx @earendil-works/pi-ai list               # 列出可用供应商
```

凭据保存到当前目录的 `auth.json` 中。

### 编程式 OAuth

此库通过 `@earendil-works/pi-ai/oauth` 入口点提供登录和令牌刷新功能：

```typescript
import {
  loginAnthropic,
  loginOpenAICodex,
  loginGitHubCopilot,
  refreshOAuthToken,
  getOAuthApiKey,
} from '@earendil-works/pi-ai/oauth';
```

### 使用 OAuth 令牌

使用 `getOAuthApiKey()` 获取 API 密钥，过期时自动刷新：

```typescript
const result = await getOAuthApiKey('github-copilot', auth);
if (!result) throw new Error('Not logged in');

const model = getModel('github-copilot', 'gpt-4o');
const response = await complete(model, context, { apiKey: result.apiKey });
```

### 供应商说明

**OpenAI Codex**：需要 ChatGPT Plus 或 Pro 订阅。提供对 GPT-5.x Codex 模型的访问。

**Azure OpenAI**：仅使用 Responses API。设置 `AZURE_OPENAI_API_KEY` 和 `AZURE_OPENAI_BASE_URL`。

**GitHub Copilot**：如果出现"The requested model is not supported"错误，请在 VS Code 中手动启用模型。

## 许可证

MIT
