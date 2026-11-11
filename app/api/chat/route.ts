// The server side of the page. The browser sends the conversation; this adds the
// instructions, asks Claude, and streams the reply back. The API key never leaves here.
// Nothing people type is stored or logged.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { replySchema } from "@/lib/replySchema";

export const maxDuration = 60; // seconds; a long options reply takes well under this

const MODEL = "claude-sonnet-5-5";
const EFFORT = "low"; // how much Claude thinks before replying (see scripts/eval)
const MAX_REPLY_TOKENS = 4000; // generous, so options replies aren't cut off mid-way

// Safeguards on what the browser can send
const MAX_MESSAGES = 41; // about 20 back-and-forths
const MAX_USER_CHARS = 8000; // one message from the page (typed text plus the "You've said" list)
const MAX_ASSISTANT_CHARS = 20000; // one earlier reply, sent back as context
const MAX_TOTAL_CHARS = 60000; // the whole conversation

const INSTRUCTIONS = fs.readFileSync(path.join(process.cwd(), "lib", "instructions.md"), "utf8").trim();

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Turn = { role: "user" | "assistant"; content: string };

function fail(status: number, code: string) {
  return Response.json({ error: code }, { status });
}

function check(body: unknown): Turn[] | string {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return "bad_request";
  if (messages.length > MAX_MESSAGES) return "too_long";
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as Turn;
    const role = i % 2 === 0 ? "user" : "assistant"; // must alternate, starting with the person
    if (!m || m.role !== role || typeof m.content !== "string" || !m.content.trim()) return "bad_request";
    if (m.content.length > (role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return "too_long";
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return "too_long";
  if (messages[messages.length - 1].role !== "user") return "bad_request";
  return messages as Turn[];
}

export async function POST(request: Request) {
  // Only answer requests from this site's own page.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return fail(403, "forbidden");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const turns = check(body);
  if (typeof turns === "string") return fail(turns === "too_long" ? 413 : 400, turns);

  // Mark the instructions and the conversation so far for caching, so re-reading them is cheap.
  const messages: Anthropic.MessageParam[] = turns.map((t, i) =>
    i === turns.length - 1
      ? { role: t.role, content: [{ type: "text", text: t.content, cache_control: { type: "ephemeral" } }] }
      : { role: t.role, content: t.content },
  );

  // Test runs only (scripts/eval): on your Mac, a header can change how much Claude thinks.
  // Ignored on the live site.
  // The live setting is low effort: chosen 5 Nov 2026 by the quality-vs-wait test (options in about 7s
  // instead of 16s, no loss on the checks, preferred in 3 of 4 side-by-side pairs).
  // "default" lets Claude decide how much to think.
  const setting = (process.env.NODE_ENV === "production" ? null : request.headers.get("x-eval-setting")) || EFFORT;
  const effort = setting === "low" || setting === "medium" || setting === "high" ? setting : undefined;

  const started = Date.now();
  let firstText = 0;
  let stream;
  try {
    stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_REPLY_TOKENS,
        system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { format: { type: "json_schema", schema: replySchema }, ...(effort ? { effort } : {}) },
        ...(setting === "off" ? { thinking: { type: "between_tools" as const } } : {}),
      },
      { signal: request.signal }, // if the person taps Stop, stop paying for the reply
    );
    // Wait for the reply to start, so errors (no credit, too busy) come back as a proper status.
    await stream.withResponse();
  } catch (e) {
    return fail(...describe(e));
  }

  // Send the reply on as it's written: one line of JSON per piece.
  const encoder = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (!firstText) firstText = Date.now() - started;
            send({ type: "text", text: event.delta.text });
          }
        }
        const final = await stream.finalMessage();
        // Timings and token counts only (no content), to see where the wait and the cost go.
        const u = final.usage;
        console.log(
          `Reply: first words after ${(firstText / 1000).toFixed(1)}s, finished after ${((Date.now() - started) / 1000).toFixed(1)}s.`,
          `Tokens: ${u.output_tokens} written (${u.output_tokens_details?.thinking_tokens ?? 0} of them thinking),`,
          `${u.cache_read_input_tokens ?? 0} re-read from cache, ${u.cache_creation_input_tokens ?? 0} cached, ${u.input_tokens} new.`,
        );
        send({
          type: "end",
          stop: final.stop_reason,
          firstMs: firstText,
          totalMs: Date.now() - started,
          tokens: { written: u.output_tokens, thinking: u.output_tokens_details?.thinking_tokens ?? 0 },
        });
      } catch (e) {
        if (!request.signal.aborted) send({ type: "error", error: describe(e)[1] });
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Turn an error from the API into a short code the page understands.
// Only the status and type are logged, never what anyone typed.
function describe(e: unknown): [number, string] {
  if (e instanceof Anthropic.APIError) {
    // The API's own explanation (e.g. "credit balance too low") never contains what people typed.
    const detail = (e.error as { error?: { type?: string; message?: string } })?.error;
    console.error("Claude API error", e.status, detail?.type, "-", String(detail?.message ?? "").slice(0, 200));
    const msg = String(e.message || "").toLowerCase();
    if (e.status === 429) return [429, "rate_limited"];
    if (e.status === 529 || e.status === 503) return [503, "busy"];
    if (msg.includes("credit") || msg.includes("spend") || msg.includes("billing")) return [503, "unavailable"];
    if (e.status === 401 || e.status === 403) return [503, "unavailable"];
    return [502, "upstream_error"];
  }
  console.error("Chat route error", e instanceof Error ? e.name : typeof e);
  return [500, "upstream_error"];
}
