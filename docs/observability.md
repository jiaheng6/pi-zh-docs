# Pi 可观测性设计笔记

## 目标

使 `packages/ai` 和 `packages/agent`/harness 可观测，而不依赖 OpenTelemetry、Sentry 或任何 APM 供应商。

Pi 应该发出稳定的、结构化的生命周期事件。外部监听器可以将这些事件转换为 OTel span、Sentry span、日志、指标或自定义遥测。

## 心智模型

一个 trace 是一个因果工作树，例如一个用户回合。

一个 span 是该树中的一个计时操作。通常用 ID 表示，而非对象指针：

```ts
interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
}
```

## 异步上下文

JavaScript 有一个事件循环，但多个异步链可以交错。单一全局 `currentContext` 在并发下会失效。

`AsyncLocalStorage` 是异步延续的 Node 等价物。它让并发操作保持不同的当前上下文。

Pi 必须在 Node、Bun、浏览器、workers 和其他 JS 运行时中运行，所以 ALS 不能作为核心抽象。它应该是运行时适配器。

## 核心设计

Pi 拥有一个小型的运行时无关的可观测性抽象：

```ts
export interface PiObservabilityContext {
  traceId?: string;
  currentSpanId?: string;
  userContext?: Record<string, unknown>;
}

export interface PiObservabilityEvent {
  type: "start" | "end" | "error" | "event";
  name: string;
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  timestamp: number;
  durationMs?: number;
  context?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  error?: { name: string; message: string };
}

export interface PiObservability {
  getContext(): PiObservabilityContext | undefined;
  runWithContext<T>(context: PiObservabilityContext, fn: () => T): T;
  emit(event: PiObservabilityEvent): void;
  hasSubscribers(): boolean;
}
```

公共 API：

```ts
export function configurePiObservability(observability: PiObservability): void;
export function subscribePiObservability(listener: (event: PiObservabilityEvent) => void): () => void;
export function runWithPiContext<T>(userContext: Record<string, unknown>, fn: () => T): T;
export function traceOperation<T>(name: string, payload: Record<string, unknown>, fn: () => T): T;
```

## Pi 发出什么

Pi 发出发生了什么。它不直接创建 OTel/Sentry span。

初始最小事件名称：

```text
pi.agent.prompt
pi.agent.skill
pi.agent.prompt_template
pi.agent.compaction
pi.agent.branch_navigation
pi.agent.session.append_entry
pi.ai.provider.request
```

## 安全和脱敏

默认负载必须安全。

默认安全：供应商、模型、API 标识符、会话 ID、条目类型、工具名称、状态码、停止原因、令牌计数、成本、持续时间。

默认不安全：提示、完成内容、工具参数、工具结果、shell 输出、文件内容、API 密钥、请求头。

内容捕获可以后续通过显式脱敏 hooks 选择启用。

## 监听器行为

可观测性绝不能影响 pi 执行。

订阅者错误应被吞没或隔离。Harness hooks 是控制面，可能影响执行；可观测性订阅者是被动的，不得影响执行。

## 包结构

最小初始包：

```text
packages/observability
  运行时无关的上下文 + traceOperation + subscribe
```

可选后续：

```text
packages/observability-node
  AsyncLocalStorage + diagnostics_channel 桥接

packages/otel
  订阅 pi 事件并创建 OpenTelemetry span
```

## 论点

Pi 定义了稳定、安全的事件契约。适配器定义事件去向。

这使 ai/harness 可观测，而不将核心包绑定到 OTel、Sentry、Node 专有 API 或猴子补丁。
