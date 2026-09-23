/**
 * DeepSeek Harness plugin for Ollama native protocol.
 *
 * Uses Ollama's native /api/chat endpoint (NDJSON streaming, thinking fields,
 * native tool calling) rather than the OpenAI-compatible /v1/chat/completions.
 *
 * @module dsh-ollama
 */

import z from '@deepseek-ai/schemastery';
import {
  LlmAdapter,
  LlmError,
  EMPTY_RESPONSE_CODE,
  resolveRetryPolicy,
  RetryPolicySchema,
} from '@deepseek-ai/dsh-llm';
import { deepEqualJson } from '@deepseek-ai/dsh-util-values';
import { brandString } from '@deepseek-ai/dsh-brand';
import {
  MAX_TIMER_DELAY_MS,
  idleWatchdog,
} from '@deepseek-ai/dsh-timeout';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_CONTEXT_WINDOW = 131_072; // 128K, Ollama default
const DEFAULT_MAX_TOKENS = 8192;
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT';
const MODEL_MODALITIES = ['text', 'image'];

// ─── Message Serialization ──────────────────────────────────────────────────

/**
 * Flatten DSH content blocks into a single text string.
 */
function flattenContent(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Serialize one DSH assistant message into Ollama wire format.
 * Tool-call blocks become native Ollama tool_calls.
 */
function serializeAssistant(msg) {
  const textParts = [];
  const thinkingParts = [];
  const toolCalls = [];

  for (const block of msg.content) {
    switch (block.type) {
      case 'text':
        textParts.push(block.text);
        break;
      case 'reasoning':
        thinkingParts.push(block.text);
        break;
      case 'tool-call':
        toolCalls.push({
          id: block.id,
          function: {
            name: block.name,
            arguments:
              typeof block.arguments === 'string'
                ? safeParseJson(block.arguments)
                : block.arguments ?? {},
          },
        });
        break;
      // image, file, tool-result: skip
    }
  }

  const wire = {
    role: 'assistant',
    content: textParts.join(''),
  };
  if (thinkingParts.length > 0) wire.thinking = thinkingParts.join('');
  if (toolCalls.length > 0) wire.tool_calls = toolCalls;
  return wire;
}

/**
 * Parse a JSON string safely; returns {} on failure.
 */
function safeParseJson(raw) {
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Serialize the full DSH message history into Ollama wire messages.
 * @param {import('@deepseek-ai/dsh-llm').Message[]} messages
 * @param {string} [system] - optional system prompt
 * @returns {object[]} Ollama wire messages
 */
function serializeMessages(messages, system) {
  const wire = [];

  if (system) {
    wire.push({ role: 'system', content: system });
  }

  for (const message of messages) {
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenContent(message.content) });
      continue;
    }

    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message));
      continue;
    }

    // user or tool messages
    const textParts = [];
    const toolResults = [];

    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          textParts.push(block.text);
          break;
        case 'tool-result':
          toolResults.push(block);
          break;
        // image, file: unsupported for now in Ollama adapter
      }
    }

    // Emit text as a user message
    const text = textParts.join('');
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text });
    }

    // Emit each tool result
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        content: flattenContent(result.content) || '(no output)',
      });
    }
  }

  return wire;
}

// ─── Stream Translation ─────────────────────────────────────────────────────

/**
 * Map an Ollama done_reason to a DSH FinishReason.
 */
function mapFinishReason(reason) {
  switch (reason) {
    case 'stop':
      return { kind: 'stop' };
    case 'length':
      return { kind: 'max-tokens' };
    case 'tool_calls':
      return { kind: 'tool-calls' };
    default:
      return {
        kind: 'error',
        failure: {
          message: `Ollama stopped: ${reason || 'unknown'}`,
          code: (reason || 'UNKNOWN').toUpperCase(),
        },
      };
  }
}

/**
 * Parse NDJSON lines from an Ollama streaming response and yield DSH
 * StreamChunks. Each line is a JSON object; the final line has done=true.
 *
 * @param {ReadableStream<Uint8Array>} body - the response body
 * @param {AbortSignal} signal - abort signal
 * @param {Function} onActivity - heartbeat callback for idle watchdog
 * @yields {import('@deepseek-ai/dsh-llm').StreamChunk}
 */
async function* translateNdjson(body, signal, onActivity) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textBlockIndex = -1;
  let textBlockText = '';
  let reasoningBlockIndex = -1;
  let reasoningBlockText = '';
  const toolCallBlocks = new Map(); // index -> { callId, name, text }
  let nextIndex = 0;
  let pendingUsage;
  let pendingFinish;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new LlmError('Ollama request aborted', 'ABORTED');
      }

      const { done, value } = await reader.read();
      if (done) break;
      if (value) onActivity();

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        let chunk;
        try {
          chunk = JSON.parse(line);
        } catch {
          throw new LlmError(
            `Ollama malformed NDJSON: ${line.slice(0, 120)}`,
            'MALFORMED_RESPONSE',
          );
        }

        const msg = chunk.message;
        if (!msg) {
          // Some chunks (e.g. stats-only) may lack message
          if (chunk.done) {
            pendingFinish = mapFinishReason(chunk.done_reason);
            if (chunk.eval_count != null || chunk.prompt_eval_count != null) {
              pendingUsage = {
                inputTokens: chunk.prompt_eval_count ?? 0,
                outputTokens: chunk.eval_count ?? 0,
                totalTokens:
                  (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
              };
            }
          }
          continue;
        }

        // ── Thinking / Reasoning ──
        if (typeof msg.thinking === 'string' && msg.thinking.length > 0) {
          if (reasoningBlockIndex < 0) {
            reasoningBlockIndex = nextIndex++;
            reasoningBlockText = '';
            yield {
              type: 'block-start',
              index: reasoningBlockIndex,
              blockType: 'reasoning',
            };
          }
          reasoningBlockText += msg.thinking;
          yield {
            type: 'reasoning-delta',
            index: reasoningBlockIndex,
            text: msg.thinking,
          };
        }

        // ── Text content ──
        if (typeof msg.content === 'string' && msg.content.length > 0) {
          if (textBlockIndex < 0) {
            textBlockIndex = nextIndex++;
            textBlockText = '';
            yield {
              type: 'block-start',
              index: textBlockIndex,
              blockType: 'text',
            };
          }
          textBlockText += msg.content;
          yield {
            type: 'text-delta',
            index: textBlockIndex,
            text: msg.content,
          };
        }

        // ── Tool calls ──
        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            const fn = tc.function;
            if (!fn) continue;

            const fnIndex = fn.index ?? 0;
            let block = toolCallBlocks.get(fnIndex);
            if (!block) {
              const blockIndex = nextIndex++;
              block = {
                index: blockIndex,
                callId: tc.id ?? '',
                name: fn.name ?? '',
                text: '',
              };
              toolCallBlocks.set(fnIndex, block);
              yield {
                type: 'block-start',
                index: blockIndex,
                blockType: 'tool-call',
              };
            }

            // Update identity fields (non-empty = new, empty = no update)
            if (typeof tc.id === 'string' && tc.id.length > 0)
              block.callId = tc.id;
            if (typeof fn.name === 'string' && fn.name.length > 0)
              block.name = fn.name;

            // Ollama sends arguments as an object, not a string
            let argsDelta = '';
            if (fn.arguments != null) {
              if (typeof fn.arguments === 'string') {
                argsDelta = fn.arguments;
              } else {
                // Object: serialize only on first appearance
                if (block.text === '') {
                  argsDelta = JSON.stringify(fn.arguments);
                }
                // Subsequent chunks for the same call typically re-send the
                // full arguments object; we only want the delta.
              }
            }

            if (argsDelta.length > 0) {
              block.text += argsDelta;
              yield {
                type: 'tool-call-delta',
                index: block.index,
                id: brandString(block.callId),
                ...(block.name ? { name: block.name } : {}),
                argumentsDelta: argsDelta,
              };
            }
          }
        }

        // ── Done ──
        if (chunk.done) {
          pendingFinish = mapFinishReason(chunk.done_reason);
          if (chunk.eval_count != null || chunk.prompt_eval_count != null) {
            pendingUsage = {
              inputTokens: chunk.prompt_eval_count ?? 0,
              outputTokens: chunk.eval_count ?? 0,
              totalTokens:
                (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
            };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // ── Emit block-ends, usage, finish ──

  if (reasoningBlockIndex >= 0) {
    yield {
      type: 'block-end',
      index: reasoningBlockIndex,
      block: { type: 'reasoning', text: reasoningBlockText },
    };
  }

  if (textBlockIndex >= 0) {
    yield {
      type: 'block-end',
      index: textBlockIndex,
      block: { type: 'text', text: textBlockText },
    };
  }

  for (const [, block] of toolCallBlocks) {
    yield {
      type: 'block-end',
      index: block.index,
      block: {
        type: 'tool-call',
        id: brandString(block.callId || ''),
        name: block.name || '',
        arguments: block.text || '{}',
      },
    };
  }

  if (pendingUsage) {
    yield { type: 'usage', usage: pendingUsage };
  }

  const totalBlocks =
    (reasoningBlockIndex >= 0 ? 1 : 0) +
    (textBlockIndex >= 0 ? 1 : 0) +
    toolCallBlocks.size;

  yield {
    type: 'finish',
    reason:
      totalBlocks === 0
        ? {
            kind: 'error',
            failure: {
              message: 'Ollama returned a completed response with no content',
              code: EMPTY_RESPONSE_CODE,
            },
          }
        : pendingFinish ?? { kind: 'stop' },
  };
}

// ─── Ollama Adapter ─────────────────────────────────────────────────────────

/**
 * Ollama native protocol adapter for DSH.
 *
 * Talks to /api/chat with NDJSON streaming, supports native thinking/reasoning
 * fields, native tool calling, and Ollama-specific token accounting.
 */
class OllamaAdapter extends LlmAdapter {
  /** @type {() => OllamaConnectionOptions} */
  #options;

  constructor(options) {
    super();
    this.#options = options;
  }

  /** @returns {import('@deepseek-ai/dsh-llm').LlmProviderInfo} */
  providerInfo(provider) {
    return { id: provider, name: 'Ollama' };
  }

  /** @returns {import('@deepseek-ai/dsh-llm').ResolvedRetryPolicy | undefined} */
  providerRetryPolicy(_provider) {
    return this.#options().retryPolicy;
  }

  /** No special image pricing for Ollama. */
  imageRequestPricing() {
    return undefined;
  }

  /** List all locally available models from Ollama. */
  async listModels(provider) {
    const connection = this.#options();
    try {
      const resp = await fetch(`${connection.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.models ?? []).map((m) => ({
        provider,
        id: m.name,
        name: m.name,
        inputModalities: (m.capabilities ?? []).includes('vision')
          ? ['text', 'image']
          : ['text'],
      }));
    } catch {
      return [];
    }
  }

  /** Resolve metadata for one specific model. */
  async resolveModel(provider, model, signal) {
    const connection = this.#options();
    const models = connection.models;
    const catalog = models.find((m) => m.id === model);

    const contextWindow =
      catalog?.contextWindow ?? connection.defaultContextWindow;
    const maxTokens = catalog?.maxTokens ?? connection.maxTokens;

    return {
      provider,
      id: model,
      name: catalog?.name ?? model,
      ...(catalog?.description ? { description: catalog.description } : {}),
      inputModalities: catalog?.inputModalities ?? ['text'],
      context: { contextWindow },
      defaultMaxTokens: maxTokens,
    };
  }

  /** Bind model metadata and stream entry point for one adapter generation. */
  async prepareCall(provider, model, signal) {
    const connection = this.#options();
    const modelInfo = await this.resolveModel(provider, model, signal);
    return {
      model: modelInfo,
      stream: (options) => this.#streamWithConnection(options, connection),
    };
  }

  /** The main streaming entry point. */
  stream(options) {
    return this.#streamWithConnection(options, this.#options());
  }

  /** @private */
  async *#streamWithConnection(options, connection) {
    const watchdog = { signal: options.signal, pulse: () => {} };

    // Set up idle watchdog if available
    let consumer;
    try {
      consumer = new AbortController();
      const watchdogObj = idleWatchdog(
        options.signal
          ? AbortSignal.any([options.signal, consumer.signal])
          : consumer.signal,
        connection.streamIdleTimeoutMs,
        STREAM_IDLE_TIMEOUT_CODE,
      );
      watchdogObj.pulse();
      watchdog.signal = AbortSignal.any([watchdogObj.signal, consumer?.signal ?? new AbortController().signal]);
      watchdog.pulse = () => watchdogObj.pulse();
    } catch {
      // If idleWatchdog is not available, proceed without it
    }

    try {
      const messages = serializeMessages(options.messages, options.system);
      const body = {
        model: options.model,
        messages,
        stream: true,
      };

      // Add tools if present
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      // Add sampling parameters from DSH options
      if (options.temperature != null) body.temperature = options.temperature;
      if (options.maxTokens != null) body.num_predict = options.maxTokens;
      if (options.stop != null) body.stop = options.stop;

      // Merge Ollama-specific params from settings (overrides DSH defaults)
      const params = connection.params ?? {};
      if (params.temperature != null) body.temperature = params.temperature;
      if (params.seed != null) body.options = { ...body.options, seed: params.seed };
      if (params.top_k != null) body.options = { ...body.options, top_k: params.top_k };
      if (params.top_p != null) body.options = { ...body.options, top_p: params.top_p };
      if (params.min_p != null) body.options = { ...body.options, min_p: params.min_p };
      if (params.repeat_penalty != null) body.options = { ...body.options, repeat_penalty: params.repeat_penalty };
      if (params.repeat_last_n != null) body.options = { ...body.options, repeat_last_n: params.repeat_last_n };
      if (params.num_predict != null) body.num_predict = params.num_predict;
      if (params.num_ctx != null) body.options = { ...body.options, num_ctx: params.num_ctx };
      if (params.stop != null) body.stop = params.stop;
      if (params.think != null) body.think = params.think;
      if (params.mirostat != null) body.options = { ...body.options, mirostat: params.mirostat };
      if (params.mirostat_tau != null) body.options = { ...body.options, mirostat_tau: params.mirostat_tau };
      if (params.mirostat_eta != null) body.options = { ...body.options, mirostat_eta: params.mirostat_eta };
      if (params.frequency_penalty != null) body.options = { ...body.options, frequency_penalty: params.frequency_penalty };
      if (params.presence_penalty != null) body.options = { ...body.options, presence_penalty: params.presence_penalty };
      if (params.tfs_z != null) body.options = { ...body.options, tfs_z: params.tfs_z };
      if (params.typical_p != null) body.options = { ...body.options, typical_p: params.typical_p };

      let response;
      try {
        response = await fetch(`${connection.baseURL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted)
          throw new LlmError('Ollama request aborted', 'ABORTED', {
            cause: error,
          });
        throw new LlmError(
          `Ollama request to ${connection.baseURL} failed`,
          'TRANSPORT',
          { cause: error },
        );
      }

      if (!response.ok) {
        let message = `Ollama error (HTTP ${response.status})`;
        let detail = '';
        try {
          const raw = await response.text();
          const parsed = JSON.parse(raw);
          if (parsed.error) {
            message = parsed.error;
            detail = raw;
          }
        } catch {
          // ignore
        }

        const code =
          response.status === 401 || response.status === 403
            ? 'AUTH'
            : response.status === 404
              ? 'MODEL_NOT_FOUND'
              : response.status >= 500
                ? 'SERVER'
                : `HTTP_${response.status}`;

        throw new LlmError(message, code, {
          cause: detail ? new Error(detail) : undefined,
          status: response.status,
        });
      }

      if (!response.body) {
        throw new LlmError(
          'Ollama returned no response body',
          'EMPTY_RESPONSE',
        );
      }

      yield* translateNdjson(response.body, options.signal, () =>
        watchdog.pulse(),
      );
    } finally {
      consumer?.abort('Ollama stream consumer stopped');
    }
  }
}

// ─── Configuration Schema ───────────────────────────────────────────────────

const Config = z.object({
  /** Ollama base URL (without trailing slash). */
  baseURL: z.string().default('http://127.0.0.1:11434'),
  /** Default context window for models that don't report one. */
  defaultContextWindow: z
    .number()
    .step(1)
    .min(1)
    .default(DEFAULT_CONTEXT_WINDOW),
  /** Default max output tokens. */
  maxTokens: z
    .number()
    .step(1)
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_MAX_TOKENS),
  /** Stream idle timeout in ms. */
  streamIdleTimeoutMs: z
    .number()
    .min(Number.MIN_VALUE)
    .max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  /** Retry policy. */
  retryPolicy: RetryPolicySchema,
  /**
   * Static model catalog entries. Each entry augments what Ollama reports
   * dynamically. Entries here are merged with /api/tags results.
   */
  models: z
    .array(
      z.object({
        id: z.string().required(),
        name: z.string(),
        description: z.string(),
        contextWindow: z.number().step(1).min(1),
        maxTokens: z.number().step(1).min(1),
        inputModalities: z.array(z.union(MODEL_MODALITIES)).min(1),
      }),
    )
    .default([]),
  /**
   * Ollama-specific request parameters. These are passed directly to the
   * Ollama /api/chat endpoint, overriding defaults.
   */
  params: z
    .object({
      temperature: z.any(),
      seed: z.any(),
      top_k: z.any(),
      top_p: z.any(),
      min_p: z.any(),
      repeat_penalty: z.any(),
      repeat_last_n: z.any(),
      num_predict: z.any(),
      num_ctx: z.any(),
      stop: z.any(),
      think: z.any(),
      mirostat: z.any(),
      mirostat_tau: z.any(),
      mirostat_eta: z.any(),
      frequency_penalty: z.any(),
      presence_penalty: z.any(),
      tfs_z: z.any(),
      typical_p: z.any(),
    })
    .default({}),
});

// ─── Plugin Registration ────────────────────────────────────────────────────

const name = 'llm-ollama';
const inject = ['llm'];
const NS = 'llm-ollama';
const PROVIDER = 'ollama';

/**
 * Resolve connection options from validated config.
 */
function resolveAdapterOptions(config) {
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (
    !Number.isFinite(streamIdleTimeoutMs) ||
    streamIdleTimeoutMs <= 0 ||
    streamIdleTimeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      `llm-ollama: streamIdleTimeoutMs must be positive and <= ${MAX_TIMER_DELAY_MS}`,
    );
  }

  return {
    baseURL: (config.baseURL ?? 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    streamIdleTimeoutMs,
    models: (config.models ?? []).map((m) => ({
      id: m.id,
      ...(m.name ? { name: m.name } : {}),
      ...(m.description ? { description: m.description } : {}),
      ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
      ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
      inputModalities: m.inputModalities ?? ['text'],
    })),
    params: config.params ?? {},
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-ollama: retryPolicy'),
  };
}

/**
 * Cordis plugin apply function.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config - raw plugin config
 */
function apply(ctx, config) {
  let current = () => config;
  let lastRaw;
  let lastGood;

  const options = () => {
    const raw = current();
    if (raw === lastRaw && lastGood !== void 0) return lastGood;
    try {
      const next = resolveAdapterOptions(raw);
      lastRaw = raw;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      ctx.logger.error(
        'llm-ollama: keeping the last good configuration after an invalid settings section',
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };

  // Validate once at startup
  options();

  const adapter = new OllamaAdapter(options);

  // Register as a configurable provider
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: 'Ollama',
      settingsNs: NS,
      settingsPath: [],
    },
  ]);

  // Register the adapter
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter);
  let registeredPolicy = options().retryPolicy;

  const ensureRegistrationFacts = () => {
    const policy = options().retryPolicy;
    if (deepEqualJson(policy, registeredPolicy)) return;
    registration.replace([PROVIDER]);
    registeredPolicy = policy;
  };

  // Install settings section for hot-reload
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source;
      },
      onChange: ensureRegistrationFacts,
    });
  });

  ctx.logger.info(`llm-ollama: registered provider "${PROVIDER}" at ${options().baseURL}`);
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { Config, apply, inject, name, PROVIDER, OllamaAdapter };
