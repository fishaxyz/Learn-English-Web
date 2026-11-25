import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Where media files live (AGENTS.md §9). Callers only ever get time-limited URLs: uploads go straight to the
 * store, downloads come straight from it, never through GraphQL. This "local" driver keeps files in a folder and
 * serves signed URLs from the API process, for development; an S3-compatible driver (Bunny, Backblaze B2, R2...)
 * implements the same interface for production, so switching is a setting.
 */
export type MediaStorage = {
  uploadUrl(key: string, contentType: string, ttlSeconds: number): string;
  downloadUrl(key: string, ttlSeconds: number): string;
};

/** Object keys we create: site/kind/name.ext, lowercase, no dots or slashes elsewhere. */
export const OBJECT_KEY = /^[a-z0-9-]+\/[a-z]+\/[a-z0-9-]+\.(mp3|wav)$/;
const TYPES: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav" };
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export function createLocalStorage(options: { dir: string; publicBaseUrl: string; secret: string }) {
  const root = resolve(options.dir);
  const sign = (method: string, key: string, exp: number, type = "") =>
    createHmac("sha256", options.secret).update(`${method}\n${key}\n${exp}\n${type}`).digest("base64url");
  const url = (method: string, key: string, ttlSeconds: number, type = "") => {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const q = new URLSearchParams({ exp: String(exp), sig: sign(method, key, exp, type), ...(type ? { type } : {}) });
    return `${options.publicBaseUrl.replace(/\/$/, "")}/media/${key}?${q}`;
  };

  function check(method: string, key: string, params: URLSearchParams): boolean {
    const exp = Number(params.get("exp"));
    const given = Buffer.from(params.get("sig") ?? "");
    const expected = Buffer.from(sign(method, key, exp, params.get("type") ?? ""));
    return (
      OBJECT_KEY.test(key) &&
      Number.isFinite(exp) &&
      exp >= Date.now() / 1000 &&
      given.length === expected.length &&
      timingSafeEqual(given, expected)
    );
  }

  const fileFor = (key: string) => join(root, key);

  async function serve(req: IncomingMessage, res: ServerResponse, key: string, params: URLSearchParams) {
    if (!check("GET", key, params)) return void res.writeHead(403).end();
    let size: number;
    try {
      size = (await stat(fileFor(key))).size;
    } catch {
      return void res.writeHead(404).end();
    }
    const headers: Record<string, string | number> = {
      "content-type": TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
      "access-control-allow-origin": "*",
    };
    // Byte ranges, so players can seek without downloading everything (AGENTS.md §9).
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        return void res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      }
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
      });
      if (req.method === "HEAD") return void res.end();
      return void createReadStream(fileFor(key), { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "content-length": size });
    if (req.method === "HEAD") return void res.end();
    createReadStream(fileFor(key)).pipe(res);
  }

  async function receive(req: IncomingMessage, res: ServerResponse, key: string, params: URLSearchParams) {
    if (!check("PUT", key, params)) return void res.writeHead(403).end();
    const type = params.get("type") ?? "";
    if (req.headers["content-type"] !== type || TYPES[key.split(".").pop() ?? ""] !== type) {
      return void res.writeHead(415).end();
    }
    const length = Number(req.headers["content-length"]);
    if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES) return void res.writeHead(413).end();
    const target = fileFor(key);
    const temp = `${target}.uploading`;
    await mkdir(dirname(target), { recursive: true });
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES) req.destroy(new Error("too large"));
    });
    try {
      await pipeline(req, createWriteStream(temp));
      if (received !== length) throw new Error("incomplete upload");
      await rename(temp, target); // the file appears whole or not at all
      res.writeHead(201).end();
    } catch {
      await unlink(temp).catch(() => {});
      if (!res.headersSent) res.writeHead(400).end();
    }
  }

  const storage: MediaStorage = {
    uploadUrl: (key, contentType, ttl) => url("PUT", key, ttl, contentType),
    downloadUrl: (key, ttl) => url("GET", key, ttl),
  };

  /** Handles /media/<key> for this driver; returns false for other paths. */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    const u = new URL(req.url ?? "/", "http://local");
    if (!u.pathname.startsWith("/media/")) return false;
    const key = decodeURIComponent(u.pathname.slice("/media/".length));
    if (req.method === "GET" || req.method === "HEAD") void serve(req, res, key, u.searchParams);
    else if (req.method === "PUT") void receive(req, res, key, u.searchParams);
    else res.writeHead(405).end();
    return true;
  }

  return { storage, handle };
}

export const contentTypeFor = (ext: "mp3" | "wav") => TYPES[ext] as string;
