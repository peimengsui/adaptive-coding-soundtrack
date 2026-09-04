# Privacy

Adaptive Coding Soundtrack is local-first. With the default `local` music source, it makes no network requests.

The extension processes activity type, timestamp, public language ID, execution lifecycle, duration and outcome, active-file diagnostic severity counts, and editor focus. It does not read or transmit source text, file paths, diagnostic messages, terminal command text, terminal output, or workspace contents.

The built-in provider generates audio locally with Web Audio. Settings are stored through VS Code's configuration system. The output diagnostic channel contains state names, confidence values, reasons, track identifiers, provider names, cache status, and Web Audio lifecycle status only.

Selecting ElevenLabs, Google Lyria, or Stability AI does not make a network request. When a user explicitly confirms **Generate and Cache Current Style**, the extension sends that provider:

- the user's provider API key;
- a generated instrumental-music prompt containing duration, style, broad musical intent, instrumentation, production guidance, tempo, energy, complexity, and brightness;
- the optional `adaptiveMusic.customPromptSuffix`, if the user configured one; and
- normal HTTPS request metadata such as IP address and user agent.

The automatically constructed portion of the prompt never contains source code, filenames, workspace names, language IDs, terminal commands or output, diagnostic text, or Cursor/VS Code chat content. The optional custom suffix is user-authored and sent verbatim after being shown by **Preview Generation Prompt**; users should not place private workspace data or secrets in it. Provider keys are stored through VS Code Secret Storage, not settings or repository files, and are sent only to the selected provider's official API. Connection tests send a key but do not request music.

Generated MP3 files and content-free metadata are stored in the extension's private global-storage directory. The cache stores provider, model, style, duration, timestamps, size, and a hashed asset key; it does not store prompts or credentials. The least-recently-used cache defaults to 250 MB. **Show Generated Music Cache** can inspect or delete one asset, **Clear Generated Music Cache** deletes all assets, and **Remove Provider API Key** deletes a saved key.

The extension has no product telemetry. Each remote music provider independently controls its service-side logging, retention, training, licensing, billing, and deletion behavior under its own terms and privacy policy.
