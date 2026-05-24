// Netlify Function: submit-score
// POST /api/submit
// Body: { name: string, score: number }
// Saves each score as its own blob entry (no race conditions possible)

import { getStore } from "@netlify/blobs";

async function migrateOldFormat(store) {
  let oldData;
  try {
    oldData = await store.get("global", { type: "json" });
  } catch (e) {
    return;
  }

  if (!oldData || !Array.isArray(oldData) || oldData.length === 0) return;

  const migratePromises = oldData.map(async (entry, idx) => {
    try {
      let ts;
      if (entry.timestamp) ts = entry.timestamp;
      else if (entry.time) ts = entry.time;
      else if (entry.date) ts = new Date(entry.date).getTime() + idx;
      else ts = Date.now() - (oldData.length - idx) * 1000;

      const random = Math.random().toString(36).substring(2, 10);
      const newKey = `score_${ts}_${random}_mig${idx}`;
      if (!entry.timestamp) entry.timestamp = ts;
      await store.setJSON(newKey, entry);
    } catch (e) {}
  });

  await Promise.all(migratePromises);

  try {
    await store.setJSON("global_migrated", { migratedAt: Date.now(), count: oldData.length });
    await store.delete("global");
  } catch (e) {}
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    let { name, score } = body;

    if (typeof name !== "string" || typeof score !== "number") {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    name = name.trim().slice(0, 14) || "PLAYER";
    score = Math.floor(score);
    if (score < 0 || score > 10_000_000 || !Number.isFinite(score)) {
      return new Response(JSON.stringify({ error: "Invalid score" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const geo = context.geo || {};
    const location = {
      city: geo.city || null,
      country: geo.country?.name || null,
      countryCode: geo.country?.code || null,
      region: geo.subdivision?.name || null,
      timezone: geo.timezone || null
    };

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timestamp = now.getTime();
    const random = Math.random().toString(36).substring(2, 10);
    const scoreKey = `score_${timestamp}_${random}`;

    const entry = {
      name,
      score,
      date: dateStr,
      location,
      timestamp
    };

    const store = getStore("leaderboard");

    // Migrate old format if needed (idempotent)
    await migrateOldFormat(store);

    // Save this score as its own blob entry — no race conditions possible
    await store.setJSON(scoreKey, entry);

    // Build the leaderboard for the response
    const { blobs } = await store.list({ prefix: "score_" });

    const promises = blobs.map(async (b) => {
      try {
        const data = await store.get(b.key, { type: "json" });
        if (data && typeof data.score === "number") return data;
      } catch (e) {}
      return null;
    });

    const results = await Promise.all(promises);
    const allScores = results.filter(r => r !== null);
    allScores.sort((a, b) => b.score - a.score);

    const rank = allScores.findIndex(
      e => e.name === entry.name && e.score === entry.score && e.timestamp === entry.timestamp
    );

    return new Response(JSON.stringify({
      success: true,
      rank,
      leaderboard: allScores
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
