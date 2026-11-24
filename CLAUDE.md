# Pitchside

- Spec lives in the Claude doc linked from README. Keep code and spec in step.
- `packages/engine` must stay pure and deterministic: no Date, no Math.random, no I/O. Use `Rng`.
- After any change to the engine or `TUNING`, run `N=40 npm run harness` and report the top setup score,
  by-formation and by-tactic averages, and goals per match. Targets: no setup above ~0.56 (stretch), the
  zero-center-back side clearly losing, 2.5-3.0 goals per match.
- Mechanics may follow classic online managers; names, art, text and layouts must be original.
