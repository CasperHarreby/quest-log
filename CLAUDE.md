# Quest Log — project context

A single-page, gamified weekly goal tracker. You are a "character" who earns XP
and levels up by completing quests. Built as one self-contained HTML file with no
backend and no build step.

## How to run
Open `quest-log.html` in any modern browser (double-click it, or use a local
server). There is nothing to install or compile.

## Files
- `quest-log.html` — the entire app: HTML structure, a `<style>` block for all
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

## Data model & persistence
- Saved to browser storage under the key `questlog:v1` via a small wrapper
  (`save()` / `load()`), JSON-serialized. Guarded with try/catch so it degrades
  to in-memory if storage is unavailable.
- Shape:
  ```
  {
    character: { totalXp: number, name: string },
    weeks: { "<mondayKey>": { weekly: [quest], days: { "<dateKey>": [quest] } } },
    completedDates: { "<dateKey>": true }   // drives the streak
  }
  quest = { id, text, done }
  ```
- Quest data is NOT stored in the HTML file; it lives only in browser storage, so
  the file itself never changes as you use the app.

## Game rules (easy knobs, near the top of the script)
- `DAILY_XP = 10`, `WEEKLY_XP = 40`. Un-checking a quest refunds its XP.
- Leveling: `xpForLevel(L) = 100 * L` (XP to go from level L to L+1), so each
  level costs more than the last. `levelFromXp` and `cumToReach` handle the curve.
- Ranks: the `RANKS` table maps level thresholds to titles (Novice … Legend).
- Streak: `computeStreak()` counts consecutive days ending today (today may be
  unfinished) that appear in `completedDates`.

## Deployment
- Live at: https://casperharreby.github.io/quest-log/
- Hosted on GitHub Pages (master branch, repo: CasperHarreby/quest-log).
- When the user says "deploy", "push it", "update it", or similar — stage the
  changed file(s), commit with a short message, and push:
  ```
  git add quest-log.html
  git commit -m "<short description of change>"
  git push
  ```
  GitHub Pages redeploys automatically within ~1 minute after push.

## Common edits
- Change XP or difficulty: edit `DAILY_XP`, `WEEKLY_XP`, or the `xpForLevel`
  formula.
- Rename ranks / theme: edit the `RANKS` table and the CSS variables in `:root`.
- Add recurring dailies (habits that reappear each day): would need a new
  `recurring` list in state that seeds each day's quests on render.
- Sync across devices: currently single-device (browser storage). Real sync would
  require adding a backend or a hosted storage service.
