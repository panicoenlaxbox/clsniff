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

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: unknown[];
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

// ── Message ───────────────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: "user" | "assistant";
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
  system?: ClaudeSystemBlock[];
  messages: ClaudeMessage[];
  tools?: { name: string; description: string; input_schema: unknown }[];
  max_tokens: number;
  thinking?: { type: string };
  stream?: boolean;
}

// ── SSE event shape ───────────────────────────────────────────────────────────

interface SSEEvent {
  event?: string;
  data?: Record<string, unknown>;
}

// ── Reconstructed response ────────────────────────────────────────────────────

export interface ReconstructedResponse {
  model?: string;
  stopReason?: string;
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
  return msg.content;
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
      content: (b.content as ClaudeContentBlock[]).filter(
        (block) => block.type !== "thinking" || !!(block as ClaudeThinkingBlock).thinking
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
      if (cbType === "text") {
        blocks[index] = { type: "text", text: "" };
      } else if (cbType === "thinking") {
        blocks[index] = { type: "thinking", thinking: "", signature: "" };
      } else if (cbType === "tool_use") {
        blocks[index] = {
          type: "tool_use",
          id: cb.id as string,
          name: cb.name as string,
          input: {},
        };
        jsonBuffers[index] = "";
      }
    } else if (type === "content_block_delta") {
      const index = d.index as number;
      const delta = d.delta as Record<string, unknown>;
      const deltaType = delta.type as string;
      const block = blocks[index];
      if (!block) continue;

      if (deltaType === "text_delta" && block.type === "text") {
        block.text += (delta.text as string) ?? "";
      } else if (deltaType === "input_json_delta" && block.type === "tool_use") {
        jsonBuffers[index] = (jsonBuffers[index] ?? "") + ((delta.partial_json as string) ?? "");
      }
      // signature_delta and thinking_delta: skip (thinking is redacted)
    } else if (type === "content_block_stop") {
      const index = d.index as number;
      const block = blocks[index];
      if (block?.type === "tool_use" && jsonBuffers[index]) {
        try {
          (block as ClaudeToolUseBlock).input = JSON.parse(jsonBuffers[index]);
        } catch {
          (block as ClaudeToolUseBlock).input = jsonBuffers[index];
        }
      }
    } else if (type === "message_delta") {
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
      const usage = d.usage as Record<string, number> | undefined;
      if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
    }
  }

  // Filter out redacted thinking blocks (empty thinking)
  const content = Object.values(blocks).filter(
    (b) => b.type !== "thinking" || !!(b as ClaudeThinkingBlock).thinking
  );

  return { model, stopReason, content, inputTokens, outputTokens };
}
