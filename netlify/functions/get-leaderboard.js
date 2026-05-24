// Netlify Function: get-leaderboard
// GET /api/leaderboard
// Lists and aggregates all score blobs
// Also handles one-time migration from old "global" key format

import { getStore } from "@netlify/blobs";

async function migrateOldFormat(store) {
  // Check if old "global" blob exists
  let oldData;
  try {
    oldData = await store.get("global", { type: "json" });
  } catch (e) {
    return; // No old data
  }

  if (!oldData || !Array.isArray(oldData) || oldData.length === 0) {
    return; // Nothing to migrate
  }

  // Migrate each score to its own blob
  const migratePromises = oldData.map(async (entry, idx) => {
    try {
      // Use original timestamp if available, otherwise generate one
      let ts;
      if (entry.timestamp) {
        ts = entry.timestamp;
      } else if (entry.time) {
        ts = entry.time;
      } else if (entry.date) {
        ts = new Date(entry.date).getTime() + idx;
      } else {
        ts = Date.now() - (oldData.length - idx) * 1000;
      }

      const random = Math.random().toString(36).substring(2, 10);
      const newKey = `score_${ts}_${random}_mig${idx}`;

      // Ensure entry has timestamp for sorting/dedup
      if (!entry.timestamp) entry.timestamp = ts;

      await store.setJSON(newKey, entry);
    } catch (e) {
      // Migration of individual entry failed, continue with others
    }
  });

  await Promise.all(migratePromises);

  // Mark migration complete
  try {
    await store.setJSON("global_migrated", { migratedAt: Date.now(), count: oldData.length });
    await store.delete("global");
  } catch (e) {
    // If we can't delete, at least the marker exists
  }
}

export default async (req, context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const store = getStore("leaderboard");

    // Run migration if needed (idempotent — safe to call repeatedly)
    await migrateOldFormat(store);

    // List all score entries
    const { blobs } = await store.list({ prefix: "score_" });

    // Fetch all scores in parallel
    const promises = blobs.map(async (b) => {
      try {
        const data = await store.get(b.key, { type: "json" });
        if (data && typeof data.score === "number") {
          return data;
        }
      } catch (e) {
        // Skip entries that can't be read
      }
      return null;
    });

    const results = await Promise.all(promises);
    const allScores = results.filter(r => r !== null);

    // Sort by score descending
    allScores.sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({
      leaderboard: allScores
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=10"
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
