# Launching Shift City (web version)

Four places, one game. You don't build anything yourself: GitHub builds the upload files for you.

## Order (decided)

Your site, itch.io and CrazyGames now. **Poki is undecided**: maybe later, maybe never, maybe after Steam.
If you go with Poki's exclusive deal later, the plan is to take the game down from the other web sites
first. Ask Poki up front whether that's enough to qualify, because their non-exclusive deal is meant for
games that are "already live on other web platforms". Steam, app stores and consoles are never covered
by Poki exclusivity.

## Get the upload files

1. Open the repo on GitHub → **Actions** tab → **Web release builds** → click the newest green run.
2. Scroll to **Artifacts** and download `shift-city-itch`, `shift-city-crazygames` and `shift-city-poki`.
3. Each download is a `.zip` with `index.html` inside. **Don't unzip it.** That zip is what you upload.

(Every push to `main` makes fresh ones.)

## 1. Your own website (Vercel)

1. Go to **vercel.com** → *Sign up* → *Continue with GitHub*.
2. **Add New… → Project** → pick **shift-city** → **Import**.
3. Set **Root Directory** to `web` (click *Edit* next to it). Leave everything else as it is.
4. Click **Deploy**. After about two minutes you get a link like `shift-city.vercel.app`. That's your site.
5. *Optional, world leaderboard:* in the project go to **Storage → Create Database → Upstash (Redis)**
   → free plan → **Connect** to the shift-city project. Then **Deployments → ⋯ → Redeploy**.
   The Arcade game-over screen now has a **World** tab.
6. *Optional, your own domain:* **Settings → Domains → Add**, then follow the instructions.

Vercel redeploys by itself every time we push to `main`.

## 2. itch.io

1. **itch.io** → log in → your avatar → **Upload new project**.
2. Title *Shift City*. **Kind of project: HTML**.
3. **Uploads → Upload files** → choose `shift-city-itch.zip` → tick **This file will be played in the browser**.
4. **Embed options:** viewport **1280 × 720**, tick **Mobile friendly** (orientation **Landscape**), tick
   **Fullscreen button**.
5. Add a cover image (a screenshot is fine), a short description and the genre (*Racing*), then
   **Visibility: Public** → **Save**.

## 3. CrazyGames

1. **developer.crazygames.com** → sign up → **Submit a game**.
2. Upload `shift-city-crazygames.zip`, fill in the title, description, controls (*W/A/S/D or arrows,
   Space = handbrake, V = camera*) and add a cover image.
3. Submit. CrazyGames reviews it (usually a few days) and may send feedback.
   The CrazyGames SDK is already built in: loading, gameplay start/stop, ad breaks between Arcade runs,
   and a "watch an ad: double your points" button.

## 4. Poki (only if and when you decide)

1. **developers.poki.com** → *Submit your game*. Poki picks the games it publishes, so you're applying.
2. When they accept, upload `shift-city-poki.zip` in their dashboard. The Poki SDK is already built in.

## What's built in for the portals

- No third-party requests: fonts, music and textures are all bundled. On portals the world leaderboard
  is switched off; the local top 10 still works.
- Ads only at natural breaks: between Arcade runs (at most one every 3 minutes), plus the optional
  rewarded "double points" button. Sound mutes and the game pauses during ads.
- Phones and weaker laptops start on the light **Rendered** graphics. The scanned textures (~8 MB)
  are only downloaded if someone switches to Photoreal or Hyper-real.
- If an ad blocker stops a portal's SDK, the game still runs, just without ads.
