import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { ChevronRight } from "lucide-react";
import {
  parseClaudeRequest,
  reconstructResponse,
  getMessageContent,
  type ClaudeMessage,
  type ClaudeContentBlock,
  type ClaudeImageBlock,
  type ClaudeToolUseBlock,
  type ClaudeToolResultBlock,
  type ReconstructedResponse,
} from "../lib/claude";
import JsonBlock from "./JsonBlock";
import CopyBtn from "./CopyBtn";
import ToolsModal from "./ToolsModal";

export type ExpandMode = "default" | "open" | "closed";

interface Props {
  entry: Entry;
  wordWrap: boolean;
  /** Broadcast expand/collapse-all state; `signal` bumps on each toolbar click. */
  expandMode?: ExpandMode;
  expandSignal?: number;
}

// Lets the "expand/collapse all" toolbar reach every collapsible panel without
// removing each panel's own independent toggling.
const ExpandContext = createContext<{ mode: ExpandMode; signal: number }>({
  mode: "default",
  signal: 0,
});

// Collapsible state that initializes from the current broadcast mode and
// re-applies whenever the toolbar bumps `signal`, while staying independently
// toggleable in between.
function useCollapsible(defaultOpen: boolean) {
  const { mode, signal } = useContext(ExpandContext);
  const resolve = () => (mode === "open" ? true : mode === "closed" ? false : defaultOpen);
  const [open, setOpen] = useState(resolve);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setOpen(resolve());
    // Only react to explicit toolbar clicks (signal), not to unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
  return [open, setOpen] as const;
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
  const [open, setOpen] = useCollapsible(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-t-lg"
      >
        <Chevron open={open} />
        <span>{title}</span>
        {badge && (
          <span className="ml-1 font-normal normal-case text-gray-400 dark:text-gray-500 text-xs">{badge}</span>
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Tool use block ────────────────────────────────────────────────────────────

function ToolUseBlock({ block, wordWrap }: { block: ClaudeToolUseBlock; wordWrap: boolean }) {
  const [open, setOpen] = useCollapsible(false);
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
  const [open, setOpen] = useCollapsible(false);
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
        {block.tool_use_id && (
          <span className="text-gray-400 dark:text-gray-500 text-xs ml-1 font-mono">{block.tool_use_id.slice(-8)}</span>
        )}
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
                    className={`text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700 overflow-x-auto ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
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

// ── Image block ───────────────────────────────────────────────────────────────

function ImageBlock({ block }: { block: ClaudeImageBlock }) {
  const src = block.source;
  let url: string | null = null;
  if (src.type === "base64" && src.data) {
    url = `data:${src.media_type ?? "image/png"};base64,${src.data}`;
  } else if (src.type === "url" && src.url) {
    url = src.url;
  }

  if (!url) {
    return (
      <div className="text-gray-400 dark:text-gray-500 font-mono text-xs border border-gray-200 dark:border-gray-700 rounded px-3 py-2">
        [image: unsupported source]
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded bg-gray-50/60 dark:bg-gray-800/40 p-2 inline-block max-w-full">
      <img
        src={url}
        alt="message image"
        className="max-w-full max-h-[480px] rounded object-contain"
      />
    </div>
  );
}

// ── Content block renderer ────────────────────────────────────────────────────

function renderBlock(
  block: ClaudeContentBlock,
  i: number,
  wordWrap: boolean,
): React.ReactElement | null {
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
          className={`text-gray-800 dark:text-gray-200 leading-relaxed overflow-x-auto -mt-[30px] ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
        >
          {text}
        </pre>
      </div>
    );
  }
  if (block.type === "image") {
    return <ImageBlock key={i} block={block as ClaudeImageBlock} />;
  }
  if (block.type === "tool_use") {
    return <ToolUseBlock key={i} block={block as ClaudeToolUseBlock} wordWrap={wordWrap} />;
  }
  if (block.type === "tool_result") {
    return <ToolResultBlock key={i} block={block as ClaudeToolResultBlock} wordWrap={wordWrap} />;
  }
  // thinking blocks are filtered out during reconstruction and never reach here
  return null;
}

function ContentBlocks({
  blocks,
  wordWrap,
}: {
  blocks: ClaudeContentBlock[];
  wordWrap: boolean;
}) {
  const rendered = blocks
    .map((block, i) => renderBlock(block, i, wordWrap))
    .filter((el): el is React.ReactElement => el !== null);

  return (
    <div className="space-y-1">
      {rendered.map((el, i) => (
        <div
          key={el.key ?? i}
          className={i > 0 ? "pt-3 mt-3 border-t border-gray-300 dark:border-gray-600" : ""}
        >
          {el}
        </div>
      ))}
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="pt-1" aria-hidden>
      <div className="h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface RoleStyle {
  bg: string;
  label: string;
  labelColor: string;
}

const roleStyles: Record<string, RoleStyle> = {
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
  system: {
    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    label: "SYSTEM",
    labelColor: "text-amber-700 dark:text-amber-400",
  },
};

// Fallback for any role not in `roleStyles` (defensive: avoids crashing on
// unexpected roles present in real-world payloads).
function styleForRole(role: string): RoleStyle {
  return (
    roleStyles[role] ?? {
      bg: "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700",
      label: role ? role.toUpperCase() : "UNKNOWN",
      labelColor: "text-gray-600 dark:text-gray-400",
    }
  );
}

function MessageBubble({
  msg,
  wordWrap,
  defaultOpen = true,
}: {
  msg: ClaudeMessage;
  wordWrap: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useCollapsible(defaultOpen);
  const style = styleForRole(msg.role);
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
  const [open, setOpen] = useCollapsible(defaultOpen);
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

export default function ClaudeView({
  entry,
  wordWrap,
  expandMode = "default",
  expandSignal = 0,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
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

  // Context = everything before the last user message (collapsed).
  const contextMessages = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
  // Main = the last user message plus anything after it (e.g. an assistant
  // prefill). If there is no user message at all, show every message rather
  // than silently dropping them.
  const mainMessages = lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages;

  // System prompt — `system` may be a plain string or an array of blocks.
  // Normalize to content blocks so it renders with the same per-block dividers
  // and copy buttons as the rest of the messages.
  const systemBlocks: ClaudeContentBlock[] = req.system
    ? typeof req.system === "string"
      ? [{ type: "text", text: req.system }]
      : req.system.map((b) => ({ type: "text", text: b.text }))
    : [];

  // Token info
  const inputTokens = response?.inputTokens;
  const outputTokens = response?.outputTokens;

  return (
    <ExpandContext.Provider value={{ mode: expandMode, signal: expandSignal }}>
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
        {req.max_tokens !== undefined && (
          <span className="text-gray-400 dark:text-gray-500">
            max: <span className="text-gray-600 dark:text-gray-300">{req.max_tokens.toLocaleString()}</span>
          </span>
        )}
        {req.thinking?.type && (
          <span className="text-gray-400 dark:text-gray-500">
            thinking: <span className="text-gray-600 dark:text-gray-300">{req.thinking.type}</span>
          </span>
        )}
        {req.output_config?.effort && (
          <span className="text-gray-400 dark:text-gray-500">
            effort: <span className="text-gray-600 dark:text-gray-300">{req.output_config.effort}</span>
          </span>
        )}
        {req.tools && req.tools.length > 0 && (
          <button
            onClick={() => setToolsOpen(true)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors underline decoration-dotted underline-offset-2"
            title="Inspect tool definitions"
          >
            tools: <span className="text-gray-600 dark:text-gray-300">{req.tools.length}</span>
          </button>
        )}
      </div>

      {/* Scrollable conversation area */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {/* System prompt */}
        {systemBlocks.length > 0 && (
          <CollapsibleSection title="System" defaultOpen={false}>
            <ContentBlocks blocks={systemBlocks} wordWrap={wordWrap} />
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

        {/* Last user message (and any trailing prefill) */}
        {mainMessages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} wordWrap={wordWrap} />
        ))}

        {/* Assistant response */}
        {response && response.content.length > 0 && (
          <>
            {/* Response boundary */}
            <SectionDivider />
            <ResponseBubble response={response} wordWrap={wordWrap} />
          </>
        )}

        {!response && (
          <div className="text-gray-400 dark:text-gray-500 text-center py-4">
            No response data available.
          </div>
        )}
      </div>

      {toolsOpen && req.tools && (
        <ToolsModal tools={req.tools} onClose={() => setToolsOpen(false)} wordWrap={wordWrap} />
      )}
    </div>
    </ExpandContext.Provider>
  );
}
