/**
 * NDJSON stream translation: convert Ollama streaming responses to DSH StreamChunks.
 *
 * @module lib/stream
 */

import { LlmError, EMPTY_RESPONSE_CODE } from '@deepseek-ai/dsh-llm';
import { brandString } from '@deepseek-ai/dsh-brand';

// ─── Finish Reason Mapping ─────────────────────────────────────────────────

/**
 * Map an Ollama done_reason to a DSH FinishReason.
 */
export function mapFinishReason(reason) {
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

// ─── Stream Parser ──────────────────────────────────────────────────────────

/**
 * Parse NDJSON lines from an Ollama streaming response and yield DSH
 * StreamChunks. Each line is a JSON object; the final line has done=true.
 *
 * @param {ReadableStream<Uint8Array>} body - the response body
 * @param {AbortSignal} signal - abort signal
 * @param {Function} onActivity - heartbeat callback for idle watchdog
 * @yields {import('@deepseek-ai/dsh-llm').StreamChunk}
 */
export async function* translateNdjson(body, signal, onActivity) {
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
