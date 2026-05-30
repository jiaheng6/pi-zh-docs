# 压缩与分支摘要

LLM 的上下文窗口有限。当对话变得过长时，Pi 使用压缩来摘要旧内容，同时保留近期工作。本页涵盖自动压缩和分支摘要两个方面。

**源文件**（[pi-mono](https://github.com/earendil-works/pi-mono)）：
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - 自动压缩逻辑
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - 分支摘要
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - 共享工具（文件追踪、序列化）
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 条目类型（`CompactionEntry`、`BranchSummaryEntry`）
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - 扩展事件类型

有关项目中的 TypeScript 定义，请检查 `node_modules/@earendil-works/pi-coding-agent/dist/`。

## 概述

Pi 有两种摘要机制：

| 机制 | 触发条件 | 目的 |
|-----------|---------|---------|
| 压缩 | 上下文超过阈值，或 `/compact` | 摘要旧消息以释放上下文 |
| 分支摘要 | `/tree` 导航 | 切换分支时保留上下文 |

两者使用相同的结构化摘要格式并累积跟踪文件操作。

## 压缩

### 触发时机

自动压缩在以下情况触发：

```
contextTokens > contextWindow - reserveTokens
```

默认 `reserveTokens` 为 16384 token（可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）。这为 LLM 的响应留出空间。

你也可以通过 `/compact [instructions]` 手动触发，其中可选的指令用于聚焦摘要。

### 工作原理

1. **找到切割点**：从最新消息向后遍历，累积 token 估计直到达到 `keepRecentTokens`（默认 20k，可配置）
2. **提取消息**：从上一个保留边界（或会话开始）到切割点收集消息
3. **生成摘要**：调用 LLM 以结构化格式进行摘要，存在先前摘要时将其作为迭代上下文传递
4. **追加条目**：保存带有摘要和 `firstKeptEntryId` 的 `CompactionEntry`
5. **重新加载**：会话重新加载，使用摘要 + 从 `firstKeptEntryId` 开始的消息

```
压缩前：

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               messagesToSummarize            保留的消息
                                   ↑
                          firstKeptEntryId (entry 4)

压缩后（追加新条目）：

  entry:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 不发送给 LLM                       发送给 LLM
                                                         ↑
                                              从 firstKeptEntryId 开始

LLM 看到的内容：

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    prompt    来自 cmp       从 firstKeptEntryId 开始的消息
```

在重复压缩时，被摘要的范围从上一次压缩的保留边界（`firstKeptEntryId`）开始，而非压缩条目本身，如果该保留条目在路径中找不到则回退到上一次压缩之后的条目。这通过将上次压缩中幸存的消息也包含在下一次摘要传递中来保留它们。Pi 还会在写入新 `CompactionEntry` 之前从重建的会话上下文重新计算 `tokensBefore`，因此 token 计数反映的是被替换的实际压缩前上下文。

### 分割轮次

一个"轮次"从用户消息开始，包含所有助手响应和工具调用直到下一个用户消息。通常，压缩在轮次边界切割。

当单个轮次超过 `keepRecentTokens` 时，切割点落在轮次内部的助手消息处。这是一个"分割轮次"：

```
分割轮次（一个巨大轮次超过预算）：

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)

  isSplitTurn = true
  messagesToSummarize = []  (之前没有完整轮次)
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

对于分割轮次，Pi 生成两个摘要并合并：
1. **历史摘要**：之前的上下文（如果有）
2. **轮次前缀摘要**：分割轮次的早期部分

### 切割点规则

有效的切割点是：
- 用户消息
- 助手消息
- BashExecution 消息
- 自定义消息（custom_message、branch_summary）

永远不在工具结果处切割（它们必须与工具调用保持在一起）。

### CompactionEntry 结构

定义在 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定数据
}

// 默认压缩使用此结构作为 details（来自 compaction.ts）：
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中存储任何 JSON 可序列化数据。默认压缩跟踪文件操作，但自定义扩展实现可以使用自己的结构。

## 分支摘要

### 触发时机

当你使用 `/tree` 导航到不同分支时，Pi 会提供摘要你正在离开的工作。这将离开分支的上下文注入到新分支中。

### 工作原理

1. **找到共同祖先**：旧位置和新位置共享的最深节点
2. **收集条目**：从旧叶子节点回溯到共同祖先
3. **按预算准备**：在 token 预算内包含消息（最新优先）
4. **生成摘要**：使用结构化格式调用 LLM
5. **追加条目**：在导航点保存 `BranchSummaryEntry`

```
导航前的树：

         ┌─ B ─ C ─ D（旧叶子，被放弃）
    A ───┤
         └─ E ─ F（目标）

共同祖先：A
要摘要的条目：B、C、D

带摘要导航后：

         ┌─ B ─ C ─ D ─ [B,C,D 的摘要]
    A ───┤
         └─ E ─ F（新叶子）
```

### 累积文件跟踪

压缩和分支摘要都累积跟踪文件。生成摘要时，Pi 从以下位置提取文件操作：
- 被摘要消息中的工具调用
- 先前的压缩或分支摘要 `details`（如果有）

这意味着文件跟踪跨多次压缩或嵌套分支摘要累积，保留读取和修改文件的完整历史。

### BranchSummaryEntry 结构

定义在 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // 我们导航来源的条目
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定数据
}

// 默认分支摘要使用此结构作为 details（来自 branch-summarization.ts）：
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

与压缩相同，扩展可以在 `details` 中存储自定义数据。

## 摘要格式

压缩和分支摘要使用相同的结构化格式：

```markdown
## Goal
[用户试图完成什么]

## Constraints & Preferences
- [用户提到的要求]

## Progress
### Done
- [x] [已完成的任务]

### In Progress
- [ ] [当前工作]

### Blocked
- [问题，如果有]

## Key Decisions
- **[决策]**：[理由]

## Next Steps
1. [接下来应该发生什么]

## Critical Context
- [继续所需的数据]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化

摘要前，消息通过 [`serializeConversation()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) 序列化为文本：

```
[User]: 他们说了什么
[Assistant thinking]: 内部推理
[Assistant]: 响应文本
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: 工具输出
```

这防止模型将其视为要继续的对话。

工具结果在序列化时被截断为 2000 个字符。超出该限制的内容被替换为表示截断了多少字符的标记。这使摘要请求保持在合理的 token 预算内，因为工具结果（特别是来自 `read` 和 `bash` 的）通常是上下文大小的最大贡献者。

## 通过扩展自定义摘要

扩展可以拦截和自定义压缩和分支摘要。事件类型定义请参见 [`extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)。

### session_before_compact

在自动压缩或 `/compact` 之前触发。可以取消或提供自定义摘要。请参见类型文件中的 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // preparation.messagesToSummarize - 要摘要的消息
  // preparation.turnPrefixMessages - 分割轮次前缀（如果 isSplitTurn）
  // preparation.previousSummary - 先前的压缩摘要
  // preparation.fileOps - 提取的文件操作
  // preparation.tokensBefore - 压缩前的上下文 token 数
  // preparation.firstKeptEntryId - 保留消息的起始位置
  // preparation.settings - 压缩设置

  // branchEntries - 当前分支上的所有条目（用于自定义状态）
  // signal - AbortSignal（传递给 LLM 调用）

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "Your summary...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { /* 自定义数据 */ },
    }
  };
});
```

#### 将消息转换为文本

要使用你自己的模型生成摘要，使用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // 将 AgentMessage[] 转换为 Message[]，然后序列化为文本
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );

  // 现在发送到你的模型进行摘要
  const summary = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});
```

完整示例请参见 [custom-compaction.ts](../examples/extensions/custom-compaction.ts)。

### session_before_tree

在 `/tree` 导航之前触发。无论用户是否选择摘要都会触发。可以取消导航或提供自定义摘要。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - 我们要导航到的位置
  // preparation.oldLeafId - 当前位置（被放弃）
  // preparation.commonAncestorId - 共享祖先
  // preparation.entriesToSummarize - 将被摘要的条目
  // preparation.userWantsSummary - 用户是否选择摘要

  // 完全取消导航：
  return { cancel: true };

  // 提供自定义摘要（仅在 userWantsSummary 为 true 时使用）：
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "Your summary...",
        details: { /* 自定义数据 */ },
      }
    };
  }
});
```

请参见类型文件中的 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置

在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置 | 默认值 | 描述 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动压缩 |
| `reserveTokens` | `16384` | 为 LLM 响应保留的 token 数 |
| `keepRecentTokens` | `20000` | 保留的最近 token 数（不摘要） |

使用 `"enabled": false` 禁用自动压缩。你仍可以通过 `/compact` 手动压缩。
