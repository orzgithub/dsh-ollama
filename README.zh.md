# dsh-ollama

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 [Ollama](https://ollama.com/) 本地模型插件，使用 Ollama 原生协议。

## 功能特性

- **Ollama 原生 API** — 直接使用 `/api/chat` NDJSON 流式传输，无需 OpenAI 兼容层
- **模型管理** — 浏览已安装模型、拉取新模型、查看详情、移除模型
- **可配置参数** — 调整 Ollama 专有参数，如 Temperature、Top K/P、Mirostat、Seed、思考模式等
- **GUI 配置** — 所有设置通过 DSH 插件页管理，无需手动编辑配置文件

## 前置要求

- 已安装并运行 [Ollama](https://ollama.com/)（默认地址：`http://127.0.0.1:11434`）
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) v0.17+

## 配置

所有配置均通过 DSH 图形界面完成：

1. 打开侧栏 **插件** 页，使用其中的 **Ollama** 卡片
2. **连接设置** — 设置 Ollama 服务器地址并测试连接
3. **已安装模型** — 查看、检视和移除模型
4. **拉取模型** — 通过名称下载新模型（如 `llama3.1:8b`）
5. **参数设置** — 当使用 Ollama 模型时，点击聊天输入区的 "Ollama 参数" 按钮调整生成参数

### 可配置参数

| 参数 | 说明 |
|------|------|
| Temperature | 采样温度（0–2） |
| Seed | 随机种子，用于可复现生成 |
| Top K / Top P / Min P | 核采样控制 |
| Repeat Penalty / Repeat Last N | 重复惩罚设置 |
| Frequency / Presence Penalty | Token 惩罚控制 |
| Mirostat / Mirostat Tau / Mirostat Eta | Mirostat 自适应采样 |
| TFS Z / Typical P | 替代采样方法 |
| Max Tokens (`num_predict`) | 最大输出 token 数 |
| Context Length (`num_ctx`) | 上下文窗口大小 |
| Stop Sequences | 逗号分隔的停止词 |
| Thinking | 启用/禁用 Ollama 思考模式 |

## 许可证

GPL-3.0
