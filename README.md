# Pyramid of Numbers

An arcade-style times-table and division game for kids, themed on an Egyptian pyramid.

Pick one face-down stone on each level and answer its sum. A right answer takes you up a level; a wrong one (or running out of time) flips every stone back, shuffles in new sums and sends you back to the base. Reach the capstone to finish the climb.

**Play it:** https://claude.ai/artifact/JaSWrKyDfgBMiTkjxJe9FN

## Settings

- Player name
- Times tables 2–12 (any mix)
- Sums: times, divide, or both
- Pyramid levels: 3–8
- Answer timer: off, or 5–20 seconds per stone

## Scoring

- +100 per right answer, plus up to +50 for answering quickly
- −50 for a wrong answer, and back to the base

Every finished climb is recorded (player, score, time, resets and settings). The Hall of Records screen charts each player's score and time per climb.

## Files

| File | What it holds |
|------|---------------|
| `index.html` | Page structure: setup, game, records and finish screens |
| `style.css` | All styling, animations and responsive layout |
| `game.js` | Game logic, sounds, score storage and the progress charts |
| `logo.svg` | The logo, shown on the title screen |
| `logo-1024.png` | The logo as a 1024px app icon (paste it onto the installed Chrome app) |

No build step and no dependencies. Fonts load from Google Fonts.

## Where scores are saved

On the published page, scores go to the artifact's shared database (everyone who opens the link sees the same Hall of Records). Opened any other way, scores are kept in that browser's local storage.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.
