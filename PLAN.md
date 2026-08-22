# Adaptive Coding Soundtrack 0.2.1 Release Plan

## Objective

Ship a focused continuity patch so ordinary terminal use does not restart the soundtrack, while preserving useful Waiting feedback for long-running work.

## Completed scope

- **Terminal policy:** configurable `off`, `longRunningOnly`, and `all` modes; five-second long-command default; terminal completion never enters the global Completed state.
- **Continuous music:** same-style context changes morph the live procedural scene at a beat boundary without resetting its sequence; style changes retain crossfades.
- **Event cues:** eligible terminal success and failure events use quiet one-shot cues with configurable volume, deduplication, and a 20-second cooldown.
- **Privacy:** shell integration records lifecycle timing and outcome only, never command text or terminal output.
- **Verification:** strict compilation, player syntax checking, 20 deterministic unit tests, Extension Host coverage, dependency audit, and validated VSIX packaging.

## Acceptance criteria

- A short terminal command neither enters Completed nor requests a cue.
- A long command can enter Waiting and produces at most one eligible completion or failure cue.
- Repeated eligible completions inside the cooldown do not produce repeated cues.
- Context changes inside Ambient, Jazz, or Lo-fi preserve the running musical sequence.
- Changing styles still produces a beat-aligned crossfade.
- The extension passes unit and Extension Host tests on VS Code 1.95.3 and current stable.
- The packaged extension remains content-free, local-first, and below 2 MB.

## Deferred to 0.3.x

- Opt-in bring-your-own-token AI music providers
- Provider credentials in VS Code SecretStorage
- Content-free provider request schema, caching, budgets, provenance, and offline fallback
- Cursor-specific context until a supported API exists
- Small user pilot and opt-in feedback design
