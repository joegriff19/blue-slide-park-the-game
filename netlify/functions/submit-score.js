// Netlify Function: submit-score
// POST /api/submit
// Body: { name: string, score: number }
// Saves the score to the global leaderboard (top 100)

import { getStore } from "@netlify/blobs";

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

    // Connect to the leaderboard store
    const store = getStore("leaderboard");

    // Get current leaderboard
    let leaderboard = [];
    try {
      const existing = await store.get("global", { type: "json" });
      if (Array.isArray(existing)) leaderboard = existing;
    } catch (e) {
      // No leaderboard yet, that's fine
      leaderboard = [];
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

    // Add new entry
    const entry = {
      name,
      score,
      date: dateStr,
      location
    };
    leaderboard.push(entry);

    // Sort by score descending, keep top 100
    leaderboard.sort((a, b) => b.score - a.score);
    if (leaderboard.length > 100) {
      leaderboard = leaderboard.slice(0, 100);
    }

    // Save back
    await store.setJSON("global", leaderboard);

    // Return the updated leaderboard and the rank of the new entry
    const rank = leaderboard.findIndex(
      e => e.name === entry.name && e.score === entry.score && e.date === entry.date
    );

    return new Response(JSON.stringify({
      success: true,
      rank,
      leaderboard: leaderboard.slice(0, 7) // return top 7 for the UI
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
