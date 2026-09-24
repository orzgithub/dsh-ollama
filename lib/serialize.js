/**
 * Message serialization: convert DSH message format to Ollama wire format.
 *
 * @module lib/serialize
 */

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
 * Serialize the full DSH message history into Ollama wire messages.
 * @param {import('@deepseek-ai/dsh-llm').Message[]} messages
 * @param {string} [system] - optional system prompt
 * @returns {object[]} Ollama wire messages
 */
export function serializeMessages(messages, system) {
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
