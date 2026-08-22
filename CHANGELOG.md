# Changelog

## 0.2.1

- Kept same-style music on one continuous sequence and morphed its tempo, harmony, density, filtering, and ambience in place.
- Prevented short shell-integrated terminal commands from entering Completed or restarting the soundtrack.
- Added configurable terminal adaptation modes, a long-command threshold, throttled completion/failure cues, and cue volume.
- Fixed Idle auto-pause so an explicit Resume works, and made the player display the real pause reason.
- Continued to observe terminal lifecycle, duration, and outcome only—never command text or output.
- Expanded regression coverage for long, short, disabled, and all-command terminal policies.

## 0.2.0

- Added task outcome, shell execution, debug, diagnostics, and window-focus context signals.
- Added transition hysteresis, confidence gating, and local sensitivity calibration.
- Prevented failed executions from triggering completion celebrations.
- Extracted and upgraded the Web Audio engine with deterministic variation, beat-aligned crossfades, stereo mixing, compression, filtering, and reverb.
- Added player and context diagnostics without source, command, or path content.
- Added Extension Host tests, package validation, CI, release automation, Dependabot, privacy/security/support documentation, and distribution artwork.
- Verified compatibility with VS Code 1.95.3 and current stable.

## 0.1.0

- Initial Adaptive Coding Soundtrack MVP.
- Deterministic local context inference for six coding states.
- Ambient, Jazz, and Lo-fi procedural playback with adaptive transitions.
- Status bar, commands, configuration, tests, and documentation.
