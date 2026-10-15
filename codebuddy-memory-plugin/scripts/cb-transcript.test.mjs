import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractCaptureTurns, parseTranscript } from "./cb-transcript.mjs";

/**
 * Write one history-index transcript — the shape newer CodeBuddy IDE builds hand
 * to the Stop hook — and return the path of its `index.json`.
 */
async function writeIndexTranscript(root, entries) {
  const dir = join(root, "history", "session");
  await mkdir(join(dir, "messages"), { recursive: true });
  for (const entry of entries) {
    await writeFile(
      join(dir, "messages", `${entry.id}.json`),
      JSON.stringify({
        role: entry.role,
        // The body ships as a JSON string under `message`, so it is doubly encoded.
        message: JSON.stringify({ role: entry.role, content: entry.content }),
      }),
    );
  }
  await writeFile(
    join(dir, "index.json"),
    JSON.stringify({
      messages: entries.map((entry) => ({
        id: entry.id,
        type: "text",
        role: entry.role,
        isComplete: true,
      })),
      requests: [{ id: "req1", type: "craft", messages: entries.map((entry) => entry.id) }],
    }),
  );
  return join(dir, "index.json");
}

test("history index transcripts are reassembled from the sibling messages directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "cb-transcript-index-"));
  const indexPath = await writeIndexTranscript(root, [
    { id: "m1", role: "user", content: [{ type: "text", text: "please remember I prefer tabs" }] },
    {
      id: "m2",
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "read_file", input: { path: "a.md" } }],
    },
  ]);

  const content = await readFile(indexPath, "utf-8");
  const messages = parseTranscript(content, { transcriptPath: indexPath });
  assert.equal(messages.length, 2);

  const turns = extractCaptureTurns(messages, {});
  assert.deepEqual(turns.map((turn) => turn.role), ["user", "assistant"]);
  assert.match(turns[0].text, /prefer tabs/);
  assert.ok(
    turns[1].parts.some((part) => part.type === "tool" && part.tool_name === "read_file"),
    "the assistant turn must keep its tool call",
  );
});

test("a history index without the transcript path cannot resolve its bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "cb-transcript-nopath-"));
  const indexPath = await writeIndexTranscript(root, [
    { id: "m1", role: "user", content: [{ type: "text", text: "hello" }] },
  ]);

  const content = await readFile(indexPath, "utf-8");
  assert.deepEqual(parseTranscript(content), []);
});

test("JSONL transcripts still parse", () => {
  const content = [
    JSON.stringify({ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }),
    JSON.stringify({ type: "message", role: "assistant", content: [{ type: "text", text: "hello" }] }),
  ].join("\n");

  const turns = extractCaptureTurns(parseTranscript(content), {});
  assert.deepEqual(turns.map((turn) => turn.role), ["user", "assistant"]);
});
