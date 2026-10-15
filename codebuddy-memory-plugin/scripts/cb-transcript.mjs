/**
 * CodeBuddy transcript reading, on top of the shared capture utilities.
 *
 * CodeBuddy hands a hook one of two shapes, and both have to end up as the same
 * `{ role, content }` entries:
 *
 *   - a JSONL of Anthropic-style messages (older builds, and the Copilot-hosted
 *     CLIs), and
 *   - the history index newer IDE builds write: `index.json` lists the message
 *     ids in order while the sibling `messages/<id>.json` files carry each
 *     payload, itself a JSON string under `message`. The index has no content of
 *     its own, so it is reassembled by id before any turn becomes visible.
 *
 * The second shape is why `parseTranscript` may need the transcript path: the
 * id lookup is relative to it.
 *
 * Blocks still differ from the shape `capture-utils` walks in one way that
 * matters: a `tool_result` nests its output in a content array of text blocks
 * and names the call it answers by id rather than by name. Normalising that is
 * all this harness needs of its own — the block walking, the part building and
 * the capture filter are shared.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  collectToolNamesByIdFromEntries,
  extractPartsFromPayload,
  normalizeCaptureRole,
} from "./shared/capture-utils.mjs";

// Named one by one rather than re-exported wholesale: this module has an
// `extractCaptureTurns` of its own, and `export *` would let the shared one
// through under the same name with nothing to say which a caller holds.
export { sanitizeCapturedText } from "./shared/capture-utils.mjs";

// Tool output retention in the per-turn *text*. 0 = drop it: the extraction
// signal lives in the agent's prose about what happened, not in the raw bytes a
// tool returned (file contents, web pages, command stdout), and the output
// still travels verbatim in the turn's tool part. Operators who want
// replay-style archives can set this above zero.
const TOOL_RESULT_MAX_CHARS = 0;

/** True when a parsed transcript is the history index instead of a message list. */
function isHistoryIndex(data) {
  return Boolean(data)
    && typeof data === "object"
    && !Array.isArray(data)
    && Array.isArray(data.messages);
}

/**
 * Unwrap one `messages/<id>.json` payload.
 *
 * The file wraps the Anthropic-shaped message in a JSON *string* under
 * `message`, so it is parsed twice; anything unreadable is dropped rather than
 * failing the whole capture.
 */
function readIndexMessage(messagesDir, id) {
  let record;
  try {
    record = JSON.parse(readFileSync(join(messagesDir, `${id}.json`), "utf-8"));
  } catch {
    return null;
  }
  let payload = record?.message;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  return { role: payload.role || record.role, content: payload.content };
}

/**
 * CodeBuddy's transcript is JSONL, a single JSON array, or a history index.
 *
 * `transcriptPath` is only consulted for the index shape, where the message
 * bodies live in a `messages/` directory beside the index file.
 */
export function parseTranscript(content, { transcriptPath = "" } = {}) {
  let data;
  try {
    data = JSON.parse(content);
  } catch { /* not JSON — fall through to JSONL */ }

  if (Array.isArray(data)) return data;

  if (isHistoryIndex(data)) {
    // Some builds inline the payloads; when they do, the index is already the
    // message list. Otherwise every body comes from the sibling directory.
    const inline = data.messages.filter(
      (entry) => entry && (entry.content !== undefined || entry.message !== undefined),
    );
    if (inline.length > 0) return inline;
    if (!transcriptPath) return [];
    const messagesDir = join(dirname(transcriptPath), "messages");
    return data.messages
      .map((entry) => (entry?.id ? readIndexMessage(messagesDir, entry.id) : null))
      .filter(Boolean);
  }

  const messages = [];
  for (const line of String(content || "").split("\n")) {
    if (!line.trim()) continue;
    try { messages.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return messages;
}

function extractToolResultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

// Results land in a separable tool_output field and are reported verbatim — the
// server externalizes anything oversized and leaves a stub plus tool_output_ref,
// so this cap only guards against pathological payloads.
function truncateToolOutput(text, cfg) {
  const value = typeof text === "string" ? text : String(text ?? "");
  const max = cfg.captureToolMaxChars;
  if (!(max > 0) || value.length <= max) return value;
  return `${value.slice(0, max)}\n... [truncated, ${value.length - max} more chars]`;
}

function truncateToolResult(text) {
  if (TOOL_RESULT_MAX_CHARS <= 0) return null;
  const value = typeof text === "string" ? text : String(text ?? "");
  if (value.length <= TOOL_RESULT_MAX_CHARS) return value;
  return `${value.slice(0, TOOL_RESULT_MAX_CHARS)}\n... [truncated, ${value.length - TOOL_RESULT_MAX_CHARS} more chars]`;
}

// Tool inputs are agent-authored. They stay verbatim — usually short (URLs,
// paths, queries), and a pathologically long one is itself signal.
function formatToolInput(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeBlock(block, cfg) {
  if (!block || typeof block !== "object" || block.type !== "tool_result") return block;
  return {
    type: "tool_result",
    tool_use_id: block.tool_use_id,
    output: truncateToolOutput(extractToolResultText(block.content), cfg),
    is_error: Boolean(block.is_error),
  };
}

function normalizeMessage(message, cfg) {
  if (!message || typeof message !== "object") return null;
  let role = message.role;
  let content;
  if (message.content !== undefined) {
    content = message.content;
  } else if (message.message && typeof message.message === "object") {
    role = message.message.role || role;
    content = message.message.content;
  }
  return {
    role,
    content: Array.isArray(content)
      ? content.map((block) => normalizeBlock(block, cfg))
      : content,
  };
}

// The text the capture heuristics read: tool calls inlined with their input,
// tool results per TOOL_RESULT_MAX_CHARS.
function textFromParts(parts) {
  const chunks = [];
  for (const part of parts) {
    if (part.type !== "tool") {
      chunks.push(part.text);
    } else if (part.tool_status === "running") {
      chunks.push(`[tool: ${part.tool_name || "unknown"}]\n${formatToolInput(part.tool_input)}`);
    } else {
      const retained = truncateToolResult(part.tool_output);
      if (retained) chunks.push(`[tool result]\n${retained}`);
    }
  }
  return chunks.join("\n\n").trim();
}

/**
 * Every user/assistant turn in the transcript, in order.
 *
 * Turns carrying no structured part are dropped; the rest keep their index, so
 * a caller can treat the position of a turn as a durable cursor.
 */
export function extractCaptureTurns(messages, cfg = {}) {
  const payloads = (messages || []).map((message) => normalizeMessage(message, cfg));
  const toolNameById = collectToolNamesByIdFromEntries(payloads.filter(Boolean));
  const turns = [];
  for (const payload of payloads) {
    const role = payload && normalizeCaptureRole(payload.role);
    if (!role) continue;
    // Output was capped in normalizeBlock; capping it again here would eat the
    // "[truncated, N more chars]" note that cap just appended.
    const parts = extractPartsFromPayload(payload, { toolMaxChars: Infinity, toolNameById });
    if (parts.length === 0) continue;
    turns.push({ role, text: textFromParts(parts), parts });
  }
  return turns;
}
