const SESSION_TTL = 45000; // ms — sessions older than this are stale

// In-memory fallback store (works when KV is not configured)
// Note: resets on cold starts, but still functional
const memorySessions = new Map();

function pruneMemory() {
  const now = Date.now();
  for (const [k, ts] of memorySessions) {
    if (now - ts > SESSION_TTL) memorySessions.delete(k);
  }
}

async function getKV() {
  // Only try to load @vercel/kv if the env vars are present
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const body = req.method === "GET" ? req.query : (req.body || {});
  const { sessionId, action } = body;

  const kv = await getKV();

  try {
    if (req.method === "POST" && action === "heartbeat" && sessionId) {
      if (kv) {
        await kv.set(`gtmods:session:${sessionId}`, Date.now(), { ex: Math.ceil(SESSION_TTL / 1000) });
        const keys = await kv.keys("gtmods:session:*");
        return res.status(200).json({ online: keys.length, store: "kv" });
      } else {
        pruneMemory();
        memorySessions.set(sessionId, Date.now());
        return res.status(200).json({ online: memorySessions.size, store: "memory" });
      }
    }

    if (req.method === "POST" && action === "leave" && sessionId) {
      if (kv) {
        await kv.del(`gtmods:session:${sessionId}`);
        const keys = await kv.keys("gtmods:session:*");
        return res.status(200).json({ online: keys.length, store: "kv" });
      } else {
        memorySessions.delete(sessionId);
        pruneMemory();
        return res.status(200).json({ online: memorySessions.size, store: "memory" });
      }
    }

    if (req.method === "GET") {
      if (kv) {
        const keys = await kv.keys("gtmods:session:*");
        return res.status(200).json({ online: keys.length, store: "kv" });
      } else {
        pruneMemory();
        return res.status(200).json({ online: memorySessions.size, store: "memory" });
      }
    }

    return res.status(400).json({ error: "Invalid request" });

  } catch (err) {
    console.error("Online counter error:", err);
    // Last resort fallback — never leave the UI spinning
    pruneMemory();
    memorySessions.set(sessionId || "unknown", Date.now());
    return res.status(200).json({ online: memorySessions.size, store: "fallback" });
  }
}
