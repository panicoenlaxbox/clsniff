# clsniff

[![CI](https://github.com/panicoenlaxbox/clsniff/actions/workflows/ci.yml/badge.svg)](https://github.com/panicoenlaxbox/clsniff/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/clsniff)](https://www.npmjs.com/package/clsniff)
[![license](https://img.shields.io/npm/l/clsniff)](https://opensource.org/licenses/MIT)
[![node](https://img.shields.io/node/v/clsniff)](https://nodejs.org/)

A zero-configuration HTTP/HTTPS traffic sniffer for command-line tools.

Wrap any command with `clsniff` and every HTTP/HTTPS request it makes will be captured and saved to a JSON file — including full request/response headers, bodies, and SSE streaming events.

Certificates are generated automatically on the first run. No external tools required.

## How it works

`clsniff` starts a local MITM (Man-In-The-Middle) proxy on a random port and launches your command as a child process with [environment variables injected](#environment-variables) so it routes traffic through the proxy and trusts its CA certificate.

When a request passes through the proxy, `clsniff`:

1. Captures the full request (method, URL, headers, body)
2. Forwards it to the real server without modification
3. Captures the full response (status, headers, body or SSE events)
4. Forwards the response to the child process without modification
5. Writes a JSON file with both sides of the exchange

The child process is completely unaware of the interception. Its `stdin`, `stdout`, and `stderr` are passed through directly.

## Getting started

Requires Node.js 22 or later.

```bash
# Run without installing
npx -y clsniff --merge-sse claude

# Or install globally
npm install -g clsniff
clsniff --merge-sse claude
```

Intercepted requests are saved to `~/.clsniff/logs/` as numbered JSON files, one per request/response pair.

## Usage

```
clsniff [options] -- <command> [args...]
```

The `--` separator is required to separate `clsniff` options from the wrapped command.

### Options

| Flag | Description | Default |
|---|---|---|
| `--merge-sse` | Merge SSE event data into a single body string. Understands the Anthropic API streaming format (`content_block_delta`) natively; falls back to plain string concatenation for other providers. | (disabled — keeps events as array) |
| `--output-dir <path>` | Directory where session log folders are created | `~/.clsniff/logs` |
| `--name <name>` | Name for the session folder instead of the auto-generated timestamp | (timestamp) |
| `--port <number>` | Port for the local proxy (0 = OS auto-assign) | `0` |
| `--mask-headers <names>` | Comma-separated header names to redact in JSON output. Can be repeated. | (none) |
| `--filter <pattern>` | Only log requests whose URL matches this regex. Can be repeated (OR logic). | (log all) |
| `--exclude <pattern>` | Never log requests whose URL matches this regex. Can be repeated. Takes precedence over `--filter`. | (none) |

## Examples

**Intercept all traffic:**
```bash
clsniff -- claude
```

**Redact the API key and merge SSE into a single body:**
```bash
clsniff --mask-headers "authorization" --merge-sse -- claude
```

**Filter to API calls only, exclude SDK:**
```bash
clsniff --filter "anthropic\.com" --exclude "anthropic\.com/api/eval/sdk-" -- claude
```

## Output format

Each `clsniff` invocation creates a new timestamped folder under `~/.clsniff/logs/` (one folder per run):

```
~/.clsniff/logs/
  2026-04-07T14-30-00-000Z/
    0001.json
    0002.json
    0003.json
    clsniff.log
```

`clsniff.log` contains timestamped internal messages useful for diagnosing interception issues (proxy errors, TLS failures, which domains were intercepted).

Each JSON file contains one request/response pair:

```json
{
  "id": 20,
  "timestamp": "2026-04-07T14:53:19.651Z",
  "duration_ms": 1936,
  "request": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages?beta=true",
    "headers": {
      "authorization": "Bearer sk-ant-...",
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "user-agent": "claude-cli/2.1.92 (external, cli)"
    },
    "body": {
      "model": "claude-sonnet-4-6",
      "stream": true,
      "messages": [
        { "role": "user", "content": "Hello" }
      ]
    }
  },
  "response": {
    "status": 200,
    "headers": {
      "content-type": "text/event-stream; charset=utf-8",
      "request-id": "req_011CZpbpzFt2wEZFQmZAyayD"
    },
    "is_sse": true,
    "body": "Hello! How can I help you today?",
    "sse_events": null
  }
}
```

## Certificate management

On the first run, `clsniff` automatically generates a CA (Certificate Authority) key pair and stores it at:

```
~/.clsniff/
  certs/ca.pem
  keys/ca.private.key
```

After that, each time the proxy intercepts a new HTTPS hostname for the first time, it generates a leaf certificate signed by this CA and caches it:

```
~/.clsniff/
  certs/api.anthropic.com.pem
  certs/github.com.pem
  keys/api.anthropic.com.key
  ...
```

These are reused across sessions, so the per-host cert is only generated once per hostname. The set of files in `~/.clsniff/` reflects exactly which domains have been intercepted at some point.

This CA is used to sign those per-host certificates on the fly. You do **not** need to install the CA in your system's trust store — see [Environment variables](#environment-variables) for how the child process is made to trust it.

## Environment variables

`clsniff` injects the following variables into the child process before launching it. No manual configuration is needed.

**Proxy routing** — de facto standard, no formal RFC; most HTTP clients respect them (value: `http://127.0.0.1:<port>`):

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

**CA trust** — tell the child process to trust the proxy's CA certificate:

- [`NODE_EXTRA_CA_CERTS`](https://nodejs.org/docs/latest/api/cli.html#node_extra_ca_certsfile)`=~/.clsniff/certs/ca.pem`
- [`SSL_CERT_FILE`](https://docs.openssl.org/3.1/man7/openssl-env/)`=~/.clsniff/certs/ca.pem`
- [`REQUESTS_CA_BUNDLE`](https://docs.python-requests.org/en/latest/user/advanced/#ssl-cert-verification)`=~/.clsniff/certs/ca.pem`

## Development

```bash
git clone <repo>
cd clsniff
npm install
npm link # makes `clsniff` available globally
```
