# Blue Slide Park

A 3D slide game with a global leaderboard, built with vanilla HTML/CSS/JS and Netlify Functions + Netlify Blobs.

## Project Structure

```
blue-slide-park/
├── index.html              # The game
├── netlify.toml            # Netlify configuration
├── package.json            # Dependencies (@netlify/blobs)
├── README.md               # This file
├── audio/
│   └── blue_slide_park.mp3 # Background music (loops on page load)
└── netlify/
    └── functions/
        ├── submit-score.js     # POST /api/submit
        └── get-leaderboard.js  # GET /api/leaderboard
```

## How It Works

- **Game**: Pure HTML/CSS/JS — no build step. Served as a static file.
- **Leaderboard storage**: Netlify Blobs (key-value store built into Netlify, no separate database needed).
- **API**:
  - `GET /api/leaderboard` → returns the global top 100 scores.
  - `POST /api/submit` → submits a new score `{name, score}`, returns updated top 7 and the rank of the submission.

## Deployment to Netlify

### Option A: Connect a GitHub repo (recommended)

1. Create a new GitHub repository.
2. Push these files to it.
3. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project".
4. Connect your GitHub account and pick the repo.
5. Build settings: leave everything default (Netlify reads `netlify.toml`).
6. Deploy. Netlify will install `@netlify/blobs` and wire up the functions automatically.

### Option B: Netlify CLI

```bash
npm install -g netlify-cli
cd blue-slide-park
netlify init
netlify deploy --prod
```

## Local Development

```bash
npm install
npx netlify dev
```

This will run the site at `http://localhost:8888` with the functions working locally.

## Notes

- Netlify Blobs is included free with every Netlify site (no separate signup).
- The store is named `leaderboard` and uses a single key `global` holding an array of `{name, score, time}` objects.
- Currently keeps the top 100 entries globally; UI shows the top 7.

## Anti-Cheat (Future Work)

This MVP has no anti-cheat protection. Anyone can `curl /api/submit` with any score. Future improvements:
- Rate limit by IP
- Validate score against time-played (e.g., max ~100 points per second realistic)
- Sign score submissions with a token issued at game start
- Add reCAPTCHA for top-10 scores
- Server-side replay validation (record key inputs, replay on server)
