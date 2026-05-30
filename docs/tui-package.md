# @earendil-works/pi-tui

极简终端 UI 框架，支持差异渲染和同步输出，为交互式 CLI 应用提供无闪烁体验。

## 特性

- **差异渲染**：三策略渲染系统，仅更新发生变化的内容
- **同步输出**：使用 CSI 2026 进行原子屏幕更新（无闪烁）
- **括号粘贴模式**：正确处理大量粘贴，对超过 10 行的粘贴使用标记
- **基于组件**：简单的 Component 接口，带 render() 方法
- **主题支持**：组件接受主题接口以自定义样式
- **内置组件**：Text、TruncatedText、Input、Editor、Markdown、Loader、SelectList、SettingsList、Spacer、Image、Box、Container
- **内联图像**：在支持 Kitty 或 iTerm2 图形协议的终端中渲染图像
- **自动补全支持**：文件路径和斜杠命令

## 快速开始

```typescript
import { TUI, Text, Editor, ProcessTerminal, matchesKey } from "@earendil-works/pi-tui";

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

tui.addChild(new Text("Welcome to my app!"));

import { defaultEditorTheme as editorTheme } from './test/test-themes.ts';
const editor = new Editor(tui, editorTheme);
editor.onSubmit = (text) => {
  console.log("Submitted:", text);
  tui.addChild(new Text(`You said: ${text}`));
};
tui.addChild(editor);

tui.setFocus(editor);

tui.addInputListener((data) => {
  if (matchesKey(data, 'ctrl+c')) {
    tui.stop();
    process.exit(0);
  }
});

tui.start();
```

## 核心 API

### TUI

管理组件和渲染的主容器。

```typescript
const tui = new TUI(terminal);
tui.addChild(component);
tui.removeChild(component);
tui.start();
tui.stop();
tui.requestRender();
```

### 覆盖层 (Overlays)

覆盖层在现有内容之上渲染组件而不替换它。适用于对话框、菜单和模态 UI。

```typescript
const handle = tui.showOverlay(component);
const handle = tui.showOverlay(component, {
  width: 60,
  width: "80%",
  minWidth: 40,
  maxHeight: 20,
  anchor: 'bottom-right',
  offsetX: 2,
  offsetY: -1,
  margin: 2,
  visible: (termWidth, termHeight) => termWidth >= 100,
  nonCapturing: true,
});

handle.hide();
handle.setHidden(true);
handle.setHidden(false);
handle.isHidden();
handle.focus();
handle.unfocus();
handle.isFocused();
tui.hideOverlay();
tui.hasOverlay();
```

**锚点值**：`'center'`、`'top-left'`、`'top-right'`、`'bottom-left'`、`'bottom-right'`、`'top-center'`、`'bottom-center'`、`'left-center'`、`'right-center'`

**解析顺序**：
1. `minWidth` 在宽度计算后作为下限应用
2. 位置优先级：绝对 `row`/`col` > 百分比 `row`/`col` > `anchor`
3. `margin` 将最终位置限制在终端边界内
4. `visible` 回调控制覆盖层是否渲染（每帧调用）

### Component 接口

所有组件实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate?(): void;
}
```

| 方法 | 描述 |
|--------|-------------|
| `render(width)` | 返回字符串数组，每行一个。每行**不得超过 `width`**，否则 TUI 会报错。使用 `truncateToWidth()` 或手动换行确保这一点。 |
| `handleInput?(data)` | 当组件获得焦点并接收键盘输入时调用。 |
| `invalidate?()` | 调用以清除任何缓存的渲染状态。 |

### Focusable 接口（IME 支持）

显示文本光标并需要 IME（输入法编辑器）支持的组件应实现 `Focusable` 接口：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;
  
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

当 `Focusable` 组件获得焦点时，TUI：
1. 在组件上设置 `focused = true`
2. 扫描渲染输出以查找 `CURSOR_MARKER`
3. 将硬件终端光标定位到该位置
4. 仅当启用 `showHardwareCursor` 时显示硬件光标

## 内置组件

### Container

对子组件进行分组。

```typescript
const container = new Container();
container.addChild(component);
container.removeChild(component);
```

### Box

对所有子组件应用内边距和背景色的容器。

```typescript
const box = new Box(1, 1, (text) => chalk.bgGray(text));
box.addChild(new Text("Content"));
```

### Text

显示带有自动换行和内边距的多行文本。

```typescript
const text = new Text("Hello World", 1, 1, (text) => chalk.bgGray(text));
text.setText("Updated text");
```

### TruncatedText

截断以适应视口宽度的单行文本。适用于状态行和标题。

### Input

带水平滚动的单行文本输入。

```typescript
const input = new Input();
input.onSubmit = (value) => console.log(value);
input.setValue("initial");
input.getValue();
```

### Editor

带自动补全、文件补全、粘贴处理和垂直滚动的多行文本编辑器。

```typescript
const editor = new Editor(tui, theme, options?);
editor.onSubmit = (text) => console.log(text);
editor.onChange = (text) => console.log("Changed:", text);
editor.setAutocompleteProvider(provider);
```

**特性：**
- 带自动换行的多行编辑
- 斜杠命令自动补全（输入 `/`）
- 文件路径自动补全（按 `Tab`）
- 大量粘贴处理（>10 行创建标记）

### Markdown

渲染带语法高亮和主题支持的 Markdown。

```typescript
const md = new Markdown("# Hello\n\nSome **bold** text", 1, 1, theme, defaultStyle);
md.setText("Updated markdown");
```

### Loader

动画加载旋转器。

```typescript
const loader = new Loader(tui, (s) => chalk.cyan(s), (s) => chalk.gray(s), "Loading...");
loader.start();
loader.setMessage("Still loading...");
loader.stop();
```

### CancellableLoader

扩展 Loader，带 Escape 键处理和用于取消异步操作的 AbortSignal。

```typescript
const loader = new CancellableLoader(tui, spinnerColor, messageColor, "Working...");
loader.onAbort = () => done(null);
doAsyncWork(loader.signal).then(done);
```

### SelectList

带键盘导航的交互式选择列表。

```typescript
const list = new SelectList(items, maxVisible, theme);
list.onSelect = (item) => console.log("Selected:", item);
list.onCancel = () => console.log("Cancelled");
list.setFilter("opt");
```

### SettingsList

带值循环和子菜单的设置面板。

### Spacer

用于垂直间距的空行。

```typescript
const spacer = new Spacer(2);
```

### Image

为支持 Kitty 图形协议或 iTerm2 内联图像的终端渲染内联图像。在不支持的终端上回退到文本占位符。

```typescript
const image = new Image(base64Data, "image/png", theme, options);
tui.addChild(image);
```

支持格式：PNG、JPEG、GIF、WebP。尺寸从图像头部自动解析。

## 自动补全

### CombinedAutocompleteProvider

同时支持斜杠命令和文件路径。

```typescript
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";

const provider = new CombinedAutocompleteProvider(
  [
    { name: "help", description: "Show help" },
    { name: "clear", description: "Clear screen" },
  ],
  process.cwd()
);

editor.setAutocompleteProvider(provider);
```

## 按键检测

使用 `matchesKey()` 与 `Key` 辅助函数检测键盘输入：

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

if (matchesKey(data, Key.ctrl("c"))) {
  process.exit(0);
}
if (matchesKey(data, Key.enter)) { submit(); }
if (matchesKey(data, Key.escape)) { cancel(); }
```

**按键标识符**：
- 基本键：`Key.enter`、`Key.escape`、`Key.tab`、`Key.space`、`Key.backspace`、`Key.delete`
- 方向键：`Key.up`、`Key.down`、`Key.left`、`Key.right`
- 带修饰符：`Key.ctrl("c")`、`Key.shift("tab")`、`Key.alt("left")`

## 差异渲染

TUI 使用三种渲染策略：

1. **首次渲染**：输出所有行，不清除滚动缓冲区
2. **宽度变化或视口上方有变化**：清屏并完全重新渲染
3. **正常更新**：将光标移动到第一个变化行，清除到末尾，渲染变化的行

所有更新都包裹在**同步输出**（`\x1b[?2026h` ... `\x1b[?2026l`）中，实现原子、无闪烁渲染。

## Terminal 接口

TUI 可以与任何实现 `Terminal` 接口的对象配合使用：

```typescript
interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
}
```

**内置实现：**
- `ProcessTerminal` - 使用 `process.stdin/stdout`
- `VirtualTerminal` - 用于测试（使用 `@xterm/headless`）

## 工具函数

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// 获取字符串的可见宽度（忽略 ANSI 码）
const width = visibleWidth("\x1b[31mHello\x1b[0m"); // 5

// 截断字符串到指定宽度（保留 ANSI 码，添加省略号）
const truncated = truncateToWidth("Hello World", 8); // "Hello..."

// 将文本换行到指定宽度（跨行保留 ANSI 码）
const lines = wrapTextWithAnsi("This is a long line that needs wrapping", 20);
```

## 创建自定义组件

创建自定义组件时，**`render()` 返回的每行不得超过 `width` 参数**。如果任何行比终端宽，TUI 将报错。

## 示例

参见 `test/chat-simple.ts` 获取完整的聊天界面示例。

运行：
```bash
npx tsx test/chat-simple.ts
```

## 开发

```bash
npm install
npm run check
npx tsx test/chat-simple.ts
```

### 调试日志

设置 `PI_TUI_WRITE_LOG` 以捕获写入 stdout 的原始 ANSI 流。

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx test/chat-simple.ts
```
