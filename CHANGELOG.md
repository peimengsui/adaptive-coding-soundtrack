# Changelog

## 0.3.0

- Added opt-in bring-your-own-key adapters for ElevenLabs Music v2, Google Lyria 3 Pro Preview, and Stability AI Stable Audio 3.
- Stored keys in VS Code Secret Storage and added configure, test, remove, source-selection, prompt-preview, explicit-generation, and cache-management commands.
- Required modal confirmation for every paid generation; provider selection and cache misses never spend credits. Added cancellation/timeouts, a default one-attempt daily ceiling, safe errors, and clearly labeled local fallback.
- Added detailed Ambient, Jazz, and Lo-fi prompt profiles with instrumentation, production language, exclusions, and an optional previewable custom suffix.
- Added a 250 MB LRU MP3 cache keyed by provider, model, style, and duration. All context intents reuse and locally adapt the same style asset without restarting or generating again.
- Added generated-audio Webview playback, in-place filter/gain adaptation, crossfades, provenance, and local completion/failure cues.
- Fixed Cursor playback of cached generated MP3s by transferring cache data to a Webview-scoped Blob instead of relying on unsupported global-storage media URLs.
- Added truthful provider/fallback labels, a one-click Generate action for missing styles, cache inventory, per-track deletion, and legacy cache reuse.
- Added deterministic mock tests for all three APIs, explicit-only generation, style cache reuse/migration/eviction, fallback, prompt profiles/privacy, and credential-redaction behavior.
- Added Suno's official API to the future roadmap pending mature public documentation and commercial terms.

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
