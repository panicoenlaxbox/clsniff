export type ContentLang = "json" | "markup" | "text";

export function detectLanguage(text: string): ContentLang {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "markup";
  return "text";
}
