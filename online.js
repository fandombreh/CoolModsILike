import { kv } from "@vercel/kv";

const SESSION_TTL = 45; // seconds — how long before a session is considered gone

export default async function handler(req, res) {
  // Allow CORS for same-origin and local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { sessionId, action } = req.method === "GET"
    ? req.query
    : (req.body || {});

  try {
    if (req.method === "POST" && action === "heartbeat" && sessionId) {
      // Register / refresh this session with a TTL
      await kv.set(`gtmods:session:${sessionId}`, Date.now(), { ex: SESSION_TTL });

      // Count all active sessions
      const keys = await kv.keys("gtmods:session:*");
      return res.status(200).json({ online: keys.length });
    }

    if ((req.method === "DELETE" || (req.method === "POST" && action === "leave")) && sessionId) {
      // Remove session immediately on tab close
      await kv.del(`gtmods:session:${sessionId}`);
      const keys = await kv.keys("gtmods:session:*");
      return res.status(200).json({ online: keys.length });
    }

    if (req.method === "GET") {
      // Just return current count (no session registration)
      const keys = await kv.keys("gtmods:session:*");
      return res.status(200).json({ online: keys.length });
    }

    return res.status(400).json({ error: "Invalid request" });

  } catch (err) {
    console.error("KV error:", err);
    // Return a fallback so the UI doesn't break
    return res.status(200).json({ online: null, error: "storage_unavailable" });
  }
}
