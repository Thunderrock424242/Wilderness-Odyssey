# Cloudflare Pages and staff dashboard

Approved in the task conversation on 2026-09-22. This supersedes earlier hosted website plans.

Keep the static Astro public site, transmissions, roadmap, visual identity, and local editor. Add honest public status and support pages; four staff sections for server management, player moderation, reported AI conversations, and approved model management. Browser code calls only same-origin APIs. Pages Functions validate Cloudflare Access and broker typed requests to the independently authorizing Kinetic backend. Minecraft 1.21.1 NeoForge and Ollama stay on the main server.

No implementation approval grants deployment, DNS, production service changes, or communication to other people. Connections without actual configuration fail closed. No example measurements are live data. No blanket private-conversation collection. Role policy and operational execution remain backend responsibilities; all mutating requests need reasons, CSRF protection, idempotency, and server authorization.

Replace the one existing deployment workflow with checks and explicitly enabled, approved Cloudflare deployment jobs. Preserve local draft editing and truthful publication states. Keep production and previews separate, with previews denied access to production credentials and backend identities.

External prerequisites: actual hostname and Access configuration; Kinetic and main-server project locations; backend implementation of the shared contracts; production approval and report-retention policy. Local code and automated verification can finish independently; no live integration claim is permitted without those prerequisites.
