# Adaptive Coding Soundtrack 0.3.1 Release Plan

## Objective

Harden the 0.3 provider release with safer cache handling and explicit interrupted-session recovery.

## Implemented scope

- **Cache repair:** invalid/missing audio and temporary files are removed; corrupt metadata is backed up while orphaned paid MP3 files are preserved.
- **Session recovery:** an interrupted active session can be explicitly resumed after editor reload or restart.

The 0.3.0 provider scope remains unchanged:

- **Three providers:** ElevenLabs Music v2, Google Lyria 3 Pro Preview, and Stability AI Stable Audio 3 behind one mockable client contract.
- **Secure opt-in:** local remains the default; keys live in VS Code Secret Storage; connection tests do not generate paid audio.
- **Content-free requests:** providers receive only duration, derived musical controls, and an optional previewable user-authored suffix—never automatically collected editor, terminal, diagnostic, workspace, or chat content.
- **Continuity and cost:** every paid request requires modal confirmation; one cached asset per provider/model/style/duration handles every context intent; local event cues, a one-attempt default daily ceiling, cancellation, and timeout bound cost.
- **Resilience:** cache misses are clearly labeled and play procedural audio without a network request; legacy assets remain reusable; invalid audio, missing access, exhausted budget, timeout, or provider errors are actionable.
- **Playback:** cached MP3 loops crossfade with procedural scenes and adapt energy/brightness locally without restarting the same asset.
- **Visibility:** prompt preview, truthful now-playing provenance, cache inventory, per-track deletion, and diagnostics explain every fallback without telemetry.
- **Verification:** deterministic mocked API, explicit-generation, detailed prompt, cache migration/eviction, fallback, unit, Extension Host, syntax, and package checks.

## Manual acceptance

- Verify local mode without an account or network.
- With one provider account, save a key, test access, preview a prompt, explicitly generate one track, and confirm all context intents remain cache hits.
- Confirm an uncached style makes no network request, explains the fallback, and exposes the explicit Generate action.
- Confirm typing and short terminal commands do not restart the generated asset.
- Confirm pause/resume, Idle override, completion/failure cues, source changes, provider failure fallback, key removal, and cache clearing.
- Repeat provider-specific live generation for any additional provider whose account is available.

## Future roadmap

- Suno official API evaluation after its detailed docs, pricing, licensing, retention, and availability stabilize.
- Provider-specific cost estimates and richer user-facing failure remediation.
- Longer-form or streaming music where continuity and spending remain bounded.
- Cursor-specific context only through a supported public API.
- Small opt-in user pilot and feedback design.
