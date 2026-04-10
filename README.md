# clsniff

[![CI](https://github.com/panicoenlaxbox/clsniff/actions/workflows/ci.yml/badge.svg)](https://github.com/panicoenlaxbox/clsniff/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/clsniff)](https://www.npmjs.com/package/clsniff)
[![license](https://img.shields.io/npm/l/clsniff)](https://opensource.org/licenses/MIT)
[![node](https://img.shields.io/node/v/clsniff)](https://nodejs.org/)

A zero-configuration HTTP/HTTPS traffic sniffer for command-line tools.

Wrap any command with `clsniff` and every HTTP/HTTPS request it makes will be captured and saved to a JSON file — including full request/response headers and bodies (SSE responses are captured as an array of parsed events).

## Prerequisites

- **Node.js** 22 or later
- **[mitmproxy](https://mitmproxy.org/)** — the proxy engine (`mitmdump` must be in PATH). See the [installation guide](https://docs.mitmproxy.org/stable/overview/installation/) for all available options.

## How it works

`clsniff` starts [mitmdump](https://docs.mitmproxy.org/stable/tools-mitmdump/) (mitmproxy's headless mode) as a subprocess and launches your command as a child process with [environment variables injected](#environment-variables) so it routes traffic through the proxy and trusts its CA certificate.

When a request passes through the proxy, `clsniff`:

1. Captures the full request (method, URL, headers, body)
2. Forwards it to the real server without modification
3. Captures the full response (status, headers, body or SSE events)
4. Forwards the response to the child process without modification
5. Writes a JSON file with both sides of the exchange

The child process is completely unaware of the interception. Its `stdin`, `stdout`, and `stderr` are passed through directly.

## Getting started

```bash
# Run without installing
npx -y clsniff@latest --mask-headers "authorization" -- claude

# Or install globally
npm install -g clsniff
clsniff --mask-headers "authorization" -- claude
```

Intercepted requests are saved to `~/.clsniff/` as JSON files, one per request/response pair.

## Usage

```
clsniff [options] -- <command> [args...]
```

The `--` separator is required to separate `clsniff` options from the wrapped command.

### Options

| Flag | Description | Default |
|---|---|---|
| `--output-dir <path>` | Directory where session log folders are created | `~/.clsniff` |
| `--name <name>` | Name for the session folder instead of the auto-generated timestamp | (timestamp) |
| `--port <number>` | Port for the local proxy (0 = OS auto-assign) | `0` |
| `--mask-headers <names>` | Comma-separated header names to redact in JSON output. Can be repeated. | (none) |
| `--exclude <hosts>` | Comma-separated hosts to bypass interception entirely (NO_PROXY format). Bypassed hosts get a direct TCP tunnel — no MITM, no logging. Can be repeated. Example: `example.com,.datadoghq.com` | (none) |
| `--install-cert` | Install mitmproxy's CA certificate in the system trust store | (off) |

## Examples

**Intercept all traffic:**
```bash
clsniff -- claude --dangerously-skip-command
```

**Redact the API key:**
```bash
clsniff --mask-headers "authorization" -- claude
```

**Bypass telemetry hosts:**
```bash
clsniff --exclude ".datadoghq.com" -- claude
```

## Output format

Each `clsniff` invocation creates a new timestamped folder under `~/.clsniff/` (one folder per run):

```
~/.clsniff/
  2026-04-09T14-30-00-000Z/
    1744200600123_1.json
    1744200601456_2.json
    clsniff.log
```

`clsniff.log` contains timestamped internal messages (proxy startup, per-request entries, errors).

Each JSON file contains one request/response pair:

```json
{
  "id": 20,
  "timestamp": "2026-04-09T14:53:19.651Z",
  "duration_ms": 1936,
  "request": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages?beta=true",
    "headers": {
      "authorization": "Bearer sk-ant-...",
      "content-type": "application/json",
      "anthropic-version": "2023-06-01"
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
    "body": [
      { "event": "message_start", "data": { "type": "message_start", ... } },
      { "event": "content_block_delta", "data": { "type": "content_block_delta", ... } },
      { "event": "message_stop", "data": { "type": "message_stop" } }
    ]
  }
}
```

## Certificate management

On first run, mitmproxy generates a CA (Certificate Authority) key pair and stores it in `~/.mitmproxy/`:

```
~/.mitmproxy/
  mitmproxy-ca.pem          (CA key + certificate)
  mitmproxy-ca-cert.pem     (CA certificate, PEM — used by NODE_EXTRA_CA_CERTS)
  mitmproxy-ca-cert.cer     (CA certificate, DER — used by certutil on Windows)
  mitmproxy-ca-cert.p12     (CA certificate, PKCS12)
  mitmproxy-dhparam.pem     (DH parameters)
```

These files are generated once and reused across all sessions and tools.

### Trusting the CA certificate

On **first run** (when `~/.mitmproxy/mitmproxy-ca-cert.pem` does not yet exist), `clsniff` automatically tries to install the CA certificate in your system trust store. You can also trigger this manually at any time with `--install-cert`.

| Platform | Action |
|---|---|
| **Windows** | Runs `certutil -addstore -user Root mitmproxy-ca-cert.cer`. A Windows security dialog will appear asking for confirmation. |
| **macOS** | Prints the `sudo security add-trusted-cert ...` command to run manually. |
| **Linux** | Prints instructions to add the cert to your distro's CA bundle. |

Regardless of system-level trust, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, and `REQUESTS_CA_BUNDLE` are always set in the child process environment to ensure Node.js, Python, and OpenSSL-based tools trust the proxy CA automatically.

> **Note:** `SSL_CERT_FILE` replaces the system CA bundle for the child process. If you use `--exclude` to bypass certain hosts, those connections reach the real server but will fail TLS verification because the real CAs are no longer trusted in `SSL_CERT_FILE`. In that case, install the cert system-wide (via `--install-cert`) so the system CA bundle is used instead.

## Environment variables

`clsniff` injects the following variables into the child process before launching it.

**Proxy routing:**

- `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, `https_proxy` — set to `http://127.0.0.1:<port>`
- `NO_PROXY`, `no_proxy` — set to `localhost,127.0.0.1`

**CA trust:**

- [`NODE_EXTRA_CA_CERTS`](https://nodejs.org/docs/latest/api/cli.html#node_extra_ca_certsfile) `= ~/.mitmproxy/mitmproxy-ca-cert.pem`
- [`SSL_CERT_FILE`](https://docs.openssl.org/3.1/man7/openssl-env/) `= ~/.mitmproxy/mitmproxy-ca-cert.pem`
- [`REQUESTS_CA_BUNDLE`](https://docs.python-requests.org/en/latest/user/advanced/#ssl-cert-verification) `= ~/.mitmproxy/mitmproxy-ca-cert.pem`

## Development

```bash
git clone https://github.com/panicoenlaxbox/clsniff.git
cd clsniff
npm install
npm run dev -- -- claude
```
