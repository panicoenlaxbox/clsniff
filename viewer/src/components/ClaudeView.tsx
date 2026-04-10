import { useState } from "react";
import type { Entry } from "../types";
import {
  parseClaudeRequest,
  reconstructResponse,
  getMessageContent,
  type ClaudeMessage,
  type ClaudeContentBlock,
  type ClaudeToolUseBlock,
  type ClaudeToolResultBlock,
  type ReconstructedResponse,
} from "../lib/claude";
import JsonBlock from "./JsonBlock";
import CopyBtn from "./CopyBtn";

interface Props {
  entry: Entry;
  wordWrap: boolean;
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 hover:bg-gray-100 cursor-pointer rounded-t"
      >
        <Chevron open={open} />
        <span>{title}</span>
        {badge && (
          <span className="ml-1 font-normal normal-case text-gray-400 text-xs">{badge}</span>
        )}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

// ── Tool use block ────────────────────────────────────────────────────────────

function ToolUseBlock({ block, wordWrap }: { block: ClaudeToolUseBlock; wordWrap: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-purple-200 rounded bg-purple-50/60 mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer rounded hover:bg-purple-100/60"
      >
        <Chevron open={open} />
        <span className="text-purple-700 font-semibold uppercase tracking-wider">
          {block.name}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <JsonBlock data={block.input} wordWrap={wordWrap} />
        </div>
      )}
    </div>
  );
}

// ── Tool result block ─────────────────────────────────────────────────────────

function ToolResultBlock({ block, wordWrap }: { block: ClaudeToolResultBlock; wordWrap: boolean }) {
  const [open, setOpen] = useState(false);
  const contentItems = Array.isArray(block.content) ? block.content : null;
  return (
    <div className="border border-gray-200 rounded bg-gray-50/80 mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer rounded hover:bg-gray-100"
      >
        <Chevron open={open} />
        <span className="text-gray-500 font-semibold uppercase tracking-wider">
          Tool result
        </span>
        <span className="text-gray-400 text-xs ml-1 font-mono">{block.tool_use_id.slice(-8)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {contentItems === null ? (
            <span className="text-gray-400 font-mono text-xs">{String(block.content ?? "null")}</span>
          ) : contentItems.length === 0 ? (
            <span className="text-gray-400 font-mono text-xs">[]</span>
          ) : (
            contentItems.map((item, i) => {
              const it = item as Record<string, unknown>;
              if (it.type === "text" && typeof it.text === "string") {
                return (
                  <pre
                    key={i}
                    className="text-gray-700 bg-white rounded p-2 border border-gray-100 overflow-x-auto whitespace-pre-wrap break-words"
                  >
                    {it.text}
                  </pre>
                );
              }
              return <JsonBlock key={i} data={item} wordWrap={wordWrap} />;
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Content block renderer ────────────────────────────────────────────────────

function ContentBlocks({
  blocks,
  wordWrap,
}: {
  blocks: ClaudeContentBlock[];
  wordWrap: boolean;
}) {
  return (
    <div className="space-y-1">
      {blocks.map((block, i) => {
        if (block.type === "text") {
          const text = block.text;
          if (!text) return null;
          return (
            <div key={i} className="relative group">
              <div className="sticky top-0 flex justify-end pointer-events-none">
                <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyBtn text={text} className="m-1 bg-white shadow-sm border border-gray-200" />
                </div>
              </div>
              <pre
                className="text-gray-800 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words -mt-[30px]"
              >
                {text}
              </pre>
            </div>
          );
        }
        if (block.type === "tool_use") {
          return <ToolUseBlock key={i} block={block as ClaudeToolUseBlock} wordWrap={wordWrap} />;
        }
        if (block.type === "tool_result") {
          return <ToolResultBlock key={i} block={block as ClaudeToolResultBlock} wordWrap={wordWrap} />;
        }
        // thinking: skip (redacted)
        return null;
      })}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

const roleStyles = {
  user: {
    bg: "bg-blue-50 border-blue-200",
    label: "USER",
    labelColor: "text-blue-600",
  },
  assistant: {
    bg: "bg-emerald-50 border-emerald-200",
    label: "ASSISTANT",
    labelColor: "text-emerald-700",
  },
} as const;

function MessageBubble({
  msg,
  wordWrap,
  defaultOpen = true,
}: {
  msg: ClaudeMessage;
  wordWrap: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const style = roleStyles[msg.role];
  const blocks = getMessageContent(msg);
  return (
    <div className={`rounded-lg border ${style.bg}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-4 py-3 cursor-pointer"
      >
        <Chevron open={open} />
        <span className={`font-semibold uppercase tracking-wider ${style.labelColor}`}>
          {style.label}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <ContentBlocks blocks={blocks} wordWrap={wordWrap} />
        </div>
      )}
    </div>
  );
}

// ── Response bubble ───────────────────────────────────────────────────────────

function ResponseBubble({
  response,
  wordWrap,
  defaultOpen = true,
}: {
  response: ReconstructedResponse;
  wordWrap: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const style = roleStyles.assistant;
  return (
    <div className={`rounded-lg border ${style.bg}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-4 py-3 cursor-pointer"
      >
        <Chevron open={open} />
        <span className={`font-semibold uppercase tracking-wider ${style.labelColor}`}>
          {style.label}
        </span>
        {response.stopReason && (
          <span className="ml-2 font-normal normal-case text-gray-400 text-xs font-mono">
            {`{ stop_reason: "${response.stopReason}" }`}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3">
          <ContentBlocks blocks={response.content} wordWrap={wordWrap} />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClaudeView({ entry, wordWrap }: Props) {
  const req = parseClaudeRequest(entry.request.body);
  const response = reconstructResponse(entry.response.body);

  if (!req) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Unable to parse Claude API request body.
      </div>
    );
  }

  const messages = req.messages ?? [];

  // Separate: all but last user message → context, last user message → main, response → main
  // Find the last user message index
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  const contextMessages = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
  const lastUserMessage = lastUserIdx >= 0 ? messages[lastUserIdx] : null;

  // System prompt text
  const systemText = req.system
    ? req.system.map((b) => b.text).join("\n\n")
    : null;

  // Token info
  const inputTokens = response?.inputTokens;
  const outputTokens = response?.outputTokens;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Metadata bar */}
      <div className="font-mono text-gray-500 bg-gray-50 rounded px-3 py-2 mx-3 mt-3 mb-2 shrink-0 flex items-center gap-3 flex-wrap">
        <span className="text-gray-700">{response?.model ?? req.model}</span>
        {inputTokens !== undefined && (
          <span className="text-gray-400">
            in: <span className="text-gray-600">{inputTokens.toLocaleString()}</span>
          </span>
        )}
        {outputTokens !== undefined && (
          <span className="text-gray-400">
            out: <span className="text-gray-600">{outputTokens.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Scrollable conversation area */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {/* System prompt */}
        {systemText && (
          <CollapsibleSection title="System"  defaultOpen={false}>
            <pre
              className="text-gray-600 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words"
            >
              {systemText}
            </pre>
          </CollapsibleSection>
        )}

        {/* Previous context messages */}
        {contextMessages.length > 0 && (
          <CollapsibleSection
            title="Previous context"
            badge={`${contextMessages.length}`}
            defaultOpen={false}
          >
            <div className="space-y-2">
              {contextMessages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} wordWrap={wordWrap} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Last user message */}
        {lastUserMessage && (
          <MessageBubble msg={lastUserMessage} wordWrap={wordWrap} />
        )}

        {/* Assistant response */}
        {response && response.content.length > 0 && (
          <ResponseBubble response={response} wordWrap={wordWrap} />
        )}

        {!response && (
          <div className="text-gray-400 text-center py-4">
            No response data available.
          </div>
        )}
      </div>
    </div>
  );
}
