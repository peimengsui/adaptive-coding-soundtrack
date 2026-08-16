# Adaptive Coding Soundtrack 0.2 Release Plan

## Objective

Turn the working MVP into a hardened local-first beta without adding telemetry, proprietary Cursor dependencies, external music services, or a user pilot.

## Completed scope

- **Release hardening:** expanded unit coverage, real Extension Host tests, package-content validation, zero production vulnerability audit, CI, release automation, Dependabot, support/security/privacy documents, icon, and clean VSIX contents.
- **Context accuracy:** task outcomes, terminal shell execution, debug lifecycle, focus, active-file diagnostic counts, failure-aware completion, explainable reasons, transition hysteresis, confidence gating, and three local sensitivity profiles.
- **Audio quality:** external maintainable player assets, deterministic variation, schedule-ahead timing, beat-aligned transitions, stereo placement, filtering, compression, convolution reverb, persisted Webview preferences, and lifecycle diagnostics.
- **Distribution:** versioned `0.2.0` manifest, UI extension placement, untrusted-workspace declaration, gallery artwork, CI artifact, tag-driven GitHub releases, issue template, and release documentation.

## Acceptance criteria

- Strict compilation and player syntax validation pass.
- All deterministic core tests pass.
- Extension activation, command registration, configuration defaults, and player lifecycle pass in real Extension Hosts.
- Compatibility tests pass on VS Code 1.95.3 and current stable.
- Production dependency audit reports no vulnerabilities.
- VSIX contains only required runtime, media, license, and documentation files and remains below 2 MB.
- Cursor and VS Code retain working start/style/audio/control behavior.
- No source, paths, terminal contents, diagnostic messages, or prompts are stored or transmitted.

## Deferred

- Small user pilot and telemetry/feedback design
- Marketplace publication credentials and final publisher/repository metadata
- External or AI music providers
- Cursor-specific context until a supported API exists
