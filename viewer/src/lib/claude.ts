import type { Entry } from "../types";

// ── Content block types ───────────────────────────────────────────────────────

export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface ClaudeImageBlock {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  // The API allows `content` to be a plain string or an array of blocks.
  content: string | unknown[];
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

// ── Message ───────────────────────────────────────────────────────────────────

export interface ClaudeMessage {
  // The API only documents "user" and "assistant", but real payloads
  // occasionally carry other roles (e.g. "system") inside the messages array.
  role: "user" | "assistant" | (string & {});
  content: string | ClaudeContentBlock[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

export interface ClaudeSystemBlock {
  type: "text";
  text: string;
}

// ── Request body ──────────────────────────────────────────────────────────────

export interface ClaudeRequestBody {
  model: string;
  // The API accepts `system` as either a plain string or an array of text blocks.
  system?: string | ClaudeSystemBlock[];
  messages: ClaudeMessage[];
  tools?: { name: string; description: string; input_schema: unknown }[];
  max_tokens: number;
  thinking?: { type: string };
  output_config?: { effort?: string };
  stream?: boolean;
}

// ── SSE event shape ───────────────────────────────────────────────────────────

interface SSEEvent {
  event?: string;
  data?: Record<string, unknown>;
}

// ── Reconstructed response ────────────────────────────────────────────────────

/** Only sent alongside a "refusal" stop reason. `category` is an open set of values. */
export interface ClaudeStopDetails {
  type?: string;
  category?: string | null;
  explanation?: string;
  [key: string]: unknown;
}

export interface ReconstructedResponse {
  model?: string;
  stopReason?: string;
  stopDetails?: ClaudeStopDetails;
  content: ClaudeContentBlock[];
  inputTokens?: number;
  outputTokens?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalInputTokens(usage: Record<string, number> | undefined): number | undefined {
  if (!usage) return undefined;
  const direct = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const total = direct + cacheRead + cacheCreate;
  return total > 0 ? total : (usage.input_tokens !== undefined ? 0 : undefined);
}

function asStopDetails(value: unknown): ClaudeStopDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as ClaudeStopDetails;
}

export function isClaudeEntry(entry: Entry): boolean {
  try {
    const pathname = new URL(entry.request.url).pathname;
    return entry.request.method === "POST" && pathname.endsWith("/v1/messages");
  } catch {
    return false;
  }
}

export function parseClaudeRequest(body: unknown): ClaudeRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.model !== "string") return null;
  if (!Array.isArray(b.messages)) return null;
  return b as unknown as ClaudeRequestBody;
}

export function getMessageContent(msg: ClaudeMessage): ClaudeContentBlock[] {
  if (typeof msg.content === "string") {
    return [{ type: "text", text: msg.content }];
  }
  return msg.content ?? [];
}

// ── SSE response reconstruction ───────────────────────────────────────────────

export function reconstructResponse(body: unknown): ReconstructedResponse | null {
  if (!body) return null;

  // Non-streaming: body is a message object
  if (!Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    if (!b.content) return null;
    const usage = b.usage as Record<string, number> | undefined;
    return {
      model: typeof b.model === "string" ? b.model : undefined,
      stopReason: typeof b.stop_reason === "string" ? b.stop_reason : undefined,
      stopDetails: asStopDetails(b.stop_details),
      content: (b.content as ClaudeContentBlock[]).filter(
        (block) => block.type !== "thinking"
      ),
      inputTokens: totalInputTokens(usage),
      outputTokens: usage?.output_tokens,
    };
  }

  // Streaming: body is an array of SSE events
  const events = body as SSEEvent[];
  const blocks: Record<number, ClaudeContentBlock> = {};
  const jsonBuffers: Record<number, string> = {};
  let model: string | undefined;
  let stopReason: string | undefined;
  let stopDetails: ClaudeStopDetails | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for (const ev of events) {
    if (!ev.data || typeof ev.data !== "object") continue;
    const d = ev.data;
    const type = d.type as string;

    if (type === "message_start") {
      const msg = d.message as Record<string, unknown> | undefined;
      if (msg) {
        if (typeof msg.model === "string") model = msg.model;
        const usage = msg.usage as Record<string, number> | undefined;
        if (usage) {
          inputTokens = totalInputTokens(usage);
        }
      }
    } else if (type === "content_block_start") {
      const index = d.index as number;
      const cb = d.content_block as Record<string, unknown>;
      const cbType = cb.type as string;
      if (cbType === "thinking" || cbType === "redacted_thinking") {
        // Thinking is never shown, so the block is dropped instead of reconstructed.
        continue;
      }
      if (cbType === "text") {
        blocks[index] = { type: "text", text: "" };
      } else if (cbType === "tool_use") {
        blocks[index] = {
          type: "tool_use",
          id: cb.id as string,
          name: cb.name as string,
          input: {},
        };
        jsonBuffers[index] = "";
      } else {
        // Any other block type (server_tool_use, web_search_tool_result, document…) is
        // kept as it arrived, so a type this viewer does not know about is still shown.
        blocks[index] = { ...cb } as unknown as ClaudeContentBlock;
        // Blocks carrying an `input` receive it through input_json_delta, like tool_use.
        if ("input" in cb) jsonBuffers[index] = "";
      }
    } else if (type === "content_block_delta") {
      const index = d.index as number;
      const delta = d.delta as Record<string, unknown>;
      const deltaType = delta.type as string;
      const block = blocks[index];
      if (!block) continue;

      if (deltaType === "text_delta" && block.type === "text") {
        block.text += (delta.text as string) ?? "";
      } else if (deltaType === "input_json_delta" && jsonBuffers[index] !== undefined) {
        jsonBuffers[index] += (delta.partial_json as string) ?? "";
      }
      // thinking_delta and signature_delta: ignored — thinking is never shown
    } else if (type === "content_block_stop") {
      const index = d.index as number;
      const block = blocks[index];
      if (block && jsonBuffers[index]) {
        const withInput = block as ClaudeToolUseBlock;
        try {
          withInput.input = JSON.parse(jsonBuffers[index]);
        } catch {
          withInput.input = jsonBuffers[index];
        }
      }
    } else if (type === "message_delta") {
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
      const details = asStopDetails(delta?.stop_details);
      if (details) stopDetails = details;
      const usage = d.usage as Record<string, number> | undefined;
      if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
    }
  }

  // Emit blocks in content-index order rather than relying on insertion order.
  const content = Object.keys(blocks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => blocks[i]);

  return { model, stopReason, stopDetails, content, inputTokens, outputTokens };
}
