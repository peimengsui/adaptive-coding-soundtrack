# Adaptive Coding Soundtrack MVP Plan

## Goal

Deliver a local-first VS Code extension, compatible with Cursor, that infers coding states from standard editor events and adapts an original procedural soundtrack.

## Architecture

1. `ActivityCollector` translates VS Code events into content-free signals.
2. `ContextEngine` maps signals and configured timings to `CodingContext`.
3. `MusicDirector` maps context and style to `MusicRequest`.
4. `MusicProvider` resolves the request to a `Track`.
5. `WebviewAudioPlayer` renders original audio with Web Audio.
6. `MusicSessionController` coordinates commands and the status bar.

## Acceptance criteria

- Compiles and launches in VS Code and Cursor.
- Start/stop, three styles, pause/resume, and volume work.
- Status bar shows style and state.
- Six configured deterministic states are detected.
- Task waiting and completion are recognized.
- Music reacts with faded transitions.
- All processing remains local.
- Core behavior is unit-tested.
- Build, tests, type-checking, and VSIX packaging pass.
- README documents the complete workflow and extension points.
