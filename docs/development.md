# 开发

其他指南请参见 [AGENTS.md](https://github.com/earendil-works/pi-mono/blob/main/AGENTS.md)。

## 设置

```bash
git clone https://github.com/earendil-works/pi-mono
cd pi-mono
npm install
npm run build
```

从源码运行：

```bash
/path/to/pi-mono/pi-test.sh
```

该脚本可以从任何目录运行。Pi 会保持调用者的当前工作目录。

## 分叉 / 重新品牌化

通过 `package.json` 配置：

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

更改 `name`、`configDir` 和 `bin` 字段来创建你的分叉。这会影响 CLI 横幅、配置路径和环境变量名称。

## 路径解析

三种执行模式：npm install、独立二进制文件、从源码 tsx。

**始终使用 `src/config.ts`** 来获取包资源：

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

永远不要直接使用 `__dirname` 来获取包资源。

## 调试命令

`/debug`（隐藏命令）写入 `~/.pi/agent/pi-debug.log`：
- 带 ANSI 代码的渲染 TUI 行
- 发送给 LLM 的最后消息

## 测试

```bash
./test.sh                         # 运行非 LLM 测试（不需要 API 密钥）
npm test                          # 运行所有测试
npm test -- test/specific.test.ts # 运行特定测试
```

## 项目结构

```
packages/
  ai/           # LLM 提供商抽象层
  agent/        # Agent 循环和消息类型
  tui/          # 终端 UI 组件
  coding-agent/ # CLI 和交互模式
```
