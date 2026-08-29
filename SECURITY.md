# Security Policy

## Supported versions

Security fixes are provided for the latest released version.

## Reporting

Do not open a public issue containing credentials, source code, or private workspace data. Use GitHub's private vulnerability reporting when it is available for this repository. Otherwise, open only a minimal public issue using synthetic files and ask the maintainer for a private reporting channel.

The extension has no runtime npm dependencies and does not execute workspace commands. Local mode is offline. Opt-in remote mode connects only to the selected provider's official HTTPS API.

Provider keys are accepted in a password-masked input, stored through VS Code Secret Storage, excluded from settings and diagnostic output, and removed through **Adaptive Music: Remove Provider API Key**. Provider failures are reduced to status-only messages so response bodies cannot echo credentials. Never include an API key in a bug report.

Generated audio is validated as a non-empty MP3 before it is cached. Cached files live in the extension's private global-storage directory and are transferred to the player as a Webview-scoped Blob. The Webview content security policy permits only packaged scripts/styles and Blob media. Paid generation requires a user-invoked command or player button followed by modal confirmation; selecting a provider and cache misses never generate automatically.
