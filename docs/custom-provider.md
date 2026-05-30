# 自定义提供商

扩展可以通过 `pi.registerProvider()` 注册自定义模型提供商。这支持：

- **代理** - 通过企业代理或 API 网关路由请求
- **自定义端点** - 使用自托管或私有模型部署
- **OAuth/SSO** - 为企业提供商添加认证流程
- **自定义 API** - 为非标准 LLM API 实现流式传输

## 示例扩展

参见这些完整的提供商示例：

- [`examples/extensions/custom-provider-anthropic/`](../examples/extensions/custom-provider-anthropic/)
- [`examples/extensions/custom-provider-gitlab-duo/`](../examples/extensions/custom-provider-gitlab-duo/)

## 目录

- [示例扩展](#示例扩展)
- [快速参考](#快速参考)
- [覆盖现有提供商](#覆盖现有提供商)
- [注册新提供商](#注册新提供商)
- [注销提供商](#注销提供商)
- [OAuth 支持](#oauth-支持)
- [自定义流式 API](#自定义流式-api)
- [上下文溢出错误](#上下文溢出错误)
- [测试你的实现](#测试你的实现)
- [配置参考](#配置参考)
- [模型定义参考](#模型定义参考)

## 快速参考

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 覆盖现有提供商的 baseUrl
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // 注册带模型的新提供商
  pi.registerProvider("my-provider", {
    name: "My Provider",
    baseUrl: "https://api.example.com",
    apiKey: "$MY_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "my-model",
        name: "My Model",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }
    ]
  });
}
```

扩展工厂也可以是 `async` 的。对于动态模型发现，在工厂中获取并注册模型而不是在 `session_start` 中。Pi 在启动继续之前等待工厂完成，因此提供商在交互式启动和 `pi --list-models` 期间可用。

## 覆盖现有提供商

最简单的用例：通过代理重定向现有提供商。

```typescript
// 所有 Anthropic 请求现在通过你的代理
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// 为 OpenAI 请求添加自定义头
pi.registerProvider("openai", {
  headers: {
    "X-Custom-Header": "value"
  }
});

// baseUrl 和 headers 都有
pi.registerProvider("google", {
  baseUrl: "https://ai-gateway.corp.com/google",
  headers: {
    "X-Corp-Auth": "$CORP_AUTH_TOKEN"  // 环境变量或字面值
  }
});
```

当只提供 `baseUrl` 和/或 `headers`（没有 `models`）时，该提供商的所有现有模型都保留，使用新端点。

## 注册新提供商

要添加全新的提供商，指定 `models` 以及所需配置。

如果模型列表来自远程端点，使用异步扩展工厂：

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

这会在启动完成前注册获取的模型。

当提供 `models` 时，它**替换**该提供商的所有现有模型。

`apiKey` 和自定义头值使用与 `models.json` 相同的配置值语法：开头的 `!command` 为整个值执行命令，`$ENV_VAR` 和 `${ENV_VAR}` 插值环境变量，`$$` 输出字面 `$`，`$!` 输出字面 `!`。

## 注销提供商

使用 `pi.unregisterProvider(name)` 移除之前通过 `pi.registerProvider(name, ...)` 注册的提供商：

```typescript
// 注册
pi.registerProvider("my-llm", { /* ... */ });

// 之后移除
pi.unregisterProvider("my-llm");
```

注销会移除该提供商的动态模型、API 密钥回退、OAuth 提供商注册和自定义流处理器注册。任何被覆盖的内置模型或提供商行为都会恢复。

初始扩展加载阶段之后的调用会立即应用，不需要 `/reload`。

### API 类型

`api` 字段决定使用哪种流式实现：

| API | 用途 |
|-----|---------|
| `anthropic-messages` | Anthropic Claude API 及兼容 |
| `openai-completions` | OpenAI Chat Completions API 及兼容 |
| `openai-responses` | OpenAI Responses API |
| `azure-openai-responses` | Azure OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex Responses API |
| `mistral-conversations` | Mistral SDK Conversations/Chat 流式 |
| `google-generative-ai` | Google Generative AI API |
| `google-vertex` | Google Vertex AI API |
| `bedrock-converse-stream` | Amazon Bedrock Converse API |

大多数 OpenAI 兼容提供商使用 `openai-completions`。使用模型级 `thinkingLevelMap` 设置模型特定的思考级别，使用 `compat` 处理提供商特性：

```typescript
models: [{
  id: "custom-model",
  // ...
  reasoning: true,
  thinkingLevelMap: {              // 将 Pi 级别映射到提供商值；null 隐藏不支持的级别
    minimal: null,
    low: null,
    medium: null,
    high: "default",
    xhigh: "max"
  },
  compat: {
    supportsDeveloperRole: false,   // 使用 "system" 而非 "developer"
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",   // 而非 "max_completion_tokens"
    requiresToolResultName: true,   // 工具结果需要 name 字段
    thinkingFormat: "qwen",        // 顶级 enable_thinking: true
    cacheControlFormat: "anthropic" // Anthropic 风格 cache_control 标记
  }
}]
```

## OAuth 支持

添加与 `/login` 集成的 OAuth/SSO 认证：

```typescript
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";

pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com/v1",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const method = await callbacks.onSelect({
        message: "选择登录方式：",
        options: [
          { id: "browser", label: "浏览器 OAuth" },
          { id: "device", label: "设备代码" }
        ]
      });
      if (!method) throw new Error("Login cancelled");

      // 实现认证逻辑...
      const tokens = await exchangeCodeForTokens(code);

      return {
        refresh: tokens.refreshToken,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const tokens = await refreshAccessToken(credentials.refresh);
      return {
        refresh: tokens.refreshToken ?? credentials.refresh,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    }
  }
});
```

注册后，用户可以通过 `/login corporate-ai` 进行认证。

### OAuthLoginCallbacks

`callbacks` 对象提供三种认证方式：

```typescript
interface OAuthLoginCallbacks {
  // 在浏览器中打开 URL（用于 OAuth 重定向）
  onAuth(params: { url: string }): void;

  // 显示设备代码（用于设备授权流程）
  onDeviceCode(params: {
    userCode: string;
    verificationUri: string;
    intervalSeconds?: number;
    expiresInSeconds?: number;
  }): void;

  // 提示用户输入（用于手动 token 输入）
  onPrompt(params: { message: string }): Promise<string>;

  // 显示交互式选择器
  onSelect(params: {
    message: string;
    options: { id: string; label: string }[];
  }): Promise<string | undefined>;
}
```

## 自定义流式 API

对于具有非标准 API 的提供商，实现 `streamSimple`。在编写自己的实现之前请研究现有的提供商实现：

**参考实现：**
- [anthropic.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/anthropic.ts) - Anthropic Messages API
- [openai-completions.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/openai-completions.ts) - OpenAI Chat Completions
- [google.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/providers/google.ts) - Google Generative AI

### 流式模式

所有提供商遵循相同的模式：

```typescript
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  calculateCost,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

function streamMyProvider(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      stream.push({ type: "start", partial: output });
      // 进行 API 请求并处理响应...
      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
```

### 注册

注册你的流函数：

```typescript
pi.registerProvider("my-provider", {
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  api: "my-custom-api",
  models: [...],
  streamSimple: streamMyProvider
});
```

## 上下文溢出错误

当请求超过模型的上下文窗口时，Pi 可以通过压缩对话并重试来自动恢复。只有当 Pi 将失败识别为溢出时才会触发此恢复。

如果你的提供商返回 Pi 无法识别的溢出错误消息，请从注册提供商的同一扩展中规范化错误。使用 `message_end` 处理器重写助手消息，使其 `errorMessage` 以 Pi 识别的短语开头。通用回退 `context_length_exceeded` 是最安全的选择。

```typescript
const MY_PROVIDER_OVERFLOW_PATTERN = /your provider's overflow phrase/i;

export default function (pi: ExtensionAPI) {
  pi.registerProvider("my-provider", { /* ... */ });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== "my-provider" && ctx.model?.provider !== "my-provider") return;

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!MY_PROVIDER_OVERFLOW_PATTERN.test(errorMessage)) return;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });
}
```

## 测试你的实现

使用内置提供商使用的相同测试套件测试你的提供商。从 [packages/ai/test/](https://github.com/earendil-works/pi-mono/tree/main/packages/ai/test) 复制并调整这些测试文件：

| 测试 | 目的 |
|------|---------|
| `stream.test.ts` | 基本流式传输、文本输出 |
| `tokens.test.ts` | Token 计数和用量 |
| `abort.test.ts` | AbortSignal 处理 |
| `empty.test.ts` | 空/最小响应 |
| `context-overflow.test.ts` | 上下文窗口限制 |

## 配置参考

```typescript
interface ProviderConfig {
  /** UI 中提供商的显示名称（如 /login） */
  name?: string;
  /** API 端点 URL。定义模型时必需。 */
  baseUrl?: string;
  /** API 密钥字面值、环境变量插值或 !command。定义模型时必需（除非有 oauth）。 */
  apiKey?: string;
  /** 流式 API 类型。定义模型时在提供商或模型级别必需。 */
  api?: Api;
  /** 非标准 API 的自定义流式实现。 */
  streamSimple?: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
  /** 请求中包含的自定义头。值使用与 apiKey 相同的解析语法。 */
  headers?: Record<string, string>;
  /** 如果为 true，添加 Authorization: ****** */
  authHeader?: boolean;
  /** 要注册的模型。如果提供，替换该提供商的所有现有模型。 */
  models?: ProviderModelConfig[];
  /** /login 支持的 OAuth 提供商。 */
  oauth?: { /* ... */ };
}
```

## 模型定义参考

```typescript
interface ProviderModelConfig {
  /** 模型 ID（如 "claude-sonnet-4-20250514"） */
  id: string;
  /** 显示名称（如 "Claude 4 Sonnet"） */
  name: string;
  /** 此特定模型的 API 类型覆盖 */
  api?: Api;
  /** 此特定模型的 API 端点 URL 覆盖 */
  baseUrl?: string;
  /** 模型是否支持扩展思考 */
  reasoning: boolean;
  /** 将 Pi 思考级别映射到提供商/模型特定值；null 标记不支持的级别 */
  thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>>;
  /** 支持的输入类型 */
  input: ("text" | "image")[];
  /** 每百万 token 的费用（用于用量跟踪） */
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** 最大上下文窗口大小（token 数） */
  contextWindow: number;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 此特定模型的自定义头 */
  headers?: Record<string, string>;
  /** 所选 API 的兼容性设置 */
  compat?: { /* ... */ };
}
```
