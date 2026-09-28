/**
 * Ollama native protocol adapter for DSH.
 *
 * Talks to /api/chat with NDJSON streaming, supports native thinking/reasoning
 * fields, native tool calling, and Ollama-specific token accounting.
 *
 * @module lib/adapter
 */

import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { idleWatchdog } from '@deepseek-ai/dsh-timeout';
import { serializeMessages } from './serialize.js';
import { translateNdjson } from './stream.js';

export class OllamaAdapter extends LlmAdapter {
  /** @type {() => OllamaConnectionOptions} */
  #options;

  /** @type {() => import('@deepseek-ai/dsh-attachment').AttachmentStore | undefined} */
  #attachments;

  /**
   * Per-model /api/show details cache. Value is null (negative cache) or an
   * object with contextLength and capabilities. Avoids repeated Ollama lookups
   * and lets a single /api/show call serve both the context window and the
   * modality resolution.
   * @type {Map<string, { contextLength: number | null, capabilities: string[] | null } | null>}
   */
  #detailsCache = new Map();

  /** @type {Map<string, any>} cached /api/show payload, keyed by model name */
  #showCache = new Map();

  /** @type {Map<string, any[]>} cached /api/tags models, keyed by baseURL */
  #tagsCache = new Map();

  constructor(options, attachments) {
    super();
    this.#options = options;
    this.#attachments = attachments ?? (() => undefined);
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
    const catalog = connection.models.find((m) => m.id === model);

    let contextWindow;
    const numCtx = connection.params?.num_ctx;
    if (numCtx != null && Number.isFinite(Number(numCtx)) && Number(numCtx) > 0) {
      contextWindow = Number(numCtx);
    } else if (catalog?.contextWindow != null) {
      contextWindow = catalog.contextWindow;
    }

    // Prefer an explicit catalog modality declaration; otherwise derive it from
    // the model's real Ollama capabilities. The catalog is also the source for
    // context length when no num_ctx override is set. A single cached /api/tags
    // lookup (inside #fetchModelDetails) resolves capabilities + context length.
    let inputModalities = catalog?.inputModalities;

    // Always resolve real Ollama metadata: it is cached, so repeated calls are a
    // Map lookup. It is the authoritative source for vision / thinking / tools
    // capability detection as well as the context length fallback.
    const details = await this.#fetchModelDetails(model, signal);

    if (contextWindow == null) {
      contextWindow = details?.contextLength ?? connection.defaultContextWindow;
    }

    if (inputModalities == null) {
      const caps = details?.capabilities;
      inputModalities =
        Array.isArray(caps) && caps.includes('vision')
          ? ['text', 'image']
          : ['text'];
    }

    const maxTokens = catalog?.maxTokens ?? connection.maxTokens;

    // Reasoning / thinking capability, derived from the model's real metadata.
    // Only models that advertise the `thinking` capability get a `reasoning`
    // block; DSH then renders its native reasoning-effort switch instead of the
    // old manual param-panel toggle.
    let reasoning;
    const caps = details?.capabilities;
    if (Array.isArray(caps) && caps.includes('thinking')) {
      const show = await this.#getShow(model, signal);
      reasoning = this.#buildReasoningInfo(show?.thinking);
    }

    return {
      provider,
      id: model,
      name: catalog?.name ?? model,
      ...(catalog?.description ? { description: catalog.description } : {}),
      inputModalities,
      context: { contextWindow },
      defaultMaxTokens: maxTokens,
      ...(reasoning ? { reasoning } : {}),
    };
  }

  /**
   * Fetch a model's real details (context length + capabilities) via Ollama's
   * /api/show endpoint. Cached per model name; a failed lookup is negatively
   * cached for the lifetime of this adapter instance to avoid hammering
   * /api/show on every generation.
   * @param {string} model
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ contextLength: number | null, capabilities: string[] | null } | null>}
   */
  /**
   * Fetch the local model catalog once per baseURL and cache it. This is the
   * authoritative source for both `capabilities` (a TOP-LEVEL field on each tag
   * entry) and `details.context_length`. Ollama's /api/show mirrors `capabilities`
   * at its top level too, but does NOT expose context_length under `details` on
   * newer servers, so /api/tags is the reliable single source for both.
   * @param {string} baseURL
   * @param {AbortSignal} [signal]
   * @returns {Promise<any[]>}
   */
  async #getTags(baseURL, signal) {
    if (this.#tagsCache.has(baseURL)) return this.#tagsCache.get(baseURL);
    try {
      const resp = await fetch(`${baseURL}/api/tags`, {
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      const models = resp.ok ? ((await resp.json()).models ?? []) : [];
      this.#tagsCache.set(baseURL, models);
      return models;
    } catch {
      this.#tagsCache.set(baseURL, []);
      return [];
    }
  }

  /**
   * Resolve a model's real capabilities and context length. Prefers the
   * local /api/tags catalog (authoritative for `capabilities` and
   * `details.context_length`); falls back to /api/show for entries not present
   * in the tag list (e.g. remote/registry models). Cached per model name.
   * @param {string} model
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ contextLength: number | null, capabilities: string[] | null } | null>}
   */
  async #fetchModelDetails(model, signal) {
    if (this.#detailsCache.has(model)) {
      return this.#detailsCache.get(model);
    }
    // Negative cache a failed lookup for the lifetime of this adapter instance
    // to avoid hammering the API on every generation.
    this.#detailsCache.set(model, null);
    const connection = this.#options();
    try {
      const tags = await this.#getTags(connection.baseURL, signal);
      const entry = tags.find((m) => m.name === model);
      if (entry) {
        const capabilities = Array.isArray(entry.capabilities)
          ? entry.capabilities
          : null;
        const len = entry.details?.context_length;
        const contextLength =
          typeof len === 'number' && Number.isFinite(len) && len > 0 ? len : null;
        const result = { contextLength, capabilities };
        this.#detailsCache.set(model, result);
        return result;
      }

      // Fallback: /api/show for models absent from the local tag list.
      const resp = await fetch(`${connection.baseURL}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const capabilities = Array.isArray(data.capabilities)
        ? data.capabilities
        : null;
      // Newer servers omit context_length from /api/show's details; it lives in
      // the model_info map under a key like "<family>.context_length".
      let len = null;
      const modelInfo = data.model_info ?? {};
      for (const key of Object.keys(modelInfo)) {
        if (key.endsWith('.context_length')) {
          len = Number(modelInfo[key]);
          break;
        }
      }
      const contextLength =
        typeof len === 'number' && Number.isFinite(len) && len > 0 ? len : null;
      const result = { contextLength, capabilities };
      this.#detailsCache.set(model, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Fetch the cached /api/show payload for a model. This is the authoritative
   * source for the `thinking` field (per-model reasoning-effort metadata).
   * Cached per model name; /api/show is unchanged across calls for a given
   * model, so a positive hit is reused, and a negative result is remembered.
   * @param {string} model
   * @param {AbortSignal} [signal]
   * @returns {Promise<any | null>}
   */
  async #getShow(model, signal) {
    if (this.#showCache.has(model)) return this.#showCache.get(model);
    this.#showCache.set(model, null);
    const connection = this.#options();
    try {
      const resp = await fetch(`${connection.baseURL}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      this.#showCache.set(model, data);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Build the DSH reasoning-effort capability from Ollama's /api/show
   * `thinking` field.
   *
   * Ollama declares reasoning via `thinking`:
   *   - `{ values: [false, true], default: true }` → a binary on/off model. We
   *     surface two efforts `off` and `on`; `defaultEffort` maps from
   *     `thinking.default`.
   *   - `{ values: ["low", "medium", "high"], default: "medium" }` (string
   *     levels on newer servers) → each string is exposed verbatim as an effort
   *     id; DSH passes the chosen string straight through to Ollama's `think`
   *     field.
   *
   * Any other shape (or a missing thinking block) yields undefined, meaning the
   * model exposes no native reasoning switch and the legacy `params.think`
   * fallback remains available.
   * @param {any} [thinking]
   * @returns {import('@deepseek-ai/dsh-llm').LlmModelReasoningInfo | undefined}
   */
  #buildReasoningInfo(thinking) {
    if (!thinking || !Array.isArray(thinking.values) || thinking.values.length === 0) {
      return undefined;
    }
    const values = thinking.values;
    const isBoolean = values.every((v) => typeof v === 'boolean');

    const defaultTier = { id: ReasoningEffortId('default'), name: 'Default' };

    let efforts;
    if (isBoolean) {
      efforts = [
        defaultTier,
        { id: ReasoningEffortId('off'), name: 'Off' },
        { id: ReasoningEffortId('on'), name: 'On' },
      ];
    } else {
      efforts = [
        defaultTier,
        ...values.map((v) => {
          const id = String(v);
          return { id: ReasoningEffortId(id), name: id };
        }),
      ];
    }
    return { efforts, defaultEffort: defaultTier.id };
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
      const messages = await serializeMessages(
        options.messages,
        options.system,
        this.#attachments(),
        options.signal,
      );

      // Resolve the model's real capabilities once (cached) so the request body
      // can gate tool calling and map the native reasoning switch correctly.
      const details = await this.#fetchModelDetails(options.model, options.signal);
      const capabilities = details?.capabilities;
      const canUseTools =
        Array.isArray(capabilities) && capabilities.includes('tools');
      const hasThinking =
        Array.isArray(capabilities) && capabilities.includes('thinking');

      const body = await this.#buildRequestBody(options, messages, connection, {
        canUseTools,
        hasThinking,
      });

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

  /**
   * @private Build the request body for /api/chat.
   * @param {import('@deepseek-ai/dsh-llm').LlmGenerateOptions} options
   * @param {any[]} messages
   * @param {OllamaConnectionOptions} connection
   * @param {{ canUseTools: boolean, hasThinking: boolean }} caps
   */
  #buildRequestBody(options, messages, connection, caps) {
    const body = {
      model: options.model,
      messages,
      stream: true,
    };

    // Tool calling: only send `tools` when the model actually advertises the
    // `tools` capability. Ollama rejects/ignores tools on non-tool models, so a
    // model without the capability silently omits them (no prompt fallback).
    if (caps.canUseTools && options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    // Native reasoning switch: DSH passes `options.reasoningEffort` (a
    // ReasoningEffortId whose string value is the Ollama `thinking` level).
    //   - "default" → NO `think` field sent; Ollama uses its own server default.
    //   - "off" / "on" → boolean `think` (binary models).
    //   - any verbatim level string ("low"/"medium"/"high"/...) → passed through.
    // When the model has no `thinking` capability, the legacy `params.think`
    // setting remains the fallback below.
    if (caps.hasThinking && options.reasoningEffort != null) {
      const effort = String(options.reasoningEffort);
      if (effort !== 'default') {
        body.think = effort === 'off' ? false : effort === 'on' ? true : effort;
      }
    }

    // Add sampling parameters from DSH options
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.maxTokens != null) body.num_predict = options.maxTokens;
    if (options.stop != null) body.stop = options.stop;

    // Merge Ollama-specific params from settings (overrides DSH defaults)
    const params = connection.params ?? {};
    this.#mergeParams(body, params, caps);

    return body;
  }

  /**
   * @private Merge Ollama-specific parameters into the request body.
   * @param {{ canUseTools: boolean, hasThinking: boolean }} caps
   */
  #mergeParams(body, params, caps) {
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
    // Legacy manual think toggle. Only used for models WITHOUT a native
    // `thinking` capability (those get the DSH reasoning switch instead). When a
    // native reasoning effort was already applied above, it wins; otherwise the
    // saved `params.think` setting is the explicit manual override.
    if (params.think != null && !caps.hasThinking && body.think == null) {
      body.think = params.think;
    }
    if (params.mirostat != null) body.options = { ...body.options, mirostat: params.mirostat };
    if (params.mirostat_tau != null) body.options = { ...body.options, mirostat_tau: params.mirostat_tau };
    if (params.mirostat_eta != null) body.options = { ...body.options, mirostat_eta: params.mirostat_eta };
    if (params.frequency_penalty != null) body.options = { ...body.options, frequency_penalty: params.frequency_penalty };
    if (params.presence_penalty != null) body.options = { ...body.options, presence_penalty: params.presence_penalty };
    if (params.tfs_z != null) body.options = { ...body.options, tfs_z: params.tfs_z };
    if (params.typical_p != null) body.options = { ...body.options, typical_p: params.typical_p };
    if (params.keep_alive != null) {
      const raw = String(params.keep_alive);
      body.keep_alive = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    }
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
