/**
 * Ollama native protocol adapter for DSH.
 *
 * Talks to /api/chat with NDJSON streaming, supports native thinking/reasoning
 * fields, native tool calling, and Ollama-specific token accounting.
 *
 * @module lib/adapter
 */

import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm';
import { idleWatchdog } from '@deepseek-ai/dsh-timeout';
import { serializeMessages } from './serialize.js';
import { translateNdjson } from './stream.js';

export class OllamaAdapter extends LlmAdapter {
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
      const body = this.#buildRequestBody(options, messages, connection);

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
        throw await this.#handleErrorResponse(response);
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

  /** @private Build the request body for /api/chat. */
  #buildRequestBody(options, messages, connection) {
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
    this.#mergeParams(body, params);

    return body;
  }

  /** @private Merge Ollama-specific parameters into the request body. */
  #mergeParams(body, params) {
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
  }

  /** @private Handle non-2xx response from Ollama. */
  async #handleErrorResponse(response) {
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

    return new LlmError(message, code, {
      cause: detail ? new Error(detail) : undefined,
      status: response.status,
    });
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT';
