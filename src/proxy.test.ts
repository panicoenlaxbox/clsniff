import { describe, it, expect } from "vitest";
import { maskHeaders, parseBody, parseSseEvents, mergeSseBody } from "./proxy.js";

describe("maskHeaders", () => {
  it("returns headers unchanged when mask list is empty", () => {
    const headers = { authorization: "Bearer token", "content-type": "application/json" };
    expect(maskHeaders(headers, [])).toBe(headers);
  });

  it("masks specified header (case-insensitive match)", () => {
    const headers = { Authorization: "Bearer secret" };
    expect(maskHeaders(headers, ["authorization"])).toEqual({ Authorization: "***" });
  });

  it("masks header when mask list uses different casing", () => {
    const headers = { "x-api-key": "abc123" };
    expect(maskHeaders(headers, ["X-API-KEY"])).toEqual({ "x-api-key": "***" });
  });

  it("preserves non-masked headers", () => {
    const headers = { authorization: "secret", "content-type": "application/json" };
    const result = maskHeaders(headers, ["authorization"]);
    expect(result.authorization).toBe("***");
    expect(result["content-type"]).toBe("application/json");
  });

  it("masks multiple headers at once", () => {
    const headers = { authorization: "s1", "x-api-key": "s2", host: "example.com" };
    const result = maskHeaders(headers, ["authorization", "x-api-key"]);
    expect(result.authorization).toBe("***");
    expect(result["x-api-key"]).toBe("***");
    expect(result.host).toBe("example.com");
  });
});

describe("parseBody", () => {
  it("returns null for empty string", () => {
    expect(parseBody("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseBody("   \n  ")).toBeNull();
  });

  it("returns parsed object for valid JSON", () => {
    expect(parseBody('{"ok":true}')).toEqual({ ok: true });
  });

  it("returns raw string for invalid JSON", () => {
    expect(parseBody("not json at all")).toBe("not json at all");
  });

  it("returns parsed array for JSON array", () => {
    expect(parseBody("[1,2,3]")).toEqual([1, 2, 3]);
  });
});

describe("parseSseEvents", () => {
  it("parses a single event with event and data fields", () => {
    const raw = "event: message\ndata: hello\n\n";
    expect(parseSseEvents(raw)).toEqual([{ event: "message", data: "hello" }]);
  });

  it("parses multiple events separated by blank lines", () => {
    const raw = "data: first\n\ndata: second\n\n";
    expect(parseSseEvents(raw)).toEqual([{ data: "first" }, { data: "second" }]);
  });

  it("JSON-parses data payloads automatically", () => {
    const raw = 'data: {"type":"ping"}\n\n';
    expect(parseSseEvents(raw)).toEqual([{ data: { type: "ping" } }]);
  });

  it("concatenates multi-line data with newline separator", () => {
    const raw = "data: line1\ndata: line2\n\n";
    const events = parseSseEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2");
  });

  it("captures id field", () => {
    const raw = "id: 42\ndata: payload\n\n";
    expect(parseSseEvents(raw)).toEqual([{ id: "42", data: "payload" }]);
  });

  it("skips empty blocks", () => {
    const raw = "\n\ndata: only\n\n\n\n";
    expect(parseSseEvents(raw)).toEqual([{ data: "only" }]);
  });

  it("returns empty array for blank input", () => {
    expect(parseSseEvents("")).toEqual([]);
    expect(parseSseEvents("\n\n")).toEqual([]);
  });
});

describe("mergeSseBody", () => {
  it("concatenates Anthropic content_block_delta events", () => {
    const events = [
      { event: "content_block_delta", data: { type: "content_block_delta", delta: { text: "Hello" } } as unknown as string },
      { event: "content_block_delta", data: { type: "content_block_delta", delta: { text: " world" } } as unknown as string },
    ];
    expect(mergeSseBody(events)).toBe("Hello world");
  });

  it("concatenates plain string data events", () => {
    const events = [{ data: "foo" }, { data: "bar" }];
    expect(mergeSseBody(events)).toBe("foobar");
  });

  it("skips [DONE] sentinel", () => {
    const events = [{ data: "text" }, { data: "[DONE]" }];
    expect(mergeSseBody(events)).toBe("text");
  });

  it("skips events with no data field", () => {
    const events = [{ event: "ping" }, { data: "real" }];
    expect(mergeSseBody(events)).toBe("real");
  });

  it("returns empty string for empty events array", () => {
    expect(mergeSseBody([])).toBe("");
  });
});
