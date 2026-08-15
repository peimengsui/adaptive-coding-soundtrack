# Adaptive Coding Soundtrack

Adaptive Coding Soundtrack is a local-first VS Code extension that changes its music as your coding flow changes. It runs in both VS Code and Cursor using standard VS Code Extension APIs.

Start a session, choose **Ambient**, **Jazz**, or **Lo-fi**, and code normally. The status bar reports the inferred state—for example, `♫ Jazz · Deep Focus`—while a small Webview generates original music locally with the Web Audio API.

No account, API key, network connection, or commercial music catalog is required.

## Features

- Deterministic detection of Idle, Active Coding, Deep Focus, Waiting, Reviewing, and Completed
- Adaptive procedural music for Ambient, Jazz, and Lo-fi
- Status bar state, intensity, confidence, language, and task feedback
- Pause/resume, style selection, volume, stop, and player commands
- Crossfaded state/style transitions and idle auto-pause
- Local-only activity processing and audio generation
- Provider boundary ready for future local, CDN, or AI music providers

## Architecture

```text
VS Code / Cursor events
        ↓
ActivityCollector       (content-free activity metadata)
        ↓
ContextEngine           (pure deterministic heuristics)
        ↓
CodingContext
        ↓
MusicDirector           (musical intent, no audio implementation)
        ↓
MusicRequest
        ↓
MusicProvider           (MVP: LocalProceduralMusicProvider)
        ↓
Track                    (procedural synthesis recipe)
        ↓
WebviewAudioPlayer       (Web Audio playback and crossfades)
```

`MusicSessionController` coordinates these layers and the status bar. The core engine, director, and provider import no VS Code APIs, so they run in ordinary unit tests.

### Coding-state inference

The Activity Collector observes event metadata from standard APIs. It never reads document text or file contents.

| State | Explainable MVP heuristic |
|---|---|
| Active Coding | A recent text edit; repeated edits increase intensity and confidence |
| Deep Focus | Sustained editing for the configured focus duration, with a recent edit |
| Waiting | A VS Code Task is running and editing has stopped for the configured delay |
| Completed | A VS Code Task ended; held briefly as a completion cue |
| Reviewing | Recent editor/file/selection navigation with little editing |
| Idle | No observed activity for the configured idle duration |

The engine reevaluates once per second, so time-based states change even without a new event. New editing clears a completion cue. The MVP does not claim to observe Cursor Agent internals; a future `CursorContextAdapter` can supply normalized signals if a supported API becomes available.

### Music direction

The Music Director maps coding state, intensity, and style into technology-neutral intent: energy, complexity, stability, brightness, tempo, and whether playback should continue.

- Deep Focus favors stable, low-complexity music.
- Waiting becomes more melodic and anticipatory.
- Reviewing uses lower energy.
- Completed produces a short, brighter transition.
- Idle fades to pause; coding activity restarts playback.

Track selection uses a coarse energy band so every keystroke does not restart the soundtrack.

## Requirements

- VS Code 1.90 or newer, or a compatible recent Cursor release
- Node.js 20 or newer for development
- npm

The installed extension has no runtime npm dependencies.

## Install a packaged build

After running `npm run package`, install `adaptive-coding-soundtrack-0.1.0.vsix`:

1. Open the Extensions view.
2. Open the `…` menu.
3. Choose **Install from VSIX…**.
4. Select the generated VSIX.
5. Reload if prompted.

VS Code CLI alternative:

```bash
code --install-extension adaptive-coding-soundtrack-0.1.0.vsix
```

## Run from source

```bash
npm install
npm test
```

Open this repository in VS Code or Cursor and press `F5`. The launch configuration compiles the extension and opens an Extension Development Host. If needed, open **Run and Debug**, choose **Run Adaptive Coding Soundtrack**, and start debugging.

## Demo in Cursor or VS Code

1. Open this repository in the editor.
2. Run `npm install`, then `npm test`.
3. Press `F5` to launch **Run Adaptive Coding Soundtrack**.
4. In the Extension Development Host, open any TypeScript or Python file.
5. Run **Adaptive Music: Start Session** and select **Jazz**.
6. If Chromium blocks sound, click **Enable Audio** once.
7. Edit continuously. The status bar moves from Active Coding toward Deep Focus.
8. Run a VS Code Task and stop editing. The state becomes Waiting.
9. End the task. The state briefly becomes Completed.
10. Try Pause/Resume, Choose Style, Set Volume, and Stop Session.

For a faster demo, use:

```json
{
  "adaptiveMusic.deepFocusSeconds": 15,
  "adaptiveMusic.waitingDetectionSeconds": 3,
  "adaptiveMusic.completedCueSeconds": 5,
  "adaptiveMusic.idleTimeoutSeconds": 30
}
```

Cursor receives the same standard editor, document, task, and terminal signals as VS Code. Cursor-specific agent state is not used.

## Commands

| Command | Behavior |
|---|---|
| Adaptive Music: Start Session | Choose a style, show the player, and begin adapting |
| Adaptive Music: Stop Session | Fade/stop playback and remove the status item |
| Adaptive Music: Pause/Resume | Toggle playback; also available by clicking the status item |
| Adaptive Music: Choose Style | Switch style with a crossfade and persist the default |
| Adaptive Music: Set Volume | Set and persist a value from 0–100 |
| Adaptive Music: Show Current State | Display state, intensity, confidence, language, and task signal |
| Adaptive Music: Show Player | Reveal the player Webview |

## Settings

| Setting | Default | Purpose |
|---|---:|---|
| `adaptiveMusic.defaultStyle` | `ambient` | Ambient, Jazz, or Lo-fi |
| `adaptiveMusic.volume` | `0.45` | Playback gain from 0–1 |
| `adaptiveMusic.adaptiveSwitching` | `true` | Enable context-driven changes |
| `adaptiveMusic.idleTimeoutSeconds` | `120` | Inactivity before Idle |
| `adaptiveMusic.waitingDetectionSeconds` | `8` | Editing pause during a task before Waiting |
| `adaptiveMusic.deepFocusSeconds` | `90` | Sustained editing before Deep Focus |
| `adaptiveMusic.completedCueSeconds` | `8` | Duration of Completed |
| `adaptiveMusic.fadeDurationMs` | `1400` | Playback transition fade |

## Testing and packaging

```bash
npm test          # compile and run pure core tests
npm run lint      # strict TypeScript check
npm run package   # create the installable VSIX
```

The tests cover typing, sustained focus, task waiting/completion, navigation, inactivity, deterministic music direction, style/intensity mapping, and provider selection. Audio requires a real Extension Development Host; follow the demo procedure for playback validation.

## Project structure

```text
src/core/     context inference, music direction, provider, contracts
src/vscode/   activity adapter, session controller, Web Audio player
src/test/     pure unit tests
src/extension.ts
.vscode/      Extension Host launch and build tasks
PLAN.md       MVP plan and acceptance criteria
```

## How music assets work

There are no bundled recordings. `LocalProceduralMusicProvider` returns `Track` objects containing tempo, scale, chord progression, texture, density, and warmth. The Webview synthesizes them locally using oscillators, filters, seeded noise, and envelopes. This avoids licensing ambiguity and keeps the VSIX small.

To add a local style, add a profile in `src/core/localProceduralMusicProvider.ts`, add it to `MUSIC_STYLES` and the configuration enum, implement any new texture in the player, and add a deterministic test.

To add another provider, implement:

```ts
interface MusicProvider {
  getTrack(request: MusicRequest): Promise<Track>;
}
```

Inject it where `LocalProceduralMusicProvider` is constructed. Production providers should handle cancellation, caching, offline behavior, rate limits, attribution, and errors without changing the Context Engine or Music Director.

## Privacy

- Records event kinds, timestamps, language ID, and whether a task is active
- Does not read or send source code, edits, filenames, prompts, terminal contents, or workspace contents
- Makes no network requests
- Generates music inside the local Webview

## Known limitations

- Inference is heuristic, not semantic.
- Only VS Code Tasks—not arbitrary shell commands—produce Waiting and Completed.
- Chromium may require one **Enable Audio** click per Webview.
- Procedural audio favors an unobtrusive prototype over studio-quality composition.
- Closing the player stops the session.
- There is no Cursor Agent internal-state integration.

## Future AI Music Integration

Future providers could translate `MusicRequest` into prompts or controls for **Google Lyria / Lyria RealTime**, **ElevenLabs Music**, or **Stable Audio**. A remote provider should add explicit opt-in, disclosure, credentials in VS Code Secrets, cancellation, caching, provenance/licensing metadata, quotas, and guarantees that source code and workspace contents never enter prompts. The local provider remains the offline fallback.

## License

MIT. No third-party recordings are included.
