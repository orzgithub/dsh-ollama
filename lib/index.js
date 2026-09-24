/**
 * DeepSeek Harness plugin for Ollama native protocol.
 *
 * Uses Ollama's native /api/chat endpoint (NDJSON streaming, thinking fields,
 * native tool calling) rather than the OpenAI-compatible /v1/chat/completions.
 *
 * @module dsh-ollama
 */

import { deepEqualJson } from '@deepseek-ai/dsh-util-values';
import { OllamaAdapter } from './adapter.js';
import { Config, resolveAdapterOptions } from './config.js';

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { OllamaAdapter } from './adapter.js';
export { Config, resolveAdapterOptions } from './config.js';
export { serializeMessages, serializeAssistant, flattenContent, safeParseJson } from './serialize.js';
export { translateNdjson, mapFinishReason } from './stream.js';

// ─── Plugin Metadata ────────────────────────────────────────────────────────

export const name = 'llm-ollama';
export const inject = ['llm'];
const NS = 'llm-ollama';
const PROVIDER = 'ollama';

// ─── Plugin Registration ────────────────────────────────────────────────────

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

export { apply };
