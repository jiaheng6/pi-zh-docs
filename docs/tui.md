> pi 可以创建 TUI 组件。可以让它针对你的使用场景构建一个。

# TUI 组件

扩展和自定义工具可以渲染自定义 TUI 组件，以构建交互式用户界面。本页介绍组件系统和可用的构建块。

**来源：** [`@earendil-works/pi-tui`](https://github.com/earendil-works/pi-mono/tree/main/packages/tui)

## 组件接口

所有组件都实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

| 方法 | 说明 |
|--------|-------------|
| `render(width)` | 返回字符串数组（每行一个字符串）。每一行**都不能超过 `width`**。 |
| `handleInput?(data)` | 当组件拥有焦点时接收键盘输入。 |
| `wantsKeyRelease?` | 如果为 true，组件会接收按键释放事件（Kitty protocol）。默认值：false。 |
| `invalidate()` | 清除缓存的渲染状态。在主题变化时调用。 |

TUI 会在每一条渲染行的末尾附加完整的 SGR reset 和 OSC 8 reset。样式不会跨行保留。如果你输出带样式的多行文本，请为每一行重新应用样式，或使用 `wrapTextWithAnsi()`，以便为每条换行后的文本保留样式。

## Focusable 接口（IME 支持）

显示文本光标并需要 IME（Input Method Editor，输入法编辑器）支持的组件，应实现 `Focusable` 接口：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // 当焦点变化时由 TUI 设置
  
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // 在假光标正前方输出 marker
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

当 `Focusable` 组件拥有焦点时，TUI 会：
1. 在组件上将 `focused = true`
2. 扫描渲染输出中的 `CURSOR_MARKER`（一个零宽度 APC escape sequence）
3. 将硬件终端光标定位到该位置
4. 仅在启用 `showHardwareCursor` 时显示硬件光标

默认情况下光标会保持隐藏。这样既能保留假光标的渲染效果，又能为那些即使在隐藏光标时也会依据硬件光标追踪 IME 候选窗口位置的终端正确设置位置。有些终端要求硬件光标可见，IME 定位才能正常工作；可以通过 `showHardwareCursor`、`setShowHardwareCursor(true)` 或 `PI_HARDWARE_CURSOR=1` 来启用。内置的 `Editor` 和 `Input` 组件已经实现了这个接口。

### 带嵌入式输入框的容器组件

当容器组件（dialog、selector 等）包含 `Input` 或 `Editor` 子组件时，容器必须实现 `Focusable`，并将焦点状态向子组件传递。否则，硬件光标将无法为 IME 输入正确定位。

```typescript
import { Container, type Focusable, Input } from "@earendil-works/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // Focusable 实现 - 将状态传递给子输入框，用于 IME 光标定位
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor() {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }
}
```

如果没有这层传递，在使用 IME（中文、日文、韩文等）输入时，候选窗口会显示在屏幕上的错误位置。

## 使用组件

**在扩展中**，通过 `ctx.ui.custom()`：

```typescript
pi.on("session_start", async (_event, ctx) => {
  const handle = ctx.ui.custom(myComponent);
  // handle.requestRender() - 触发重新渲染
  // handle.close() - 恢复正常 UI
});
```

**在自定义工具中**，通过 `pi.ui.custom()`：

```typescript
async execute(toolCallId, params, onUpdate, ctx, signal) {
  const handle = pi.ui.custom(myComponent);
  // ...
  handle.close();
}
```

## 覆盖层

覆盖层会将组件渲染在现有内容之上，而不会清屏。向 `ctx.ui.custom()` 传入 `{ overlay: true }`：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyDialog({ onClose: done }),
  { overlay: true }
);
```

对于定位和尺寸，请使用 `overlayOptions`：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new SidePanel({ onClose: done }),
  {
    overlay: true,
    overlayOptions: {
      // 尺寸：数字或百分比字符串
      width: "50%",          // 终端宽度的 50%
      minWidth: 40,          // 最小 40 列
      maxHeight: "80%",      // 最大为终端高度的 80%

      // 位置：基于锚点（默认："center"）
      anchor: "right-center", // 9 个位置：center、top-left、top-center 等
      offsetX: -2,            // 相对锚点的偏移
      offsetY: 0,

      // 或使用百分比 / 绝对定位
      row: "25%",            // 距离顶部 25%
      col: 10,               // 第 10 列

      // 边距
      margin: 2,             // 四边统一，或使用 { top, right, bottom, left }

      // 响应式：在窄终端中隐藏
      visible: (termWidth, termHeight) => termWidth >= 80,
    },
    // 获取 handle 以便通过编程控制可见性
    onHandle: (handle) => {
      // handle.setHidden(true/false) - 切换可见性
      // handle.hide() - 永久移除
    },
  }
);
```

### 覆盖层生命周期

覆盖层组件在关闭后会被释放。不要复用旧引用——请创建新的实例：

```typescript
// 错误 - 过期引用
let menu: MenuComponent;
await ctx.ui.custom((_, __, ___, done) => {
  menu = new MenuComponent(done);
  return menu;
}, { overlay: true });
setActiveComponent(menu);  // 已被释放

// 正确 - 重新调用以再次显示
const showMenu = () => ctx.ui.custom((_, __, ___, done) => 
  new MenuComponent(done), { overlay: true });

await showMenu();  // 第一次显示
await showMenu();  // “Back” = 只需再次调用
```

参见 [overlay-qa-tests.ts](../examples/extensions/overlay-qa-tests.ts)，其中包含关于锚点、边距、堆叠、响应式可见性和动画的完整示例。

## 内置组件

从 `@earendil-works/pi-tui` 导入：

```typescript
import { Text, Box, Container, Spacer, Markdown } from "@earendil-works/pi-tui";
```

### Text

支持自动换行的多行文本。

```typescript
const text = new Text(
  "Hello World",    // 内容
  1,                // paddingX（默认：1）
  1,                // paddingY（默认：1）
  (s) => bgGray(s)  // 可选的背景函数
);
text.setText("Updated");
```

### Box

带有 padding 和背景色的容器。

```typescript
const box = new Box(
  1,                // paddingX
  1,                // paddingY
  (s) => bgGray(s)  // 背景函数
);
box.addChild(new Text("Content", 0, 0));
box.setBgFn((s) => bgBlue(s));
```

### Container

垂直组织子组件的容器。

```typescript
const container = new Container();
container.addChild(component1);
container.addChild(component2);
container.removeChild(component1);
```

### Spacer

空白垂直间距。

```typescript
const spacer = new Spacer(2);  // 2 行空白
```

### Markdown

渲染带语法高亮的 markdown。

```typescript
const md = new Markdown(
  "# Title\n\nSome **bold** text",
  1,        // paddingX
  1,        // paddingY
  theme     // MarkdownTheme（见下文）
);
md.setText("Updated markdown");
```

### Image

在受支持的终端中渲染图片（Kitty、iTerm2、Ghostty、WezTerm）。

```typescript
const image = new Image(
  base64Data,   // base64 编码的图片
  "image/png",  // MIME type
  theme,        // ImageTheme
  { maxWidthCells: 80, maxHeightCells: 24 }
);
```

## 键盘输入

使用 `matchesKey()` 进行按键检测：

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) {
    this.selectedIndex--;
  } else if (matchesKey(data, Key.enter)) {
    this.onSelect?.(this.selectedIndex);
  } else if (matchesKey(data, Key.escape)) {
    this.onCancel?.();
  } else if (matchesKey(data, Key.ctrl("c"))) {
    // Ctrl+C
  }
}
```

**按键标识符**（可使用 `Key.*` 获得自动补全，也可以使用字符串字面量）：
- 基础按键：`Key.enter`、`Key.escape`、`Key.tab`、`Key.space`、`Key.backspace`、`Key.delete`、`Key.home`、`Key.end`
- 方向键：`Key.up`、`Key.down`、`Key.left`、`Key.right`
- 带修饰键：`Key.ctrl("c")`、`Key.shift("tab")`、`Key.alt("left")`、`Key.ctrlShift("p")`
- 也支持字符串格式：`"enter"`、`"ctrl+c"`、`"shift+tab"`、`"ctrl+shift+p"`

## 行宽

**关键：** `render()` 返回的每一行都不能超过 `width` 参数。

```typescript
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

render(width: number): string[] {
  // 截断过长的行
  return [truncateToWidth(this.text, width)];
}
```

工具函数：
- `visibleWidth(str)` - 获取显示宽度（忽略 ANSI codes）
- `truncateToWidth(str, width, ellipsis?)` - 截断到指定宽度，可选 ellipsis
- `wrapTextWithAnsi(str, width)` - 保留 ANSI codes 的自动换行

## 创建自定义组件

示例：交互式选择器

```typescript
import {
  matchesKey, Key,
  truncateToWidth, visibleWidth
} from "@earendil-works/pi-tui";

class MySelector {
  private items: string[];
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  
  public onSelect?: (item: string) => void;
  public onCancel?: () => void;

  constructor(items: string[]) {
    this.items = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selected > 0) {
      this.selected--;
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) {
      this.selected++;
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.items[this.selected]);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.cachedLines = this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

在扩展中的使用方式：

```typescript
pi.registerCommand("pick", {
  description: "Pick an item",
  handler: async (args, ctx) => {
    const items = ["Option A", "Option B", "Option C"];
    const selector = new MySelector(items);
    
    let handle: { close: () => void; requestRender: () => void };
    
    await new Promise<void>((resolve) => {
      selector.onSelect = (item) => {
        ctx.ui.notify(`Selected: ${item}`, "info");
        handle.close();
        resolve();
      };
      selector.onCancel = () => {
        handle.close();
        resolve();
      };
      handle = ctx.ui.custom(selector);
    });
  }
});
```

## 主题

组件接受 theme 对象来控制样式。

**在 `renderCall`/`renderResult` 中**，使用 `theme` 参数：

```typescript
renderResult(result, options, theme, context) {
  // 使用 theme.fg() 设置前景色
  return new Text(theme.fg("success", "Done!"), 0, 0);
  
  // 使用 theme.bg() 设置背景色
  const styled = theme.bg("toolPendingBg", theme.fg("accent", "text"));
}
```

**前景色**（`theme.fg(color, text)`）：

| 分类 | 颜色 |
|----------|--------|
| 通用 | `text`, `accent`, `muted`, `dim` |
| 状态 | `success`, `error`, `warning` |
| 边框 | `border`, `borderAccent`, `borderMuted` |
| 消息 | `userMessageText`, `customMessageText`, `customMessageLabel` |
| 工具 | `toolTitle`, `toolOutput` |
| Diff | `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext` |
| Markdown | `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet` |
| 语法 | `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation` |
| Thinking | `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh` |
| 模式 | `bashMode` |

**背景色**（`theme.bg(color, text)`）：

`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`

**对于 Markdown**，使用 `getMarkdownTheme()`：

```typescript
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

renderResult(result, options, theme, context) {
  const mdTheme = getMarkdownTheme();
  return new Markdown(result.details.markdown, 0, 0, mdTheme);
}
```

**对于自定义组件**，定义你自己的 theme interface：

```typescript
interface MyTheme {
  selected: (s: string) => string;
  normal: (s: string) => string;
}
```

## 调试日志

设置 `PI_TUI_WRITE_LOG` 以捕获写入 stdout 的原始 ANSI 流。

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx packages/tui/test/chat-simple.ts
```

## 性能

尽可能缓存渲染输出：

```typescript
class CachedComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    // ... 计算行内容 ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

在状态变化时调用 `invalidate()`，然后调用 `handle.requestRender()` 触发重新渲染。

## 失效与主题变更

当主题发生变化时，TUI 会对所有组件调用 `invalidate()` 来清除它们的缓存。组件必须正确实现 `invalidate()`，以确保主题变更能够生效。

### 问题

如果组件将主题颜色通过 `theme.fg()`、`theme.bg()` 等预先烘焙到字符串中并进行缓存，那么缓存字符串里会包含旧主题的 ANSI escape codes。如果组件还将这些带主题的内容单独存储，仅仅清空渲染缓存是不够的。

**错误做法**（主题颜色不会更新）：

```typescript
class BadComponent extends Container {
  private content: Text;

  constructor(message: string, theme: Theme) {
    super();
    // 预先烘焙的主题颜色被存储在 Text 组件中
    this.content = new Text(theme.fg("accent", message), 1, 0);
    this.addChild(this.content);
  }
  // 没有重写 invalidate - 父类的 invalidate 只会清除
  // 子组件的渲染缓存，不会清除预先烘焙的内容
}
```

### 解决方案

凡是使用主题颜色构建内容的组件，都必须在调用 `invalidate()` 时重建这些内容：

```typescript
class GoodComponent extends Container {
  private message: string;
  private content: Text;

  constructor(message: string) {
    super();
    this.message = message;
    this.content = new Text("", 1, 0);
    this.addChild(this.content);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // 使用当前主题重建内容
    this.content.setText(theme.fg("accent", this.message));
  }

  override invalidate(): void {
    super.invalidate();  // 清除子组件缓存
    this.updateDisplay(); // 用新主题重建
  }
}
```

### 模式：在 invalidate 时重建

对于内容较复杂的组件：

```typescript
class ComplexComponent extends Container {
  private data: SomeData;

  constructor(data: SomeData) {
    super();
    this.data = data;
    this.rebuild();
  }

  private rebuild(): void {
    this.clear();  // 移除所有子组件

    // 使用当前主题构建 UI
    this.addChild(new Text(theme.fg("accent", theme.bold("Title")), 1, 0));
    this.addChild(new Spacer(1));

    for (const item of this.data.items) {
      const color = item.active ? "success" : "muted";
      this.addChild(new Text(theme.fg(color, item.label), 1, 0));
    }
  }

  override invalidate(): void {
    super.invalidate();
    this.rebuild();
  }
}
```

### 何时需要这样做

当出现以下情况时，需要使用这种模式：

1. **预先烘焙主题颜色** - 使用 `theme.fg()` 或 `theme.bg()` 创建带样式的字符串，并将其存储在子组件中
2. **语法高亮** - 使用 `highlightCode()`，它会应用基于主题的语法颜色
3. **复杂布局** - 构建嵌入主题颜色的子组件树

在以下情况中**不需要**这种模式：

1. **使用 theme 回调** - 传递类似 `(text) => theme.fg("accent", text)` 这样的函数，在渲染期间调用
2. **简单容器** - 只是组合其他组件，而不添加带主题的内容
3. **无状态渲染** - 每次 `render()` 调用时都重新计算带主题的输出（没有缓存）

## 常见模式

这些模式覆盖了扩展中最常见的 UI 需求。**直接复制这些模式，而不是从零开始构建。**

### 模式 1：选择对话框（SelectList）

用于让用户从一组选项中进行选择。使用 `@earendil-works/pi-tui` 中的 `SelectList`，并配合 `DynamicBorder` 进行边框包裹。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("pick", {
  handler: async (_args, ctx) => {
    const items: SelectItem[] = [
      { value: "opt1", label: "Option 1", description: "First option" },
      { value: "opt2", label: "Option 2", description: "Second option" },
      { value: "opt3", label: "Option 3" },  // description 可选
    ];

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      // 顶部边框
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      // 标题
      container.addChild(new Text(theme.fg("accent", theme.bold("Pick an Option")), 1, 0));

      // 带主题的 SelectList
      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      // 帮助文本
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));

      // 底部边框
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => { selectList.handleInput(data); tui.requestRender(); },
      };
    });

    if (result) {
      ctx.ui.notify(`Selected: ${result}`, "info");
    }
  },
});
```

**示例：** [preset.ts](../examples/extensions/preset.ts), [tools.ts](../examples/extensions/tools.ts)

### 模式 2：可取消的异步操作（BorderedLoader）

适用于需要耗时并支持取消的操作。`BorderedLoader` 会显示 spinner，并处理按下 escape 时的取消。

```typescript
import { BorderedLoader } from "@earendil-works/pi-coding-agent";

pi.registerCommand("fetch", {
  handler: async (_args, ctx) => {
    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, "Fetching data...");
      loader.onAbort = () => done(null);

      // 执行异步工作
      fetchData(loader.signal)
        .then((data) => done(data))
        .catch(() => done(null));

      return loader;
    });

    if (result === null) {
      ctx.ui.notify("Cancelled", "info");
    } else {
      ctx.ui.setEditorText(result);
    }
  },
});
```

**示例：** [qna.ts](../examples/extensions/qna.ts), [handoff.ts](../examples/extensions/handoff.ts)

### 模式 3：设置 / 开关（SettingsList）

用于切换多个设置项。使用 `@earendil-works/pi-tui` 中的 `SettingsList`，并配合 `getSettingsListTheme()`。

```typescript
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

pi.registerCommand("settings", {
  handler: async (_args, ctx) => {
    const items: SettingItem[] = [
      { id: "verbose", label: "Verbose mode", currentValue: "off", values: ["on", "off"] },
      { id: "color", label: "Color output", currentValue: "on", values: ["on", "off"] },
    ];

    await ctx.ui.custom((_tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("Settings")), 1, 1));

      const settingsList = new SettingsList(
        items,
        Math.min(items.length + 2, 15),
        getSettingsListTheme(),
        (id, newValue) => {
          // 处理值变更
          ctx.ui.notify(`${id} = ${newValue}`, "info");
        },
        () => done(undefined),  // 关闭时触发
        { enableSearch: true }, // 可选：按 label 启用模糊搜索
      );
      container.addChild(settingsList);

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => settingsList.handleInput?.(data),
      };
    });
  },
});
```

**示例：** [tools.ts](../examples/extensions/tools.ts)

### 模式 4：持久状态指示器

在 footer 中显示跨渲染持久存在的状态。很适合模式指示器这类场景。

```typescript
// 设置状态（显示在 footer 中）
ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("accent", "● active"));

// 清除状态
ctx.ui.setStatus("my-ext", undefined);
```

**示例：** [status-line.ts](../examples/extensions/status-line.ts), [plan-mode.ts](../examples/extensions/plan-mode.ts), [preset.ts](../examples/extensions/preset.ts)

### 模式 4b：工作指示器自定义

自定义 pi 在流式输出响应时显示的内联工作指示器。

```typescript
// 静态指示器
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });

// 自定义动画指示器
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});

// 完全隐藏指示器
ctx.ui.setWorkingIndicator({ frames: [] });

// 恢复 pi 默认 spinner
ctx.ui.setWorkingIndicator();
```

这只会影响正常流式输出时的工作指示器。Compaction 和 retry loader 仍会保留其内置样式。自定义 frames 会按原样渲染，因此扩展在需要时必须自行添加颜色。

**示例：** [working-indicator.ts](../examples/extensions/working-indicator.ts)

### 模式 5：编辑器上方 / 下方的 Widget

在输入编辑器的上方或下方显示持久内容。适合 todo list、进度展示等场景。

```typescript
// 简单字符串数组（默认显示在编辑器上方）
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);

// 显示在编辑器下方
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });

// 或使用 theme
ctx.ui.setWidget("my-widget", (_tui, theme) => {
  const lines = items.map((item, i) =>
    item.done
      ? theme.fg("success", "✓ ") + theme.fg("muted", item.text)
      : theme.fg("dim", "○ ") + item.text
  );
  return {
    render: () => lines,
    invalidate: () => {},
  };
});

// 清除
ctx.ui.setWidget("my-widget", undefined);
```

**示例：** [plan-mode.ts](../examples/extensions/plan-mode.ts)

### 模式 6：自定义 Footer

替换 footer。`footerData` 暴露了一些扩展原本无法访问的数据。

```typescript
ctx.ui.setFooter((tui, theme, footerData) => ({
  invalidate() {},
  render(width: number): string[] {
    // footerData.getGitBranch(): string | null
    // footerData.getExtensionStatuses(): ReadonlyMap<string, string>
    return [`${ctx.model?.id} (${footerData.getGitBranch() || "no git"})`];
  },
  dispose: footerData.onBranchChange(() => tui.requestRender()), // 响应式
}));

ctx.ui.setFooter(undefined); // 恢复默认
```

Token 统计信息可通过 `ctx.sessionManager.getBranch()` 和 `ctx.model` 获取。

**示例：** [custom-footer.ts](../examples/extensions/custom-footer.ts)

### 模式 7：自定义编辑器（vim mode 等）

使用自定义实现替换主输入编辑器。适用于 modal editing（如 vim）、不同的 keybindings（如 emacs），或特殊的输入处理逻辑。

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Mode = "normal" | "insert";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";

  handleInput(data: string): void {
    // Escape：切换到 normal mode，或透传给 app 处理
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") {
        this.mode = "normal";
        return;
      }
      // 在 normal mode 中，escape 会终止 agent（由 CustomEditor 处理）
      super.handleInput(data);
      return;
    }

    // Insert mode：全部交给 CustomEditor 处理
    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }

    // Normal mode：vim 风格导航
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return; // 左
      case "j": super.handleInput("\x1b[B"); return; // 下
      case "k": super.handleInput("\x1b[A"); return; // 上
      case "l": super.handleInput("\x1b[C"); return; // 右
    }
    // 将未处理的按键传给 super（ctrl+c 等），但过滤可打印字符
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;
    super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    // 在底部边框添加 mode 指示器（使用 truncateToWidth 做 ANSI-safe 截断）
    if (lines.length > 0) {
      const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
      const lastLine = lines[lines.length - 1]!;
      // 将 ellipsis 传入 ""，以避免截断时追加 "..."
      lines[lines.length - 1] = truncateToWidth(lastLine, width - label.length, "") + label;
    }
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Factory 会从 app 接收 theme 和 keybindings
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(theme, keybindings)
    );
  });
}
```

**要点：**

- **继承 `CustomEditor`**（不是基础 `Editor`），以获得 app keybindings（escape 终止、ctrl+d 退出、model 切换等）
- **对未处理的按键调用 `super.handleInput(data)`**
- **使用工厂模式**：`setEditorComponent` 接收一个 factory function，并拿到 `tui`、`theme` 和 `keybindings`
- **传入 `undefined`** 以恢复默认编辑器：`ctx.ui.setEditorComponent(undefined)`

**示例：** [modal-editor.ts](../examples/extensions/modal-editor.ts)

## 关键规则

1. **始终使用回调中的 theme** - 不要直接导入 theme。请使用 `ctx.ui.custom((tui, theme, keybindings, done) => ...)` 回调里的 `theme`。

2. **始终为 DynamicBorder 的颜色参数标注类型** - 写成 `(s: string) => theme.fg("accent", s)`，不要写 `(s) => theme.fg("accent", s)`。

3. **状态变化后调用 tui.requestRender()** - 在 `handleInput` 中，更新状态后调用 `tui.requestRender()`。

4. **返回包含三个方法的对象** - 自定义组件需要返回 `{ render, invalidate, handleInput }`。

5. **优先使用现有组件** - `SelectList`、`SettingsList`、`BorderedLoader` 能覆盖 90% 的场景。不要重复造轮子。

## 示例

- **选择 UI**： [examples/extensions/preset.ts](../examples/extensions/preset.ts) - 使用 `SelectList` 和 `DynamicBorder` 进行边框包裹
- **可取消的异步操作**： [examples/extensions/qna.ts](../examples/extensions/qna.ts) - 用 `BorderedLoader` 处理 LLM 调用
- **设置开关**： [examples/extensions/tools.ts](../examples/extensions/tools.ts) - 用 `SettingsList` 启用 / 禁用工具
- **状态指示器**： [examples/extensions/plan-mode.ts](../examples/extensions/plan-mode.ts) - `setStatus` 和 `setWidget`
- **工作指示器**： [examples/extensions/working-indicator.ts](../examples/extensions/working-indicator.ts) - `setWorkingIndicator`
- **自定义 footer**： [examples/extensions/custom-footer.ts](../examples/extensions/custom-footer.ts) - 带统计信息的 `setFooter`
- **自定义编辑器**： [examples/extensions/modal-editor.ts](../examples/extensions/modal-editor.ts) - 类 Vim 的 modal editing
- **Snake game**： [examples/extensions/snake.ts](../examples/extensions/snake.ts) - 完整游戏，包含键盘输入和 game loop
- **自定义工具渲染**： [examples/extensions/todo.ts](../examples/extensions/todo.ts) - `renderCall` 和 `renderResult`
