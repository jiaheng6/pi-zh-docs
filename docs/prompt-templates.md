> Pi 可以创建提示模板。让它为你的工作流构建一个。

# 提示模板

提示模板是展开为完整提示的 Markdown 片段。在编辑器中输入 `/name` 来调用模板，其中 `name` 是不带 `.md` 的文件名。

## 位置

Pi 从以下位置加载提示模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`
- 包：`package.json` 中的 `prompts/` 目录或 `pi.prompts` 条目
- 设置：`prompts` 数组，包含文件或目录
- CLI：`--prompt-template <path>`（可重复）

使用 `--no-prompt-templates` 禁用发现。

## 格式

```markdown
---
description: 审查暂存的 git 更改
---
审查暂存的更改（`git diff --cached`）。关注：
- Bug 和逻辑错误
- 安全问题
- 错误处理缺陷
```

- 文件名成为命令名。`review.md` 变为 `/review`。
- `description` 是可选的。如果缺失，使用第一个非空行。
- `argument-hint` 是可选的。设置后，提示会在自动完成下拉菜单中的描述之前显示。

### 参数提示

在 frontmatter 中使用 `argument-hint` 在自动完成中显示预期参数。使用 `<尖括号>` 表示必需参数，`[方括号]` 表示可选参数：

```markdown
---
description: 通过 URL 审查 PR，包含结构化的问题和代码分析
argument-hint: "<PR-URL>"
---
```

这在自动完成下拉菜单中显示为：

```
→ pr   <PR-URL>       — 通过 URL 审查 PR，包含结构化的问题和代码分析
  is   <issue>        — 分析 GitHub issues（bug 或功能请求）
  wr   [instructions] — 端到端完成当前任务
  cl   — 在发布前审计 changelog 条目
```

## 用法

在编辑器中输入 `/` 后跟模板名称。自动完成会显示可用模板及其描述。

```
/review                           # 展开 review.md
/component Button                 # 带参数展开
/component Button "click handler" # 多个参数
```

## 参数

模板支持位置参数和简单切片：

- `$1`、`$2`、... 位置参数
- `$@` 或 `$ARGUMENTS` 表示所有参数连接
- `${@:N}` 表示从第 N 个位置开始的参数（从 1 开始）
- `${@:N:L}` 表示从 N 开始的 `L` 个参数

示例：

```markdown
---
description: 创建组件
---
创建一个名为 $1 的 React 组件，包含以下功能：$@
```

用法：`/component Button "onClick handler" "disabled support"`

## 加载规则

- `prompts/` 中的模板发现是非递归的。
- 如果你想使用子目录中的模板，请通过 `prompts` 设置或包清单显式添加它们。
