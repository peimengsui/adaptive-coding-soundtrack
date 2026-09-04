# Adaptive Coding Soundtrack

Adaptive Coding Soundtrack is a local-first VS Code and Cursor extension that changes music as your coding flow changes. Version 0.3.1 hardens the 0.3 provider release with cache repair and interrupted-session recovery while keeping the free procedural engine as the default and automatic fallback.

Start a session, choose **Ambient**, **Jazz**, or **Lo-fi**, and code normally. The status bar reports the inferred state—for example, `♫ Jazz · Deep Focus`—while a small Webview synthesizes the soundtrack locally with Web Audio.

No account, API key, or network connection is required for the default local mode.

## Features

- Six explainable states: Idle, Active Coding, Deep Focus, Waiting, Reviewing, and Completed
- Signals from edits, saves, navigation, tasks, shell-integrated terminal commands, debug sessions, editor focus, and active-file diagnostic severity counts
- Terminal continuity: short commands do not trigger completion transitions or cues, while long commands can enter Waiting
- Throttled one-shot terminal completion and failure cues that layer over the soundtrack
- An explicit Resume override for Idle auto-pause, with accurate pause-reason messaging
- Responsive, Balanced, and Calm local sensitivity profiles
- Transition hysteresis and confidence gating to reduce musical churn
- Ambient, Jazz, and Lo-fi procedural arrangements with deterministic variation
- Persistent same-style sequences with in-place morphing, plus beat-aligned style crossfades
- Schedule-ahead timing, stereo placement, compression, filtering, and reverb
- Commands for playback, style, volume, calibration, state explanation, and diagnostics
- Opt-in ElevenLabs Music v2, Google Lyria 3 Pro Preview, and Stable Audio 3 adapters
- API keys stored only in VS Code Secret Storage, never settings or logs
- Detailed style prompts, preview-before-generation, cancellation, timeouts, a one-attempt default daily ceiling, local fallback, and provider provenance
- Paid generation only after explicit confirmation; selecting a provider or encountering a cache miss never spends credits
- One cached AI track per provider/model/style/duration, with local adaptation across ordinary context changes
- A 250 MB least-recently-used MP3 cache with inspection and per-track deletion
- Startup cache repair that removes invalid entries and interrupted writes while preserving orphaned paid MP3s
- An explicit resume offer after a soundtrack session is interrupted by an editor reload or shutdown
- No runtime npm dependencies or bundled recordings

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
AdaptiveMusicProvider   local default or one opt-in remote adapter
        ↓
Track                    procedural recipe or cached generated MP3
        ↓
WebviewAudioPlayer       local Web Audio scheduling and mixing
```

`MusicSessionController` applies confidence gating, coordinates playback, updates the status bar, and writes content-free lifecycle information to the **Adaptive Music** output channel. The core engine and director import no VS Code APIs. Remote adapters receive only musical controls derived from `MusicRequest`.

## Context inference

| State | Primary evidence |
|---|---|
| Active Coding | Recent edits; repeated edits raise confidence and intensity |
| Deep Focus | Sustained editing with a recent change |
| Waiting | A task, terminal command, or debug session is active and editing has paused |
| Completed | A task or debug session ends successfully |
| Reviewing | Navigation, low-intensity activity, diagnostics, or a failed execution |
| Idle | No recent activity; a shorter timeout applies while the editor is unfocused |

Critical transitions—Idle, Waiting, and Completed—are immediate. Other transitions are debounced. Low-confidence non-critical changes keep the current track instead of forcing a switch. Failed tasks move to Reviewing rather than Completed.

Terminal command events require VS Code shell integration. By default, quick commands do not trigger a completion transition or cue; a command running for at least five seconds can enter Waiting and plays one throttled completion or failure cue when it ends. The extension observes lifecycle, duration, and exit code only; it deliberately does not read command text or terminal output. Set `adaptiveMusic.terminalAdaptation` to `off` to ignore terminal executions or `all` to cue every command with a known outcome.

Diagnostic integration counts Error and Warning severities for the active document without reading messages.

The extension does not claim to observe Cursor Agent internals. `ActivityCollector` is isolated so a future supported `CursorContextAdapter` can provide normalized signals without changing music logic.

## Audio engine

There are no soundtrack files. `LocalProceduralMusicProvider` creates deterministic recipes containing tempo, scale, chord progression, density, swing, humanization, timbre, filter, reverb, and variation seed. `media/player.js` schedules original tones and seeded noise with the Web Audio API.

When coding context changes within the selected style, the existing sequence keeps its musical position and morphs the synthesis recipe at a beat boundary instead of starting over. Style changes still crossfade through separate scene buses. Completion and failure cues use a separate one-shot layer, so they do not reset the background arrangement. A shared compressor controls peaks; per-scene filtering, stereo placement, and convolution reverb provide separation. The player persists volume and its last track identifier in Webview state and exposes AudioContext lifecycle diagnostics.

Web Audio is part of the editor's embedded Chromium runtime. It has no usage fee. The extension includes no third-party recordings.

For a remote source, normal playback is cache-only. A paid request occurs only after the user invokes **Generate and Cache Current Style** and accepts its modal confirmation. The resulting instrumental MP3 is stored once per provider/model/style/duration under the extension's private global-storage directory. Energy and brightness changes are applied locally with Web Audio filters and gain, so Flow, Focus, Waiting, Review, and completion cues reuse the same style asset. Cursor receives the cached bytes through a Webview-scoped Blob; the player never receives the API key or raw filesystem path.

## Optional AI providers

You do **not** need accounts for all three providers. The local engine and automated tests need none. For live acceptance testing, create an account and key for only the provider you want to exercise; testing every adapter end-to-end requires three separate accounts because the services do not share credentials.

| Provider | Implemented model/API | Live-test requirement |
|---|---|---|
| ElevenLabs | Music v2 streaming | ElevenLabs account with paid Music API access and an [API key](https://elevenlabs.io/app/settings/api-keys) |
| Google | Lyria 3 Pro Preview through the Gemini API | Google AI Studio key from a project with paid-tier Lyria access; create a key in [AI Studio](https://aistudio.google.com/apikey) |
| Stability AI | Stable Audio 3 | Stability account, [API key](https://platform.stability.ai/account/keys), and enough credits for a generation |

To configure one:

1. Run **Adaptive Music: Choose Music Source**.
2. Select a remote provider.
3. Choose **Add API Key**, or run **Adaptive Music: Configure AI Provider**.
4. Run **Adaptive Music: Test Provider Connection**. This validates access without generating music.
5. Start a session. A cache miss plays clearly labeled local procedural audio and makes no paid request.
6. Optionally run **Adaptive Music: Preview Generation Prompt**.
7. Run **Adaptive Music: Generate and Cache Current Style** and confirm the provider-credit warning. Later context changes reuse that style's cached MP3.

Keys are password-masked and stored through VS Code Secret Storage. Do not paste a key into source, settings JSON, an issue, or the Adaptive Music output channel. Use **Adaptive Music: Remove Provider API Key** to delete one.

## Install a packaged build

Build the VSIX:

```bash
npm ci
npm run verify
```

Then open the Extensions view, choose **… → Install from VSIX…**, and select `adaptive-coding-soundtrack-0.3.1.vsix`.

VS Code CLI alternative:

```bash
code --install-extension adaptive-coding-soundtrack-0.3.1.vsix
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
  "adaptiveMusic.terminalMinimumDurationSeconds": 3,
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
| Adaptive Music: Choose Music Source | Select local audio or one remote provider |
| Adaptive Music: Configure AI Provider | Save a provider key in Secret Storage |
| Adaptive Music: Test Provider Connection | Validate key and model access without generating a track |
| Adaptive Music: Remove Provider API Key | Delete one saved key |
| Adaptive Music: Generate and Cache Current Style | Explicitly confirm one paid generation and cache or replace the selected style |
| Adaptive Music: Preview Generation Prompt | Inspect the exact musical prompt before sending anything |
| Adaptive Music: Show Generated Music Cache | Inspect cached provider/style assets and optionally delete one |
| Adaptive Music: Clear Generated Music Cache | Stop playback and delete cached generated MP3 files |

## Settings

| Setting | Default | Purpose |
|---|---:|---|
| `adaptiveMusic.defaultStyle` | `ambient` | Ambient, Jazz, or Lo-fi |
| `adaptiveMusic.musicSource` | `local` | Local, ElevenLabs, Google Lyria, or Stability AI |
| `adaptiveMusic.generatedTrackDurationSeconds` | `30` | Duration of an explicitly confirmed generated track |
| `adaptiveMusic.generatedCacheSizeMb` | `250` | LRU cache ceiling |
| `adaptiveMusic.remoteRequestTimeoutSeconds` | `300` | Timeout for an explicitly confirmed generation |
| `adaptiveMusic.remoteDailyGenerationLimit` | `1` | Explicit attempts per provider per UTC day; failed attempts count; 0 disables the ceiling |
| `adaptiveMusic.customPromptSuffix` | empty | Optional user-written musical direction appended to generation prompts |
| `adaptiveMusic.volume` | `0.45` | Playback gain from 0–1 |
| `adaptiveMusic.adaptiveSwitching` | `true` | Enable context-driven changes |
| `adaptiveMusic.contextSensitivity` | `balanced` | Globally tune reaction speed and edit requirements |
| `adaptiveMusic.minimumAdaptiveConfidence` | `0.65` | Suppress uncertain non-critical track changes |
| `adaptiveMusic.transitionDebounceMs` | `1500` | Stability delay for non-critical transitions |
| `adaptiveMusic.idleTimeoutSeconds` | `120` | Inactivity before Idle |
| `adaptiveMusic.unfocusedIdleSeconds` | `30` | Idle delay while the editor is unfocused |
| `adaptiveMusic.waitingDetectionSeconds` | `8` | Editing pause during execution before Waiting |
| `adaptiveMusic.terminalAdaptation` | `longRunningOnly` | Ignore, adapt only to long-running completions, or cue all terminal executions |
| `adaptiveMusic.terminalMinimumDurationSeconds` | `5` | Long-command threshold for completion/failure cues |
| `adaptiveMusic.completionCueCooldownSeconds` | `20` | Minimum interval between terminal cues |
| `adaptiveMusic.eventCueVolume` | `0.18` | Relative volume of completion/failure cues |
| `adaptiveMusic.deepFocusSeconds` | `90` | Sustained editing before Deep Focus |
| `adaptiveMusic.completedCueSeconds` | `8` | Duration of Completed |
| `adaptiveMusic.fadeDurationMs` | `1400` | Playback crossfade duration |

## Development and verification

```bash
npm run compile           # TypeScript build
npm run lint              # strict type-check + player JavaScript syntax
npm test                  # deterministic core, cache, prompt, and adapter tests
npm run test:integration  # real Extension Host activation/Webview tests
npm run package           # build the VSIX
npm run check:package     # validate required/prohibited VSIX contents and size
npm run verify            # clean, lint, unit test, package, validate
```

The integration runner accepts `VSCODE_TEST_VERSION`; CI tests both VS Code 1.95.3 and the current stable release. Cursor compatibility remains a manual smoke test because Cursor does not provide the same headless Extension Host distribution.

GitHub Actions workflows provide pull-request verification, a validated VSIX artifact, dependency updates, and tag-driven GitHub releases. The `adaptive-soundtrack` publisher and public repository metadata are configured; Marketplace credentials remain outside this repository.

## Project structure

```text
src/core/          context inference, music direction, local provider, contracts
src/providers/     remote clients, orchestration, private MP3 cache, prompt builder
src/vscode/        activity adapter, credentials, controller, Webview host
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
interface RemoteMusicClient {
  generate(request, apiKey, signal): Promise<RemoteGenerationResult>;
  testConnection(apiKey, signal): Promise<string>;
}
```

Register it with `AdaptiveMusicProvider` and add the source to the manifest. The shared orchestrator handles explicit confirmation, cancellation, content-free automatic prompting, caching, generation limits, attribution, and local fallback without changing the Context Engine or Music Director.

## Privacy and security

The extension records no source content and has no product telemetry. Selecting a remote provider makes no network request. Network access occurs only when the user explicitly tests a provider connection or confirms a paid generation, as described in `PRIVACY.md`.

- No source text, filenames, prompts, diagnostic messages, terminal commands, or terminal output
- No product telemetry
- Remote keys live in VS Code Secret Storage and are sent only to the selected provider
- Automatically constructed remote prompts contain musical controls only. An optional custom suffix is sent verbatim after a previewable privacy warning.
- No runtime npm dependencies
- No execution of workspace commands by the extension

## Known limitations

- Context remains heuristic and cannot determine developer intent semantically.
- Terminal command signals depend on shell integration.
- Standard VS Code APIs do not expose other extensions' complete test-result lifecycle, so configured test tasks are observed as tasks.
- Debug termination does not expose success/failure and is treated as a neutral successful Completed state.
- Chromium may require one **Enable Audio** click per new player Webview.
- Each provider/model/style/duration has one cached AI asset; an uncached style plays clearly labeled procedural audio until the user explicitly generates it.
- An interrupted session is never silently restarted; the extension offers an explicit Resume Session action after reload or restart.
- Cursor Agent internal state is unavailable through standard APIs.
- Remote APIs can change, incur provider charges, enforce regional/model access, or reject a key. Local fallback remains available.
- Google Lyria 3 Pro is a preview API and may change before general availability.

## Future roadmap

- Evaluate the official Suno API once its detailed documentation, pricing, licensing, and availability are mature enough for a stable adapter.
- Add provider-specific cost estimates without transmitting prompts, credentials, or workspace content.
- Explore longer-lived or streaming generation only where it can preserve musical continuity and bounded cost.
- Add Cursor-specific context only when a supported public API exists.

## License

MIT. The extension includes no third-party recordings.
