# 终端设置

Pi 使用 [Kitty 键盘协议](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) 来可靠地检测修饰键。大多数现代终端支持此协议，但有些需要配置。

## Kitty、iTerm2

开箱即用。

## Apple Terminal

Pi 在可用时启用增强按键报告。如果 Terminal.app 仍然为 `Shift+Enter` 发送普通 Return，Pi 会使用本地 macOS 修饰符回退方案将该 Return 视为 `Shift+Enter`。

此回退方案仅在 Pi 与 Terminal.app 运行在同一台 Mac 上时有效。它无法通过远程 SSH 检测本地键盘。

## Ghostty

添加到你的 Ghostty 配置中（macOS 上为 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 上为 `~/.config/ghostty/config`）：

```
keybind = alt+backspace=text:\x1b\x7f
```

旧版本的 Claude Code 可能添加了此 Ghostty 映射：

```
keybind = shift+enter=text:\n
```

该映射发送原始换行字节。在 Pi 内部，这与 `Ctrl+J` 无法区分，因此 tmux 和 Pi 不再能识别真正的 `shift+enter` 按键事件。

如果 Claude Code 2.x 或更新版本是你添加该映射的唯一原因，你可以将其删除，除非你想在 tmux 中使用 Claude Code，那里仍需要该 Ghostty 映射。

如果你想通过该重映射在 tmux 中保持 `Shift+Enter` 工作，请在 `~/.pi/agent/keybindings.json` 中将 `ctrl+j` 添加到你的 Pi `newLine` 快捷键：

```json
{
  "newLine": ["shift+enter", "ctrl+j"]
}
```

## WezTerm

创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

在 WSL 上，WezTerm 可能需要可见的硬件光标来进行 IME 候选窗口定位。如果 CJK IME 候选项不跟随文本光标，请在运行 Pi 前设置 `PI_HARDWARE_CURSOR=1` 或在设置中将 `showHardwareCursor` 设为 `true`。

## VS Code（集成终端）

`keybindings.json` 位置：
- macOS：`~/Library/Application Support/Code/User/keybindings.json`
- Linux：`~/.config/Code/User/keybindings.json`
- Windows：`%APPDATA%\\Code\\User\\keybindings.json`

在 `keybindings.json` 中添加以下内容以启用多行输入的 `Shift+Enter`：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

## Windows Terminal

在 `settings.json` 中添加（Ctrl+Shift+, 或设置 → 打开 JSON 文件）以转发 Pi 使用的修饰 Enter 键：

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "\u001b[13;2u" },
      "keys": "shift+enter"
    },
    {
      "command": { "action": "sendInput", "input": "\u001b[13;3u" },
      "keys": "alt+enter"
    }
  ]
}
```

- `Shift+Enter` 插入新行。
- Windows Terminal 默认将 `Alt+Enter` 绑定为全屏。这会阻止 Pi 接收 `Alt+Enter` 用于后续队列。
- 将 `Alt+Enter` 重映射为 `sendInput` 会将真实的组合键转发给 Pi。

如果你已有 `actions` 数组，将这些对象添加到其中。如果旧的全屏行为仍然存在，请完全关闭并重新打开 Windows Terminal。

## xfce4-terminal、terminator

这些终端的转义序列支持有限。修饰 Enter 键如 `Ctrl+Enter` 和 `Shift+Enter` 无法与普通 `Enter` 区分，这会导致自定义快捷键如 `submit: ["ctrl+enter"]` 无法工作。

为获得最佳体验，请使用支持 Kitty 键盘协议的终端：
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty)（需要编译时启用 Kitty 协议支持）

## IntelliJ IDEA（集成终端）

内置终端的转义序列支持有限。在 IntelliJ 的终端中 Shift+Enter 无法与 Enter 区分。

如果你希望硬件光标可见，请在运行 Pi 前设置 `PI_HARDWARE_CURSOR=1`（默认禁用以确保兼容性）。

建议使用专用终端模拟器以获得最佳体验。
