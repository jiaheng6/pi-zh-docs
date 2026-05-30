# AgentHarness Hooks 设计

最终设计。

## 核心模型

事件将其结果类型作为类型专有的 phantom 携带：

```ts
declare const HookResult: unique symbol;

interface HookEvent<TType extends string, TResult = void> {
	type: TType;
	readonly [HookResult]?: TResult;
}

type ResultOf<E> = E extends { readonly [HookResult]?: infer R } ? R : void;

type HookHandler<E, Ctx> = (
	event: E,
	ctx: Ctx,
	signal?: AbortSignal,
) => ResultOf<E> | void | Promise<ResultOf<E> | void>;

type HookObserver<E, Ctx> = (
	event: E,
	ctx: Ctx,
	signal?: AbortSignal,
) => void | Promise<void>;
```

## Hooks 接口

```ts
interface AgentHarnessHooks<E extends HookEvent<string, unknown>, Ctx> {
	context: Ctx;
	setContext(ctx: Ctx): void;
	observe(handler: HookObserver<E, Ctx>): () => void;
	on<TType extends E["type"]>(
		type: TType,
		handler: HookHandler<Extract<E, { type: TType }>, Ctx>,
	): () => void;
	emit<TEvent extends E>(
		event: TEvent,
		signal?: AbortSignal,
	): Promise<ResultOf<TEvent> | undefined>;
	addCleanup(cleanup: () => void | Promise<void>): () => void;
	clear(): Promise<void>;
	dispose(): Promise<void>;
}
```

重要拆分：

- `observe()` 查看所有事件，只读，返回值被忽略
- `on(type, handler)` 参与该事件的语义
- `emit(event)` 是 `AgentHarness` 唯一调用的内容
- `clear()` 移除观察者/处理器并运行清理

## 变异语义

### 观察

观察者运行。返回值被忽略，除非该事件后来获得结果类型。

### 上下文转换

处理器按顺序运行。每个看到当前消息。

### 供应商请求/负载

顺序转换。每个处理器看到前一个输出。

### Agent 启动前

收集注入的消息，链接系统提示。

### 工具调用

顺序执行，阻止时提前退出。

### 工具结果

顺序补丁累积。每个处理器看到当前补丁后的结果。

### 会话前事件

顺序执行，取消时提前退出。

## Harness 使用

Harness 只做这个：

```ts
await this.hooks.emit(event, signal);
```

或：

```ts
const result = await this.hooks.emit({ type: "context", messages }, signal);
return result?.messages ?? messages;
```

Harness 不存储处理器、链接监听器或了解扩展策略。

## 上下文

上下文是普通对象，不是每次 emit 重建的。

```ts
const hooks = new CodingAgentHooks({
	harness: harnessFacade,
	session: sessionFacade,
	ui: noUiFacade,
});
```

对于动态状态，优先使用稳定的外观/方法而非 getter 迷宫。

## 扩展加载

扩展加载可以位于 harness 旁边并构造 hooks：

```ts
const hooks = await loadExtensions({
	paths,
	context,
	hooks: new CodingAgentHooks(context),
});
const harness = new AgentHarness({ ..., hooks });
```

重新加载：

```ts
await hooks.clear();
const nextHooks = await loadExtensions(...);
harness.setHooks(nextHooks);
```

## 注意事项

### 1. 错误策略必须明确

现有 coding-agent 捕获扩展错误、报告并继续。新 hooks 需要相同的策略。

### 2. 来源元数据很重要

现有运行器知道哪个扩展产生了错误/资源/工具。普通 `on()` 会丢失这些信息，除非添加注册元数据或作用域。

### 3. 某些扩展能力是注册表，不是 hooks

以下不被 `emit()` 覆盖，应保留为注册表：

- 工具
- 命令
- 快捷方式
- 标志
- 消息渲染器
- 供应商注册
- OAuth 供应商
- 自定义模型供应商

### 4. 现有事件可以被表示

无阻碍：`context`、`before_provider_request`、`tool_call`、`tool_result`、`message_end` 等。

### 5. 需要保留精确的旧语义

移植时必须复制特殊情况。

### 6. 观察者语义有意限制

观察者看到一次原始发出的事件。它们不看到每个中间变异。

## 结论

此设计可以实现新的 coding-agent。它比当前的运行器更简单，保持 harness 清洁，并保留重要的扩展能力。
