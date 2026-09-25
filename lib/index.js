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
import { resolveAdapterOptions } from './config.js';

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
  const current = () => config;
  let lastRaw;
  let lastGood;
  // Volatile settings are committed into `config` *in place*, so object identity
  // alone cannot tell a resolved options snapshot apart from a stale one.
  let revision = 0;
  let lastRevision = -1;

  const options = () => {
    const raw = current();
    if (raw === lastRaw && revision === lastRevision && lastGood !== void 0) return lastGood;
    try {
      const next = resolveAdapterOptions(raw);
      lastRaw = raw;
      lastRevision = revision;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      lastRevision = revision;
      ctx.logger.error(
        'llm-ollama: keeping the last good configuration after an invalid settings value',
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };

  // Validate once at startup
  options();

  const adapter = new OllamaAdapter(options);

  // The settings namespace is the Loader profile entry id that carries this plugin.
  const settingsNs = ctx.fiber?.entry?.options?.id ?? NS;

  // Register as a configurable provider
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: 'Ollama',
      settingsNs,
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

  // Since 0.1.7-rc.2 the settings service projects the Loader's own configuration
  // instead of keeping an independent settings document, so there is nothing to
  // install. A plugin that ships its own page only has to say so: `auto: false`
  // suppresses the auto-generated form, and the browser half owns the page.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
  });

  // A volatile edit is applied to `config` in place and then announced, so the
  // retry-policy registration can follow the new value without a remount.
  ctx.on('loader/volatile-update', () => {
    revision += 1;
    ensureRegistrationFacts();
  });

  ctx.logger.info(`llm-ollama: registered provider "${PROVIDER}" at ${options().baseURL}`);
}

export { apply };
