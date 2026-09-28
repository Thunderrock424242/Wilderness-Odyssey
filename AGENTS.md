Repository Guidelines

Project Purpose

This repository contains the Wilderness Odyssey Discord bot. The bot runs separately from the main Minecraft server on Kinetic Hosting and acts as the Discord-facing integration layer for Wilderness Odyssey.

Primary responsibilities include:

* Server status and player-count commands.
* Maintenance and outage notifications.
* Bug-report submission and routing.
* Staff and public announcements.
* Minecraft server health/status checks.
* Communication with approved Wilderness Odyssey backend services.
* Integration with the main Minecraft/Ollama server when required.

Keep the bot focused on Discord and service integration. Do not move Minecraft gameplay logic, Aether model logic, website UI, or unrelated backend responsibilities into this repository.

Project Structure & Module Organization

TypeScript source code belongs under src/.

Prefer small, focused modules rather than large files containing unrelated behavior.

Use structure similar to:

* src/commands/ — Discord slash commands and command handlers.
* src/events/ — Discord client events such as ready, interaction, guild, or error handling.
* src/services/ — integrations with Minecraft, website/backend APIs, Ollama/Aether, or monitoring systems.
* src/utils/ — shared helpers, validation, logging, formatting, and utility functions.
* src/config/ — non-secret configuration and environment-variable validation.
* src/types/ — shared TypeScript interfaces and types.

The main entry point should remain small. It should initialize configuration, create the Discord client, register handlers, start required services, and handle shutdown.

Do not place large amounts of business logic directly in the entry file.

Build, Development & Validation

Use the scripts already defined in package.json rather than inventing alternate commands.

Typical workflow:

* npm ci installs the exact dependency versions from package-lock.json.
* npm run build performs the production TypeScript build when available.
* npm run dev runs the development configuration when available.
* npm start runs the production bot when configured.

Before considering a change complete:

1. Run the TypeScript/compiler validation used by the repository.
2. Run the production build if one exists.
3. Verify changed Discord commands register and respond correctly.
4. Check error handling for external-service failures.
5. Confirm startup does not depend on development-only files or packages.

The production environment currently uses Node.js 22.x on Kinetic Hosting. Avoid introducing dependencies or Node features without checking compatibility with the configured runtime.

Do not modify the hosting startup command, MAIN_FILE, or production entry-point behavior unless the change specifically requires it.

Coding Style & TypeScript

Follow the style already present in nearby files.

Unless an existing file establishes another convention:

* Use two-space indentation.
* Use single-quoted TypeScript strings.
* Use semicolons.
* Use trailing commas in multiline objects.
* Use camelCase for variables and functions.
* Use PascalCase for classes, interfaces, and types.
* Use UPPER_SNAKE_CASE for true constants where appropriate.

Keep TypeScript strongly typed.

Avoid:

* unnecessary any,
* unsafe type assertions,
* duplicated interfaces,
* giant command handlers,
* deeply nested conditionals,
* silent catch blocks.

Prefer early returns, narrow interfaces, reusable service functions, and explicit error handling.

Discord Command Design

Commands should be thin controllers.

A command should generally:

1. Validate the Discord interaction.
2. Check required permissions.
3. Validate user-supplied input.
4. Call the appropriate service/module.
5. Format the result for Discord.
6. Handle expected failures cleanly.

Do not put networking, database, Minecraft-query, or Ollama logic directly inside command files when it can live in a service.

Use ephemeral responses for information that should only be visible to the requesting user, especially administrative errors or permission failures.

Never expose stack traces, internal URLs, tokens, headers, or backend responses containing sensitive information to Discord users.

Permissions & Staff Commands

Treat all moderation, server-management, maintenance, AI-management, and administrative actions as privileged operations.

Permission checks must happen server-side in the bot. Never rely solely on Discord UI visibility to protect a command.

Use centralized permission helpers where possible instead of implementing different permission rules in every command.

Public users must not be able to invoke:

* server-management actions,
* player-moderation actions,
* AI/model-management actions,
* staff announcements,
* maintenance controls,
* privileged debugging commands,
* backend administrative endpoints.

Minecraft Server Integration

The Discord bot is hosted separately from the main Wilderness Odyssey Minecraft server.

Treat communication with the Minecraft server as a remote-service boundary.

Minecraft integrations should:

* use clearly defined service modules,
* use reasonable connection and request timeouts,
* gracefully handle server downtime,
* validate returned data,
* avoid blocking the Discord event loop,
* distinguish between offline, unreachable, unauthorized, and malformed responses.

Commands such as /status should degrade gracefully when the Minecraft server cannot be reached instead of crashing the bot.

Do not tightly couple Discord command implementations to Minecraft internals.

Ollama / Aether Integration

Ollama runs with the main Wilderness Odyssey server infrastructure rather than inside the Discord bot process.

The bot may communicate with approved Aether/Ollama endpoints, but it must not assume that the AI service is always available.

AI integrations should support:

* request timeouts,
* cancellation where practical,
* clear unavailable/error states,
* response-size limits,
* authentication,
* rate limiting,
* input validation.

Do not expose the Ollama service directly to Discord users or forward arbitrary user-controlled requests to internal endpoints.

Keep AI-model administration separate from normal user-facing commands.

Website / Backend Integration

The Wilderness Odyssey website and Discord bot are separately deployed services.

Communicate through explicit authenticated APIs rather than shared filesystem state or embedded secrets.

Do not assume GitHub Pages can securely store privileged credentials or act as a trusted backend.

Administrative requests originating from the website must still be authenticated and authorized by the trusted backend or bot service before execution.

Networking & Reliability

All external requests must have bounded behavior.

For HTTP or service calls:

* set reasonable timeouts,
* validate status codes,
* limit accepted request and response sizes,
* handle malformed responses,
* avoid unlimited retries,
* use controlled retry/backoff only when appropriate.

Do not allow one failed external dependency to terminate the entire bot unless continued operation would be unsafe.

Log enough information to diagnose failures without logging secrets or sensitive message content.

Security & Secrets

Never commit:

* Discord bot tokens,
* API keys,
* webhook URLs,
* Cloudflare credentials,
* Minecraft administration credentials,
* Ollama/backend secrets,
* .env files containing secrets,
* session tokens,
* private keys.

Secrets belong in Kinetic Hosting environment variables or another approved secret-storage mechanism.

Access secrets through environment variables and validate required configuration during startup.

Never print secrets to logs.

Never send secrets to Discord.

Never expose privileged backend endpoints directly to the public internet without authentication and authorization.

If a credential may have been exposed, treat it as compromised and rotate it rather than merely deleting it from the latest commit.

Input Validation

Treat all Discord content, API responses, Minecraft data, filenames, URLs, and external payloads as untrusted input.

Validate data before using it.

Pay particular attention to:

* Discord IDs,
* Minecraft UUIDs,
* command options,
* URLs,
* file paths,
* JSON payloads,
* HTTP body sizes,
* webhook data,
* API parameters.

Do not construct shell commands from user-controlled input.

Do not dynamically execute user-supplied JavaScript or TypeScript.

Logging & Error Handling

Use consistent logging rather than scattered debugging output.

Logs should identify:

* affected service,
* operation,
* relevant non-sensitive identifiers,
* error category.

Avoid logging full authorization headers, tokens, private AI conversations, or other sensitive payloads.

User-facing errors should be short and understandable.

Detailed diagnostic information belongs in server logs.

Performance

The Discord bot shares limited hosting resources, so avoid unnecessary background work.

Prefer event-driven behavior over constant polling.

For recurring monitoring:

* use sensible intervals,
* avoid duplicate requests,
* cache short-lived status information where appropriate,
* prevent overlapping executions,
* clean up timers and connections during shutdown.

Do not repeatedly query Minecraft or Ollama for information that has not changed unless freshness requires it.

Avoid loading large datasets or unnecessary project files at startup.

Codex Working Guidelines

Start with the smallest relevant portion of the repository.

Do not read or rewrite the entire repository for a localized change unless necessary.

For a command change, inspect the command, its related service, shared types/configuration, and directly relevant tests or helpers first.

Reuse existing patterns before introducing new abstractions.

Avoid broad refactors while fixing an unrelated issue.

When requirements are clear, implement the change rather than repeatedly asking for confirmation.

For substantial changes:

1. inspect relevant code,
2. identify affected boundaries,
3. implement the smallest coherent change,
4. run available validation,
5. inspect the diff,
6. fix issues found during validation.

Do not create placeholder implementations when the existing repository contains enough information to implement the real behavior.

Generated & Dependency Files

Do not manually edit generated files or installed dependencies.

Treat the following as generated/disposable unless the repository establishes otherwise:

* node_modules/
* compiled output directories such as dist/
* generated command-registration output
* temporary logs and cache files

Make source changes in src/ and regenerate outputs through repository scripts.

Do not commit node_modules/.

Commit & Pull Request Guidelines

Keep commits focused.

Use short action-oriented commit messages such as:

* add server status command
* fix minecraft timeout handling
* update maintenance alerts
* secure admin command permissions

Avoid mixing unrelated cleanup with feature work.

Before committing, review the diff for:

* accidental secrets,
* debug logging,
* generated files,
* unrelated formatting changes,
* broken imports,
* unintended configuration changes.

Pull requests should explain:

* what changed,
* why it changed,
* how it was validated,
* any environment/configuration changes,
* any new permissions or security implications.

Change Safety

Preserve existing working behavior unless the task explicitly requires changing it.

Do not delete existing commands, integrations, configuration, or deployment behavior merely because they appear unused without first verifying their role.

Be especially careful when changing:

* startup files,
* Discord command registration,
* environment-variable names,
* hosting configuration,
* authentication,
* Minecraft connectivity,
* Ollama/Aether connectivity,
* permission checks.

For security-sensitive or infrastructure changes, favor explicit and easy-to-audit code over clever abstractions.