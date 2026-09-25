# dsh-ollama

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for local AI models via [Ollama](https://ollama.com/) native protocol.

## Features

- **Ollama Native API** — Uses `/api/chat` NDJSON streaming directly, no OpenAI-compatible bridge needed
- **Model Management** — Browse installed models, pull new ones, view details, remove
- **Configurable Parameters** — Adjust Ollama-specific params like Temperature, Top K/P, Mirostat, Seed, thinking mode, and more
- **GUI Configuration** — All settings managed through the DSH Plugins page, no manual config files

## Prerequisites

- [Ollama](https://ollama.com/) installed and running (default: `http://127.0.0.1:11434`)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) v0.17+

## Configuration

All configuration is done through the DSH GUI:

1. Open the sidebar **Plugins** page and use the **Ollama** bundle card
2. **Connection** — Set your Ollama server address and test connectivity
3. **Installed Models** — View, inspect, and remove models
4. **Pull Model** — Download new models by name (e.g. `llama3.1:8b`)
5. **Parameters** — Tune Ollama-specific generation parameters (click "Ollama Params" button in the chat input area when an Ollama model is active)

### Configurable Parameters

| Parameter | Description |
|-----------|-------------|
| Temperature | Sampling temperature (0–2) |
| Seed | Random seed for reproducibility |
| Top K / Top P / Min P | Nucleus sampling controls |
| Repeat Penalty / Repeat Last N | Repetition penalty settings |
| Frequency / Presence Penalty | Token penalty controls |
| Mirostat / Mirostat Tau / Mirostat Eta | Mirostat adaptive sampling |
| TFS Z / Typical P | Alternative sampling methods |
| Max Tokens (`num_predict`) | Maximum output tokens |
| Context Length (`num_ctx`) | Context window size |
| Stop Sequences | Comma-separated stop tokens |
| Thinking | Enable/disable Ollama thinking mode |

## License

GPL-3.0
