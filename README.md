# dsh-think-timestamp

> **纯前端交互 · DeepSeek Harness 思考输出时间戳与耗时引擎**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-DeepSeek%20Harness%20Desktop-orange.svg)]()

`dsh-think-timestamp` 是专为 **DeepSeek Harness (DSH)** 桌面端打造的**纯前端交互插件**。它彻底脱离提示词（Prompt）与具体模型限制，在前端界面输出思考内容时，自动计算并高精度打印东八区物理时间戳，并完整保留思考耗时。

---

## ✨ 核心特性

1. ⚡ **纯前端原生交互（Zero Model / Prompt Overhead）**
   - 不向大模型注入任何 System Prompt，不占用任何上下文 Token，无语言/模型限制；
   - 无论是 DeepSeek-R1、Claude、GPT、Qwen、Ollama 还是自定义本地模型，只要 DSH 前端输出思考，一律即刻生效。

2. ⏱️ **高精度物理时间戳（东八区 UTC+8）**
   - 严格基于东八区高精度物理时钟计算，格式纯净（如 `05:12:30`），无多余冗余字符；
   - 正文段落采用 **CSS 伪元素 (`::before`) 隔离渲染**，真实 DOM 节点零侵入，彻底消除与 React Virtual DOM 的流式更新冲突。

3. 🏃 **实时秒级平滑心跳与呼吸动效**
   - **思考进行中**：标题栏药丸显示青色动态流逝秒数（如 `⏱️ 05:12:30 (思考中 8s...)`），搭配微妙呼吸光晕；
   - 心跳计时器采用向下取整（`Math.floor`），数值单调递增，绝无时间倒流。

4. 🎯 **思考完成耗时完整保留与平滑变色**
   - **思考完成后**：药丸完整保留开始时间戳与精确耗时（如 `⏱️ 05:12:30 (耗时 8.7s)`）；
   - 样式平滑变换为静止的稳重完成绿，正文步骤时间戳完整保留；
   - 支持跨生命周期的 DOM 属性双向持久化，折叠/展开或滚动出视口重新挂载时，时间戳与耗时永不丢失。

5. 🛡️ **极致性能与安全防御**
   - **WeakSet 短路已完成节点**：历史长会话下 DOM 扫描零开销，稳定维持 60 FPS；
   - **Detached DOM 实时修剪**：节点脱水或用户中断生成时立即释放引用并自停心跳，杜绝内存泄漏；
   - **工业级安全**：防 XSS（0 innerHTML）、防 ReDoS（10万字对抗串 < 1ms）、防 Markdown 列表双重时间戳嵌套。

---

## 📸 呈现效果

### 前端 UI 界面呈现
```text
▼ 思考过程 ⏱️ 05:12:30 (耗时 8.7s)
  05:12:30 正在分析用户提出的架构改造需求...
  05:12:33 调用底层监听器与流式断句切分...
  05:12:37 使用高精度物理时钟生成时间标签...
  05:12:38 思考结束，切换至正式回复。
```

### 开发者控制台 (DevTools Console)
```text
[05:12:30.120] [DSH 思考输出:开始] 捕获到前端思考流触发
[05:12:30.450] [DSH 思考输出] 正在分析用户提出的架构改造需求...
[05:12:33.210] [DSH 思考输出] 调用底层监听器与流式断句切分...
[05:12:37.600] [DSH 思考输出] 使用高精度物理时钟生成时间标签...
[05:12:38.820] [DSH 思考输出] 思考结束，切换至正式回复。
```

---

## 📦 安装与启用

### 方式一：作为本地插件接入 DSH Profile

1. 克隆或下载本仓库至本地目录：
   ```bash
   git clone https://github.com/skyzzq/dsh-think-timestamp.git
   ```

2. 在 DSH 对应的 profile 配置（如 `~/.dsh/profiles/desktop/package.json`）中添加依赖或建立符号链接：
   ```json
   "dependencies": {
     "dsh-think-timestamp": "1.0.0"
   }
   ```
   并在 `dsh.profile.bundles` 中引入 `"dsh-think-timestamp"`。

3. 打开 DeepSeek Harness 窗口，按下 **`Ctrl + R`** 刷新即可即时加载生效。

---

## 🧪 自动化测试

项目内置 4 套自动化测试套件，共包含 15 项严苛测试（涵盖交互表现、DOM 伪元素渲染、历史节点保护、时钟校准、内存防泄漏与安全对抗）：

```bash
node --expose-gc --test test/*.test.mjs
```

测试覆盖矩阵：
- ✅ **交互与生命周期**：运行态药丸、平滑心跳、完成态变色、耗时持久化与历史节点保护
- ✅ **内存防泄漏**：2,000 次高频异常中断模拟压测，Detached DOM 泄漏数量为 0
- ✅ **安全与边界**：XSS 注入隔离、ReDoS 10万字对抗压测（0.27ms 极速返回）、列表嵌套防重、时钟回拨保护
- ✅ **协议解耦**：多流式协议解析与纯文本时间戳装饰

---

## 📄 License

[MIT License](LICENSE) © 2026 skyzzq
