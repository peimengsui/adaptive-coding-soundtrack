# Privacy

Adaptive Coding Soundtrack is local-first and makes no network requests.

The extension processes activity type, timestamp, public language ID, execution lifecycle, active-file diagnostic severity counts, and editor focus. It does not store or transmit source text, file paths, diagnostic messages, terminal command text, prompts, credentials, or workspace contents.

The built-in provider generates audio locally with Web Audio. Settings are stored through VS Code's configuration system. The output diagnostic channel contains state names, confidence values, reasons, track identifiers, and Web Audio lifecycle status only.

Future remote providers must be separately opt-in and document their own data, licensing, retention, and credential behavior before release.
