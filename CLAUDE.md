# clsniff — development notes

## Architecture

`src/cli.ts` — argument parsing, child process launch, env var injection  
`src/proxy.ts` — MITM proxy setup, request/response capture, JSON output

## Design decisions

### `NODE_USE_ENV_PROXY` is intentionally not injected

Injecting `NODE_USE_ENV_PROXY=1` would make Node.js's native `fetch()` (undici) route traffic through the proxy — which sounds useful, but enabling it activates undici's HTTP/2 proxy mode, which is incompatible with the HTTP/1.1-only MITM proxy. The connection fails.

SDK-based clients (Anthropic, OpenAI, etc.) handle `HTTPS_PROXY` natively over HTTP/1.1 and work without this variable. Don't add it.

### The proxy is HTTP/1.1 only

`http-mitm-proxy` operates over HTTP/1.1. To handle clients that offer HTTP/2 via ALPN, `_createHttpsServer` is patched with an `ALPNCallback` that forces `http/1.1` (or `http/1.0` as fallback). If the client offers only `h2` with no HTTP/1.1 fallback (rare), TLS completes but the connection fails at the framing level.

On the outbound side, the proxy also connects to the origin server over HTTP/1.1. Almost all servers support HTTP/1.1 as a fallback.

### `http-mitm-proxy` does not handle `EADDRINUSE`

The library creates `httpServer` internally and does not register an error handler on it. A port conflict would surface as an `uncaughtException`. To avoid this, `startProxy()` pre-checks port availability with a temporary socket before calling `proxy.listen()` — but only when an explicit `--port` is passed (port `0` lets the OS pick a free one, so no check needed).

### IPv4 loopback is explicit

The proxy binds to `127.0.0.1` explicitly (not `localhost`) to avoid IPv6/IPv4 mismatches on Windows, where `localhost` may resolve to `::1`.
