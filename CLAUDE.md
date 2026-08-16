# Quest Log — project context

A single-page, gamified weekly goal tracker. You are a "character" who earns XP
and levels up by completing quests. The app itself is one self-contained HTML
file with no build step; it talks to a small Supabase backend (auth, state
sync, and a Google Tasks integration) described below.

## How to run
Open `quest-log.html` in any modern browser (double-click it, or use a local
server). There is nothing to install or compile.

## Files
- `index.html` — the entire app: HTML structure, a `<style>` block for all
  CSS, and a `<script>` block for all logic. Roughly 700 lines.
- `CLAUDE.md` — this file.

## Architecture (all inside quest-log.html)
- Vanilla JS, no framework. State lives in one `state` object and the whole app
  re-renders from it via a `render()` function on every change.
- Event handling is delegated: a single click listener and a single keydown
  listener on `document`, routed by `data-act` / `data-scope` / `data-date`
  attributes on elements. There are no inline handlers.
- Weeks start on Monday. A week is keyed by its Monday's date (`YYYY-MM-DD`).
  Day/date maths is in the "Date helpers" section — all local time, no UTC, to
  avoid off-by-one bugs.

## Backend (Supabase project `ohetyemqmfwglapbhgzj`)
- **Auth**: magic-link email sign-in (`sb.auth.signInWithOtp`).
- **State sync**: the whole `state` object is JSON-serialized and upserted to
  a `quest_data` table (one row per `user_id`) on every change, debounced
  ~1.2s. Also cached to `localStorage` synchronously as a fallback.
- **Google Tasks sync**: two-way sync with two named Google Tasks lists
  ("Opgaver (Kalender)" → daily quests by due date, with overdue rollover;
  "To-do (Misc)" → current week's weekly quests). Client-side OAuth uses a
  full-page redirect to Google's consent screen (`GOOGLE_AUTH_URL` in
  `index.html`) only for the one-time authorization per Google account;
  ongoing token refresh goes through the `google-token` Supabase Edge
  Function (`supabase/functions/google-token/`), which holds a refresh token
  server-side (table `google_tokens`, RLS-locked to service-role-only access
  — no client can read it) and mints fresh access tokens on request. This is
  what makes reconnecting on page reload silent (no popup needed after the
  first authorization).

## Data model & persistence
- Local snapshot saved to browser storage under the key `questlog:v1` via a
  small wrapper (`save()` / `load()`), JSON-serialized, guarded with
  try/catch so it degrades to in-memory if storage is unavailable. The
  authoritative copy lives in Supabase's `quest_data` table (see Backend).
- Shape:
  ```
  {
    character: { totalXp: number, name: string },
    weeks: { "<mondayKey>": { weekly: [quest], days: { "<dateKey>": [quest] } } },
    completedDates: { "<dateKey>": true },  // drives the streak
    google: { calendarListId, miscListId, lastSyncedAt }
  }
  quest = { id, text, done, gtId?, gtListId?, gtDueKey? }  // gt* fields only present on Google-linked quests
  ```

## Game rules (easy knobs, near the top of the script)
- `DAILY_XP = 10`, `WEEKLY_XP = 40`. Un-checking a quest refunds its XP.
- Leveling: `xpForLevel(L) = 100 * L` (XP to go from level L to L+1), so each
  level costs more than the last. `levelFromXp` and `cumToReach` handle the curve.
- Ranks: the `RANKS` table maps level thresholds to titles (Novice … Legend).
- Streak: `computeStreak()` counts consecutive days ending today (today may be
  unfinished) that appear in `completedDates`.

## Deployment
- Live at: https://casperharreby.github.io/quest-log/
- **Front end** hosted on GitHub Pages (master branch, repo:
  CasperHarreby/quest-log). When the user says "deploy", "push it", "update
  it", or similar for `index.html` changes — stage the changed file(s),
  commit with a short message, and push:
  ```
  git add index.html
  git commit -m "<short description of change>"
  git push
  ```
  GitHub Pages redeploys automatically within ~1 minute after push.
- **Backend** (`supabase/` directory: migrations + the `google-token` Edge
  Function) deploys separately via the Supabase CLI, not via GitHub Pages —
  a plain `git push` does NOT redeploy it. After changing anything under
  `supabase/`: `npx supabase db push` (migrations) and/or `npx supabase
  functions deploy google-token` (function code). Requires being linked to
  the project (`npx supabase link --project-ref ohetyemqmfwglapbhgzj`) and
  authenticated (`SUPABASE_ACCESS_TOKEN` env var or `supabase login`).

## Common edits
- Change XP or difficulty: edit `DAILY_XP`, `WEEKLY_XP`, or the `xpForLevel`
  formula.
- Rename ranks / theme: edit the `RANKS` table and the CSS variables in `:root`.
- Add recurring dailies (habits that reappear each day): would need a new
  `recurring` list in state that seeds each day's quests on render.
