/**
 * proxy.js — Local CORS proxy for CRT Audio Sculptures
 *
 * Forwards browser requests to YouTube/Google APIs, adding CORS headers
 * so the single-file HTML app can hit InnerTube and stream URLs directly.
 *
 * Usage:
 *   node proxy.js          (default port 8080)
 *   PORT=9000 node proxy.js
 *
 * No npm install needed — pure Node.js standard library.
 * Requires Node.js 18+ (for built-in fetch).
 *
 * How it works:
 *   The HTML rewrites YouTube URLs like:
 *     https://www.youtube.com/youtubei/v1/search?key=...
 *   into:
 *     http://localhost:8080/youtubei/v1/search?key=...&__host=www.youtube.com
 *
 *   This proxy reads __host, rebuilds the real URL, fetches it server-side
 *   (no CORS restrictions), and returns the response with CORS headers attached.
 *
 *   Range requests (for audio streaming) are forwarded transparently.
 */

const http        = require("http");
const https       = require("https");
const { URL }     = require("url");
const { execFile } = require("child_process");

const PORT = parseInt(process.env.PORT || "8080", 10);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": [
    "Origin", "X-Requested-With", "Content-Type", "Accept",
    "Authorization", "Range", "Referer",
    "x-goog-visitor-id", "x-goog-api-key", "x-origin",
    "x-youtube-client-version", "x-youtube-client-name",
    "x-goog-api-format-version", "x-user-agent", "Accept-Language",
  ].join(", "),
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

// Headers we forward from the browser request to YouTube
const FORWARD_FROM_BROWSER = new Set([
  "content-type", "content-length", "range", "referer",
  "x-goog-visitor-id", "x-goog-api-key", "x-origin",
  "x-youtube-client-version", "x-youtube-client-name",
  "x-goog-api-format-version", "x-user-agent", "accept-language",
  "accept", "authorization",
]);

// Headers we copy back from YouTube to the browser
const FORWARD_TO_BROWSER = new Set([
  "content-type", "content-length", "content-range",
  "accept-ranges", "content-disposition", "last-modified", "etag",
]);

function sendCors(res, statusCode = 200, extra = {}) {
  res.writeHead(statusCode, { ...CORS_HEADERS, ...extra });
}

// ---- URL cache: videoId → { url, expires } ----
const streamCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours (YouTube URLs valid ~6h)

// In-flight promises to prevent duplicate yt-dlp spawns for the same videoId
const streamInFlight = new Map();

function resolveViaYtDlp(videoId) {
  // Return cached URL if still valid
  const cached = streamCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    console.info(`[stream] cache hit ${videoId}`);
    return Promise.resolve(cached.url);
  }
  // Reuse an in-flight resolution if one is already running
  if (streamInFlight.has(videoId)) {
    console.info(`[stream] joining in-flight ${videoId}`);
    return streamInFlight.get(videoId);
  }
  // Spawn yt-dlp
  const promise = new Promise((resolve, reject) => {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    execFile(
      "yt-dlp",
      ["--no-playlist", "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio", "--get-url", ytUrl],
      { timeout: 20000 },
      (err, stdout, stderr) => {
        streamInFlight.delete(videoId);
        if (err) { reject({ err, stderr }); return; }
        const audioUrl = stdout.trim().split("\n")[0];
        if (!audioUrl) { reject({ err: new Error("yt-dlp returned no URL") }); return; }
        streamCache.set(videoId, { url: audioUrl, expires: Date.now() + CACHE_TTL_MS });
        resolve(audioUrl);
      }
    );
  });
  streamInFlight.set(videoId, promise);
  return promise;
}

const server = http.createServer((req, res) => {
  // ---- /stream/:videoId — resolve audio URL via yt-dlp (cached) ----
  // Returns JSON: { url: "https://..." } or { error: "..." }
  const streamMatch = req.url.match(/^\/stream\/([A-Za-z0-9_-]{11})(\?.*)?$/);
  if (streamMatch) {
    sendCors(res, 200, { "Content-Type": "application/json" });
    const videoId = streamMatch[1];
    resolveViaYtDlp(videoId)
      .then(audioUrl => {
        console.info(`[stream] resolved ${videoId}`);
        res.end(JSON.stringify({ url: audioUrl }));
      })
      .catch(({ err, stderr }) => {
        console.error(`[stream] yt-dlp error for ${videoId}:`, stderr || err.message);
        res.end(JSON.stringify({ error: stderr?.trim() || err.message }));
      });
    return;
  }

  // ---- /prewarm/:videoId — fire-and-forget, returns immediately ----
  // Called on hover so yt-dlp runs before the user clicks
  const prewarmMatch = req.url.match(/^\/prewarm\/([A-Za-z0-9_-]{11})(\?.*)?$/);
  if (prewarmMatch) {
    sendCors(res, 200, { "Content-Type": "application/json" });
    const videoId = prewarmMatch[1];
    const cached = streamCache.get(videoId);
    if (cached && cached.expires > Date.now()) {
      res.end(JSON.stringify({ status: "cached" }));
      return;
    }
    res.end(JSON.stringify({ status: "warming" }));
    resolveViaYtDlp(videoId)
      .then(() => console.info(`[prewarm] ready ${videoId}`))
      .catch(() => console.info(`[prewarm] failed ${videoId}`));
    return;
  }

  // ---- /ping — liveness check used by the HTML to detect the proxy ----
  if (req.url === "/ping" || req.url === "/ping?") {
    sendCors(res, 200, { "Content-Type": "text/plain" });
    res.end("pong");
    return;
  }

  // ---- CORS preflight ----
  if (req.method === "OPTIONS") {
    sendCors(res, 204);
    res.end();
    return;
  }

  // ---- Parse the proxy URL ----
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request URL");
    return;
  }

  const host = parsedUrl.searchParams.get("__host");
  if (!host) {
    // No __host = direct browser navigation to the proxy — just explain
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "CRT Audio Sculptures local proxy is running.\n" +
      "Send requests with ?__host=<target-host> to forward them.\n"
    );
    return;
  }

  // Rebuild the target URL
  parsedUrl.searchParams.delete("__host");
  const targetUrl = new URL(`https://${host}${parsedUrl.pathname}${parsedUrl.search}`);

  // Build forwarded headers
  const fwdHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "host": host,
  };
  for (const [k, v] of Object.entries(req.headers)) {
    if (FORWARD_FROM_BROWSER.has(k.toLowerCase())) {
      fwdHeaders[k.toLowerCase()] = v;
    }
  }

  // Collect request body
  const bodyChunks = [];
  req.on("data", chunk => bodyChunks.push(chunk));
  req.on("end", () => {
    const body = bodyChunks.length ? Buffer.concat(bodyChunks) : null;
    if (body && body.length) fwdHeaders["content-length"] = String(body.length);

    const options = {
      method:   req.method,
      headers:  fwdHeaders,
    };

    // Make the upstream request
    const upReq = https.request(targetUrl.toString(), options, upRes => {
      // Build response headers
      const outHeaders = { ...CORS_HEADERS };
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (FORWARD_TO_BROWSER.has(k.toLowerCase())) {
          outHeaders[k] = v;
        }
      }

      res.writeHead(upRes.statusCode, outHeaders);
      upRes.pipe(res);
    });

    upReq.on("error", err => {
      console.error(`[proxy] upstream error for ${targetUrl.hostname}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { ...CORS_HEADERS, "Content-Type": "text/plain" });
        res.end(`Upstream error: ${err.message}`);
      }
    });

    if (body && body.length) upReq.write(body);
    upReq.end();
  });

  req.on("error", err => {
    console.error("[proxy] request error:", err.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCRT Audio Sculptures — local proxy running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`\nKeep this terminal open while using the app.`);
  console.log(`The HTML will detect the proxy automatically and use it for`);
  console.log(`faster YouTube searches + direct stream URLs.\n`);
  console.log(`Press Ctrl+C to stop.\n`);
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error(`Either another proxy.js is running, or set a different port:`);
    console.error(`  PORT=9000 node proxy.js`);
    console.error(`  (and update LOCAL_PROXY in the HTML to match)\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
