import { useState } from "react";
import type { Entry } from "../types";
import { ChevronRight } from "lucide-react";
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
  return <ChevronRight size={12} className={`transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />;
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
    <div className="border border-gray-200 dark:border-gray-700 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-t"
      >
        <Chevron open={open} />
        <span>{title}</span>
        {badge && (
          <span className="ml-1 font-normal normal-case text-gray-400 dark:text-gray-500 text-xs">{badge}</span>
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
    <div className="border border-purple-200 dark:border-purple-800 rounded bg-purple-50/60 dark:bg-purple-950/40 mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer rounded hover:bg-purple-100/60 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-400"
      >
        <Chevron open={open} />
        <span className="text-purple-700 dark:text-purple-400 font-semibold uppercase tracking-wider">
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
    <div className="border border-gray-200 dark:border-gray-700 rounded bg-gray-50/80 dark:bg-gray-800/60 mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
      >
        <Chevron open={open} />
        <span className="text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
          Tool result
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-1 font-mono">{block.tool_use_id.slice(-8)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {contentItems === null ? (
            <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">{String(block.content ?? "null")}</span>
          ) : contentItems.length === 0 ? (
            <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">[]</span>
          ) : (
            contentItems.map((item, i) => {
              const it = item as Record<string, unknown>;
              if (it.type === "text" && typeof it.text === "string") {
                return (
                  <pre
                    key={i}
                    className="text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700 overflow-x-auto whitespace-pre-wrap break-words"
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
                  <CopyBtn text={text} className="m-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600" />
                </div>
              </div>
              <pre
                className="text-gray-800 dark:text-gray-200 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words -mt-[30px]"
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
    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    label: "USER",
    labelColor: "text-blue-600 dark:text-blue-400",
  },
  assistant: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    label: "ASSISTANT",
    labelColor: "text-emerald-700 dark:text-emerald-400",
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
        className="w-full flex items-center gap-1.5 px-4 py-3 cursor-pointer text-gray-400 dark:text-gray-500"
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
        className="w-full flex items-center gap-1.5 px-4 py-3 cursor-pointer text-gray-400 dark:text-gray-500"
      >
        <Chevron open={open} />
        <span className={`font-semibold uppercase tracking-wider ${style.labelColor}`}>
          {style.label}
        </span>
        {response.stopReason && (
          <span className="ml-2 font-normal normal-case text-gray-400 dark:text-gray-500 text-xs font-mono">
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
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
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
      <div className="font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 mx-3 mt-3 mb-2 shrink-0 flex items-center gap-3 flex-wrap">
        <span className="text-gray-700 dark:text-gray-200">{response?.model ?? req.model}</span>
        {inputTokens !== undefined && (
          <span className="text-gray-400 dark:text-gray-500">
            in: <span className="text-gray-600 dark:text-gray-300">{inputTokens.toLocaleString()}</span>
          </span>
        )}
        {outputTokens !== undefined && (
          <span className="text-gray-400 dark:text-gray-500">
            out: <span className="text-gray-600 dark:text-gray-300">{outputTokens.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Scrollable conversation area */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {/* System prompt */}
        {systemText && (
          <CollapsibleSection title="System" defaultOpen={false}>
            <div className="relative group">
              <div className="sticky top-0 flex justify-end pointer-events-none">
                <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyBtn text={systemText} className="m-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600" />
                </div>
              </div>
              <pre className="text-gray-600 dark:text-gray-300 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words -mt-[30px]">
                {systemText}
              </pre>
            </div>
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
          <div className="text-gray-400 dark:text-gray-500 text-center py-4">
            No response data available.
          </div>
        )}
      </div>
    </div>
  );
}
