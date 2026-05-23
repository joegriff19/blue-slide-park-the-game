// Netlify Function: submit-score
// POST /api/submit
// Body: { name: string, score: number }
// Saves the score to the global leaderboard (top 100)
// Uses ETag-based optimistic concurrency to prevent race conditions

import { getStore } from "@netlify/blobs";

const MAX_RETRIES = 5;

export default async (req, context) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    let { name, score } = body;

    // Basic validation
    if (typeof name !== "string" || typeof score !== "number") {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Sanitize: trim name, limit length, ensure score is reasonable integer
    name = name.trim().slice(0, 14) || "PLAYER";
    score = Math.floor(score);
    if (score < 0 || score > 10_000_000 || !Number.isFinite(score)) {
      return new Response(JSON.stringify({ error: "Invalid score" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get geolocation from Netlify's context (based on user's IP)
    const geo = context.geo || {};
    const location = {
      city: geo.city || null,
      country: geo.country?.name || null,
      countryCode: geo.country?.code || null,
      region: geo.subdivision?.name || null,
      timezone: geo.timezone || null
    };

    // Format date as YYYY-MM-DD (UTC)
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    // Prepare the new entry
    const entry = {
      name,
      score,
      date: dateStr,
      location
    };

    // Connect to the leaderboard store
    const store = getStore("leaderboard");

    // Retry loop: read-modify-write with ETag check to prevent race conditions
    let leaderboard = [];
    let success = false;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Read current value with metadata (includes etag)
        const result = await store.getWithMetadata("global", { type: "json" });
        const currentLeaderboard = (result && Array.isArray(result.data)) ? result.data : [];
        const etag = result ? result.etag : null;

        // Build the new leaderboard
        leaderboard = [...currentLeaderboard, entry];
        leaderboard.sort((a, b) => b.score - a.score);
        if (leaderboard.length > 100) {
          leaderboard = leaderboard.slice(0, 100);
        }

        // Conditional write: only succeed if etag matches (nobody else wrote)
        const writeOptions = etag
          ? { onlyIfMatch: etag }
          : { onlyIfNew: true }; // First write ever

        const writeResult = await store.setJSON("global", leaderboard, writeOptions);

        // If the write was rejected (modified flag), try again
        if (writeResult && writeResult.modified === false) {
          // Someone else wrote between our read and write - retry
          await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
          continue;
        }

        success = true;
        break;
      } catch (e) {
        lastError = e;
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      }
    }

    if (!success) {
      return new Response(JSON.stringify({
        error: "Could not save score after retries",
        details: lastError ? lastError.message : "unknown"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Find the rank of the new entry
    const rank = leaderboard.findIndex(
      e => e.name === entry.name && e.score === entry.score && e.date === entry.date
    );

    return new Response(JSON.stringify({
      success: true,
      rank,
      leaderboard: leaderboard.slice(0, 7)
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
