// Netlify Function: get-leaderboard
// GET /api/leaderboard
// Returns the top 100 scores

import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const store = getStore("leaderboard");

    let leaderboard = [];
    try {
      const existing = await store.get("global", { type: "json" });
      if (Array.isArray(existing)) leaderboard = existing;
    } catch (e) {
      leaderboard = [];
    }

    return new Response(JSON.stringify({
      leaderboard
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=10" // brief cache to reduce reads
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
