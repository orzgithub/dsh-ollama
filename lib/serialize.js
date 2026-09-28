/**
 * Message serialization: convert DSH message format to Ollama wire format.
 *
 * @module lib/serialize
 */

import { textOnlyImageText } from '@deepseek-ai/dsh-llm';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Flatten DSH content blocks into a single text string.
 */
export function flattenContent(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Parse a JSON string safely; returns {} on failure.
 */
export function safeParseJson(raw) {
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Base64-encode a byte array for inline transmission to Ollama.
 * Ollama accepts data buffers or base64 strings; base64 is the portable form.
 */
function toBase64(bytes) {
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback (this adapter runs server-side, but stay portable).
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Resolve one DSH image block to base64 bytes via the attachment store.
 * Returns null when the store is unavailable or the read fails, so the caller
 * can degrade to a text placeholder instead of dropping the turn.
 * @param {object} block - DSH image content block.
 * @param {object} [attachments] - DSH AttachmentStore (ctx.attachments).
 * @param {AbortSignal} [signal]
 * @returns {Promise<string | null>}
 */
async function resolveImageBase64(block, attachments, signal) {
  if (!attachments || typeof attachments.readImage !== 'function') return null;
  try {
    const stored = await attachments.readImage(block.attachment, signal);
    if (stored && stored.data) return toBase64(stored.data);
    return null;
  } catch {
    return null;
  }
}

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize one DSH assistant message into Ollama wire format.
 * Tool-call blocks become native Ollama tool_calls.
 */
export function serializeAssistant(msg) {
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
      // image, file: an assistant never carries media in Ollama
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
 * Serialize the full DSH message history into Ollama wire messages.
 * Images are resolved to inline base64 and attached to the owning user message;
 * if the bytes cannot be read, the block degrades to a stable text placeholder.
 * @param {import('@deepseek-ai/dsh-llm').Message[]} messages
 * @param {string} [system] - optional system prompt
 * @param {object} [attachments] - DSH AttachmentStore, for resolving image bytes
 * @param {AbortSignal} [signal] - cancellation for image reads
 * @returns {Promise<object[]>} Ollama wire messages
 */
export async function serializeMessages(messages, system, attachments, signal) {
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
    const images = [];
    const toolResults = [];

    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          textParts.push(block.text);
          break;
        case 'tool-result':
          toolResults.push(block);
          break;
        case 'image': {
          const b64 = await resolveImageBase64(block, attachments, signal);
          if (b64) images.push(b64);
          else textParts.push(textOnlyImageText(block.attachment));
          break;
        }
        // file: Ollama has no native file modality. The harness projects file
        // blocks to deterministic handle text before dispatch, so adapters
        // never encounter raw file bytes here.
      }
    }

    const text = textParts.join('');
    const userWire = { role: 'user', content: text };
    if (images.length > 0) userWire.images = images;

    // Emit the user message when it carries text, images, or when there are no
    // tool results to represent the turn instead.
    if (text.length > 0 || images.length > 0 || toolResults.length === 0) {
      wire.push(userWire);
    }

    // Emit each tool result as its own Ollama tool-role message.
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        content: flattenContent(result.content) || '(no output)',
      });
    }
  }

  return wire;
}
