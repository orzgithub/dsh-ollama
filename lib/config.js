/**
 * Configuration schema and validation for the Ollama plugin.
 *
 * @module lib/config
 */

import z from '@deepseek-ai/schemastery';
import { isVolatile } from '@deepseek-ai/cosmokit';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm';

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;
export const DEFAULT_CONTEXT_WINDOW = 131_072; // 128K, Ollama default
export const DEFAULT_MAX_TOKENS = 8192;
const MODEL_MODALITIES = ['text', 'image'];

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Zod-like schema for plugin configuration.
 *
 * Every field is marked `.volatile()`: since 0.1.7-rc.2 the settings page is
 * projected from the Loader's own configuration rather than stored in an
 * independent settings document, and only volatile fields are served to the
 * Settings/Plugins UI and accepted as writes. A volatile field is committed
 * into the running plugin's config reference in place, so an edit reaches the
 * adapter without remounting the plugin.
 */
export const Config = z.object({
  /** Ollama base URL (without trailing slash). */
  baseURL: z.string().default('http://127.0.0.1:11434').volatile(),
  /** Default context window for models that don't report one. */
  defaultContextWindow: z
    .number()
    .step(1)
    .min(1)
    .default(DEFAULT_CONTEXT_WINDOW)
    .volatile(),
  /** Default max output tokens. */
  maxTokens: z
    .number()
    .step(1)
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_MAX_TOKENS)
    .volatile(),
  /** Stream idle timeout in ms. */
  streamIdleTimeoutMs: z
    .number()
    .min(Number.MIN_VALUE)
    .max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
    .volatile(),
  /** Retry policy. */
  retryPolicy: RetryPolicySchema.volatile(),
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
    .default([])
    .volatile(),
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
    .default({})
    .volatile(),
});

// ─── Resolution ─────────────────────────────────────────────────────────────

/**
 * Read the current value behind every volatile reference of a parsed Config.
 *
 * A field the schema marks `.volatile()` does not resolve to a plain value: it
 * resolves to a cosmokit volatile reference, because the Loader commits an edit
 * into the very reference the running plugin already holds. Resolvers want
 * plain data, so unwrap those references first.
 *
 * @param {object} config - parsed plugin config
 * @returns {object} plain options
 */
export function plainOptions(config) {
  return Object.fromEntries(
    Object.entries(config ?? {}).map(([key, value]) => [
      key,
      isVolatile(value) ? value.get() : value,
    ]),
  );
}

/**
 * Resolve connection options from validated config.
 */
export function resolveAdapterOptions(config) {
  config = plainOptions(config);
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
