# Handover — MediaPipe Pose Detection

## 1. Orientation
Oriented via `.claude/onboarding.md` + the latest `documentation/mediapipe-pose-DEVLOG.md`
entries. Project is feature-complete / maintenance mode. This session: found and
fixed the dead-Start-button bug in both game demos (global CORS 500-ing module
scripts on LAN origins), added boot/camera error surfacing, linked the demos
together, and did a repo cleanup pass. (Details in the DEVLOG entry dated
2026-07-02 — not duplicated here.)

## 2. The Delta (conversation context, not yet in files)
- **Environment fact that shaped everything:** dev servers started inside a
  Claude Code session are network-sandboxed — in-session tools can reach them,
  but Brad's real browsers cannot. For anything Brad will open himself, start
  the server on the host (PowerShell tool or Brad runs `npm start`). A host
  server was left running on port 3939 this session (background task).
- **Brad plays from his laptop over the LAN** (Browser 1 in the Chrome
  extension = 16-core touchscreen machine; the desktop/server is 192.168.4.36).
  Games now load there, but the **camera stays blocked on `http://<LAN-IP>`**
  (browser secure-context rule — the in-game error message now explains this).
  To actually play from the laptop he needs HTTPS (self-signed cert or a
  tunnel) — that's an un-built, discussed-but-not-committed option.
- **The tuning loop from last session is still open:** both games are at
  first-guess feel constants. When Brad plays (desktop via localhost:3939, or
  laptop once HTTPS exists), he tunes via the panel, hits **Copy values**, and
  pastes the `KEY = value` blocks into chat → next agent bakes them into the
  `let` defaults at the top of `client/flight-game.html` / `bird-game.html`.
- **Not yet verified with a real camera:** the desktop localhost path
  post-change (expected fine — it was already allowlisted), steering sign, and
  the bird's gravity-vs-lift balance.

## 3. Next Steps
1. Brad plays both games on the desktop (`http://localhost:3939`) — confirms
   Start works with a real camera, then does the tune-by-feel + Copy-values loop.
2. (If laptop play matters) add HTTPS to the Express server (self-signed cert)
   so `getUserMedia` works on LAN origins.
3. Bake tuned constants into source defaults when Brad pastes them; commit.
