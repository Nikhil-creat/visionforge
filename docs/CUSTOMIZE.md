# Customize colours, motion and content

## Pick a look at runtime
Header → **Theme**: 7 palettes (paper, mint, sakura, neon, aurora, ember, midnight), 4 motion styles (calm, energetic, glitch, still), custom accent colour. Choices persist in `localStorage`. Reduced-motion users start on *still*.

## Add a palette
1. `frontend/app/globals.css`: copy any `[data-theme="neon"]{…}` block, rename it, change the variables.
2. `frontend/lib/themes.ts`: add an entry to `PALETTES` (id, label, swatch colours, dot colour for the hero).
Rebuild; it appears in the Theme panel automatically.

## Motion styles
`MOTIONS` in `lib/themes.ts` sets per-style `speed`, `glitch` (probability the dot field is perturbed; lower = more glitchy) and `magnet` (cursor pull, 0 = off). `still` freezes the hero. CSS animations scale with `--ui` (0 disables them); keyframes live in `globals.css` (`rise`, `glowshift`, `glitch`, `scan`).

## Hero (dot-matrix hands)
`components/DotHero.tsx`: `LOOP` (animation length), grid `step` (`W/205`; larger divisor = finer dots), `LEVELS` (dot size steps), `SHEET`+`SRC` (sprite sheet source). Glow strength: `--glow` in CSS.

## Your content
- `lib/profile.ts`: name, links, education, projects, skills, `openTo` chips.
- `lib/catalogue.ts`: the 35 catalogue modules (VF-01…).
- `backend/app/services/assistant.py`: council personas (`PERSONAS`) and system prompt.
- New image op: add a function in `services/ops.py`, register it in the ops table, and it shows up in Studio and the agent planner.
- Neural models: register a backend in `vision.NEURAL_BACKENDS` and enable via `ENABLE_*` env flags.
