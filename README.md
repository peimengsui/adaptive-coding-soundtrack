# Adaptive Coding Soundtrack

Adaptive Coding Soundtrack is a local-first VS Code and Cursor extension that changes original procedural music as your coding flow changes.

Start a session, choose **Ambient**, **Jazz**, or **Lo-fi**, and code normally. The status bar reports the inferred state—for example, `♫ Jazz · Deep Focus`—while a small Webview synthesizes the soundtrack locally with Web Audio.

No music catalog, account, API key, or network connection is required.

## Features

- Six explainable states: Idle, Active Coding, Deep Focus, Waiting, Reviewing, and Completed
- Signals from edits, saves, navigation, tasks, shell-integrated terminal commands, debug sessions, editor focus, and active-file diagnostic severity counts
- Failure-aware completion: failed tasks and commands do not trigger a celebration cue
- Responsive, Balanced, and Calm local sensitivity profiles
- Transition hysteresis and confidence gating to reduce musical churn
- Ambient, Jazz, and Lo-fi procedural arrangements with deterministic variation
- Schedule-ahead timing, beat-aligned crossfades, stereo placement, compression, filtering, and reverb
- Commands for playback, style, volume, calibration, state explanation, and diagnostics
- No runtime npm dependencies, external requests, or bundled recordings

## Architecture

```text
VS Code / Cursor events
        ↓
ActivityCollector       content-free, standard-API event adapter
        ↓
ContextEngine           deterministic heuristics + hysteresis
        ↓
CodingContext           state, intensity, confidence, reason
        ↓
MusicDirector           musical intent, independent of playback
        ↓
MusicRequest
        ↓
MusicProvider           MVP: LocalProceduralMusicProvider
        ↓
Track                    procedural synthesis recipe
        ↓
WebviewAudioPlayer       local Web Audio scheduling and mixing
```

`MusicSessionController` applies confidence gating, coordinates playback, updates the status bar, and writes content-free lifecycle information to the **Adaptive Music** output channel. The core engine, director, and provider import no VS Code APIs.

## Context inference

| State | Primary evidence |
|---|---|
| Active Coding | Recent edits; repeated edits raise confidence and intensity |
| Deep Focus | Sustained editing with a recent change |
| Waiting | A task, terminal command, or debug session is active and editing has paused |
| Completed | A task, terminal command, or debug session ends successfully |
| Reviewing | Navigation, low-intensity activity, diagnostics, or a failed execution |
| Idle | No recent activity; a shorter timeout applies while the editor is unfocused |

Critical transitions—Idle, Waiting, and Completed—are immediate. Other transitions are debounced. Low-confidence non-critical changes keep the current track instead of forcing a switch.

Terminal command events require VS Code shell integration. The extension observes lifecycle and exit code only; it deliberately does not read command text or terminal output. Diagnostic integration counts Error and Warning severities for the active document without reading messages.

The extension does not claim to observe Cursor Agent internals. `ActivityCollector` is isolated so a future supported `CursorContextAdapter` can provide normalized signals without changing music logic.

## Audio engine

There are no soundtrack files. `LocalProceduralMusicProvider` creates deterministic recipes containing tempo, scale, chord progression, density, swing, humanization, timbre, filter, reverb, and variation seed. `media/player.js` schedules original tones and seeded noise with the Web Audio API.

Track changes align to the next beat and crossfade through separate scene buses. A shared compressor controls peaks; per-scene filtering, stereo placement, and convolution reverb provide separation. The player persists volume and its last track identifier in Webview state and exposes AudioContext lifecycle diagnostics.

Web Audio is part of the editor's embedded Chromium runtime. It has no usage fee. The extension includes no third-party recordings.

## Install a packaged build

Build the VSIX:

```bash
npm ci
npm run verify
```

Then open the Extensions view, choose **… → Install from VSIX…**, and select `adaptive-coding-soundtrack-0.2.0.vsix`.

VS Code CLI alternative:

```bash
code --install-extension adaptive-coding-soundtrack-0.2.0.vsix
```

## Run from source

```bash
npm ci
npm test
npm run test:integration
```

Open the repository in VS Code or Cursor and press `F5`. The included launch configuration compiles the extension and opens an Extension Development Host. If needed, open **Run and Debug**, choose **Run Adaptive Coding Soundtrack**, and start debugging.

In the Development Host:

1. Open a TypeScript or Python file.
2. Run **Adaptive Music: Start Session** from the Command Palette.
3. Choose a style.
4. Click **Enable Audio** if Chromium requires a user gesture.
5. Edit, navigate, run a task, or start a debug session.
6. Hover over the status item to see confidence and the transition reason.
7. Run **Adaptive Music: Show Diagnostics** for content-free context and audio lifecycle logs.

For a faster demo:

```json
{
  "adaptiveMusic.deepFocusSeconds": 15,
  "adaptiveMusic.waitingDetectionSeconds": 3,
  "adaptiveMusic.completedCueSeconds": 5,
  "adaptiveMusic.idleTimeoutSeconds": 30
}
```

## Commands

| Command | Behavior |
|---|---|
| Adaptive Music: Start Session | Choose a style and begin adapting |
| Adaptive Music: Stop Session | Stop playback and close the player |
| Adaptive Music: Pause/Resume | Toggle user-controlled playback |
| Adaptive Music: Choose Style | Crossfade to another style and persist it |
| Adaptive Music: Set Volume | Set and persist volume from 0–100 |
| Adaptive Music: Calibrate Sensitivity | Select Responsive, Balanced, or Calm |
| Adaptive Music: Show Current State | Explain current state, confidence, signals, and diagnostics |
| Adaptive Music: Show Diagnostics | Open the privacy-safe output channel |
| Adaptive Music: Show Player | Reveal the player Webview |

## Settings

| Setting | Default | Purpose |
|---|---:|---|
| `adaptiveMusic.defaultStyle` | `ambient` | Ambient, Jazz, or Lo-fi |
| `adaptiveMusic.volume` | `0.45` | Playback gain from 0–1 |
| `adaptiveMusic.adaptiveSwitching` | `true` | Enable context-driven changes |
| `adaptiveMusic.contextSensitivity` | `balanced` | Globally tune reaction speed and edit requirements |
| `adaptiveMusic.minimumAdaptiveConfidence` | `0.65` | Suppress uncertain non-critical track changes |
| `adaptiveMusic.transitionDebounceMs` | `1500` | Stability delay for non-critical transitions |
| `adaptiveMusic.idleTimeoutSeconds` | `120` | Inactivity before Idle |
| `adaptiveMusic.unfocusedIdleSeconds` | `30` | Idle delay while the editor is unfocused |
| `adaptiveMusic.waitingDetectionSeconds` | `8` | Editing pause during execution before Waiting |
| `adaptiveMusic.deepFocusSeconds` | `90` | Sustained editing before Deep Focus |
| `adaptiveMusic.completedCueSeconds` | `8` | Duration of Completed |
| `adaptiveMusic.fadeDurationMs` | `1400` | Playback crossfade duration |

## Development and verification

```bash
npm run compile           # TypeScript build
npm run lint              # strict type-check + player JavaScript syntax
npm test                  # 15 deterministic core tests
npm run test:integration  # real Extension Host activation/Webview tests
npm run package           # build the VSIX
npm run check:package     # validate required/prohibited VSIX contents and size
npm run verify            # clean, lint, unit test, package, validate
```

The integration runner accepts `VSCODE_TEST_VERSION`; CI tests both VS Code 1.95.3 and the current stable release. Cursor compatibility remains a manual smoke test because Cursor does not provide the same headless Extension Host distribution.

GitHub Actions workflows provide pull-request verification, a validated VSIX artifact, dependency updates, and tag-driven GitHub releases. A public Marketplace release still requires replacing the placeholder `publisher`, adding the eventual repository URL, and configuring publisher credentials outside this repository.

## Project structure

```text
src/core/          context inference, music direction, provider, contracts
src/vscode/        activity adapter, controller, Webview host
src/test/          deterministic core tests
src/integration/   Extension Host tests
media/             player JavaScript/CSS and extension icon
scripts/           clean and VSIX validation utilities
.github/           CI, release, Dependabot, issue template
test-fixture/      synthetic integration-test workspace
```

## Add a style or provider

To add a local style, define its profile in `src/core/localProceduralMusicProvider.ts`, add it to `MUSIC_STYLES` and the manifest enum, extend the player only if a new synthesis capability is required, and add a deterministic test.

To add another provider, implement:

```ts
interface MusicProvider {
  getTrack(request: MusicRequest): Promise<Track>;
}
```

Inject it where `LocalProceduralMusicProvider` is constructed. Remote providers must handle cancellation, caching, offline fallback, quotas, attribution, provenance, and errors without changing the Context Engine or Music Director.

## Privacy and security

The extension records no source content and makes no network requests. Detailed policies ship as `PRIVACY.md` and `SECURITY.md`.

- No source text, filenames, prompts, diagnostic messages, terminal commands, or terminal output
- No telemetry
- No credentials
- No runtime npm dependencies
- No execution of workspace commands by the extension

## Known limitations

- Context remains heuristic and cannot determine developer intent semantically.
- Terminal command signals depend on shell integration.
- Standard VS Code APIs do not expose other extensions' complete test-result lifecycle, so configured test tasks are observed as tasks.
- Debug termination does not expose success/failure and is treated as a neutral successful completion cue.
- Chromium may require one **Enable Audio** click per new player Webview.
- A session is not automatically restarted after an editor reload.
- Cursor Agent internal state is unavailable through standard APIs.

## Future AI Music Integration

Future opt-in providers could translate `MusicRequest` into prompts or controls for Google Lyria / Lyria RealTime, ElevenLabs Music, or Stable Audio. They should use VS Code Secrets, cache generated tracks, display provider cost and provenance, offer the local provider as an offline fallback, and guarantee that source code and workspace contents never enter generation requests.

## License

MIT. The extension includes no third-party recordings.
