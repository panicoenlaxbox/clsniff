// @ts-ignore node-forge is a transitive dep of http-mitm-proxy; this file is excluded from tsc
import forge from "node-forge";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as tls from "tls";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { startProxy } from "./proxy.js";

/** Generates a minimal self-signed cert for localhost using node-forge (1024-bit for speed). */
function makeSelfSignedCert(): { cert: string; key: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [{ name: "commonName", value: "localhost" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

/** Sends an HTTP GET through the proxy and waits for the response to drain. */
function httpGetThroughProxy(proxyPort: number, targetPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      path: `http://127.0.0.1:${targetPort}/test`,
      method: "GET",
      headers: { host: `127.0.0.1:${targetPort}` },
    });
    req.on("response", (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Opens a CONNECT tunnel to the proxy, upgrades to TLS trusting the proxy CA,
 * sends a GET /secure, and waits for the connection to close.
 */
function httpsGetThroughProxy(
  proxyPort: number,
  targetPort: number,
  caPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: proxyPort });

    socket.once("connect", () => {
      socket.write(
        `CONNECT localhost:${targetPort} HTTP/1.1\r\nHost: localhost:${targetPort}\r\n\r\n`,
      );
    });

    let connectBuf = "";
    socket.on("data", function onData(chunk: Buffer) {
      connectBuf += chunk.toString();
      if (!connectBuf.includes("\r\n\r\n")) { return; }
      socket.removeListener("data", onData);

      if (!connectBuf.startsWith("HTTP/1.1 200")) {
        reject(new Error(`CONNECT failed: ${connectBuf.split("\r\n")[0]}`));
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        host: "localhost",
        servername: "localhost",
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true,
      });

      tlsSocket.once("secureConnect", () => {
        tlsSocket.write(
          `GET /secure HTTP/1.1\r\nHost: localhost:${targetPort}\r\nConnection: close\r\n\r\n`,
        );
        tlsSocket.on("data", () => {});
        tlsSocket.once("end", resolve);
      });

      tlsSocket.on("error", reject);
    });

    socket.on("error", reject);
  });
}

/**
 * Sends a CONNECT request through the proxy and resolves once the proxy responds
 * with "200 Connection established". Does not upgrade to TLS — used to verify the
 * tunnel is established without caring about the upper-layer protocol.
 */
function connectThroughProxy(proxyPort: number, targetHost: string, targetPort: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: proxyPort });

    socket.once("connect", () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
    });

    let buf = "";
    socket.on("data", function onData(chunk: Buffer) {
      buf += chunk.toString();
      if (!buf.includes("\r\n\r\n")) return;
      socket.removeListener("data", onData);
      if (!buf.startsWith("HTTP/1.1 200")) {
        reject(new Error(`CONNECT failed: ${buf.split("\r\n")[0]}`));
        return;
      }
      resolve(socket);
    });

    socket.on("error", reject);
  });
}

/** Reads the single .json log entry written by the proxy in the given session dir. */
function readLogEntry(sessionDir: string): Record<string, unknown> {
  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
  if (files.length !== 1) throw new Error(`Expected 1 log file, found ${files.length}`);
  return JSON.parse(fs.readFileSync(path.join(sessionDir, files[0]!), "utf-8"));
}

describe("proxy integration", () => {
  it("HTTP: logs request and response to a JSON file", async () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "clsniff-http-"));
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const serverPort = (server.address() as net.AddressInfo).port;

    const proxy = await startProxy({
      sessionDir,
      mergeSse: false,
      maskHeaders: [],
      filters: [],
      excludes: [],
    });

    try {
      await httpGetThroughProxy(proxy.port, serverPort);
      // Wait one event-loop turn for the proxy's synchronous writeLog to land
      await new Promise((r) => setTimeout(r, 200));

      const entry = readLogEntry(sessionDir);
      expect(entry.request).toMatchObject({
        method: "GET",
        url: `http://127.0.0.1:${serverPort}/test`,
      });
      expect(entry.response).toMatchObject({ status: 200, body: { ok: true } });
    } finally {
      proxy.close();
      server.close();
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("HTTPS: intercepts TLS traffic, generates CA cert, and logs to JSON", async () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "clsniff-https-"));
    const tmpCaDir = fs.mkdtempSync(path.join(os.tmpdir(), "clsniff-ca-"));

    const { cert, key } = makeSelfSignedCert();
    const server = https.createServer({ cert, key }, (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ secure: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const serverPort = (server.address() as net.AddressInfo).port;

    // proxy→target uses a self-signed cert, so we disable target cert verification
    const proxyHttpsAgent = new https.Agent({ rejectUnauthorized: false });

    const proxy = await startProxy({
      sessionDir,
      mergeSse: false,
      maskHeaders: [],
      filters: [],
      excludes: [],
      sslCaDir: tmpCaDir,
      proxyHttpsAgent,
    });

    try {
      expect(proxy.caIsNew).toBe(true);
      const caPath = path.join(tmpCaDir, "certs", "ca.pem");
      expect(fs.existsSync(caPath)).toBe(true);

      await httpsGetThroughProxy(proxy.port, serverPort, caPath);
      await new Promise((r) => setTimeout(r, 200));

      const entry = readLogEntry(sessionDir);
      expect(entry.request).toMatchObject({
        method: "GET",
        url: `https://localhost:${serverPort}/secure`,
      });
      expect(entry.response).toMatchObject({ status: 200, body: { secure: true } });
    } finally {
      proxy.close();
      server.close();
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.rmSync(tmpCaDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("excluded host: fires onTunnel and writes no log entry", async () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "clsniff-excl-"));
    const tmpCaDir = fs.mkdtempSync(path.join(os.tmpdir(), "clsniff-ca-"));

    // Bare TCP server — just accepts the connection so the tunnel can be established
    const target = net.createServer();
    await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
    const targetPort = (target.address() as net.AddressInfo).port;

    const tunnelCalls: Array<{ host: string; port: number }> = [];

    const proxy = await startProxy({
      sessionDir,
      mergeSse: false,
      maskHeaders: [],
      filters: [],
      excludes: [/localhost/],
      sslCaDir: tmpCaDir,
      onTunnel: (host, port) => tunnelCalls.push({ host, port }),
    });

    let socket: net.Socket | undefined;
    try {
      socket = await connectThroughProxy(proxy.port, "localhost", targetPort);

      expect(tunnelCalls).toHaveLength(1);
      expect(tunnelCalls[0]).toEqual({ host: "localhost", port: targetPort });

      // No request/response cycle happened — no JSON log files should exist
      const jsonFiles = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
      expect(jsonFiles).toHaveLength(0);
    } finally {
      socket?.destroy();
      proxy.close();
      target.close();
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.rmSync(tmpCaDir, { recursive: true, force: true });
    }
  }, 10_000);
});
