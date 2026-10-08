# Hosted administrator content and service settings

Status: proposed design for review. No application, authentication, deployment, or production configuration changes are included in this document.

## Agreed outcome

The user wants to edit website content and service settings from the live website after signing in as an administrator. Service settings include connections, credential replacement, and existing operational controls. Running a local repository editor is not the intended hosted workflow.

After initial host setup, an eligible administrator should be able to save private content drafts, upload images, request publication, edit supported connection settings, replace supported connection credentials, and operate the existing maintenance and Aether controls. The interface must distinguish saved settings, verified connections, accepted operations, and completed publication.

This proposal recommends extending the existing Kinetic backend. That architecture and the scope below require review before implementation.

## Current owners and prerequisites

- The `website` branch owns the static Astro site, Pages Functions gateway, API contracts, and content editor interface.
- Hosted `/admin/content/` currently selects the unavailable CMS service. Its real implementation is the loopback-only `scripts/local-admin-server.ts` repository editor. Do not expose that server to the Internet.
- The `bot` branch owns authenticated administration, durable SQLite records, service monitoring, and the main-server client under `src/connected/`.
- Main-server connection settings are currently loaded from the host environment when the runtime starts. Editing the website checkout's `.env` cannot change that running backend.
- The [Discord sign-in proposal](2026-10-07-discord-admin-sign-in.md) has an active [website implementation plan](../plans/2026-10-07-discord-admin-website.md). Its coordinated bot enrollment, shared session, and live Discord Administrator checks remain prerequisites. Integrate with that work rather than implementing a competing login. This proposal would replace its exclusion of content publishing with explicit, narrowly scoped content privileges; other authentication and operation limits remain.
- `.github/workflows/deploy-site.yml` remains the only website deployment owner. Existing branch protections and production/preview approval gates remain.

## Architecture choice

Recommended: extend the existing Kinetic backend with focused content, publishing, configuration, and encrypted-credential services. Reuse its database, authenticated actor, audit history, and operation tracking. The browser uses same-origin Pages gateway endpoints and never receives upstream authentication material.

Alternatives considered:

1. Write every draft directly into GitHub. This avoids separate draft storage but exposes unpublished source in a public repository and makes every save a repository mutation. Keep private drafts in the backend instead.
2. Introduce a separate hosted CMS and configuration service. This adds another authentication boundary, storage owner, and deployment to operate. It is unnecessary for the existing backend's content and configuration scope.

Keep four distinct responsibilities: content storage, repository publication, runtime connection configuration, and existing main-server operations. A website content change does not implicitly change a service credential or authentication policy.

## Hosted content interface

Reuse the existing rich-text/Markdown transmission editor, metadata controls, preview, and image validation for news, blog, devlog, patch, lore, and announcement records. Adapt its hosted session handling to the shared staff login; do not create another username/password login.

Add schema-backed forms for the existing site information, roadmap records, and gallery records currently owned by `src/data/site.ts`, `src/data/roadmap.ts`, and `src/data/gallery.ts`. Move only the editable records into validated data files during implementation and preserve their current values, stable IDs, links, and rendered appearance. TypeScript modules continue to expose the current reusable interfaces. Page layouts, scripts, authentication policy, and deployment files remain source-controlled code.

Private drafts and media remain in backend storage until an administrator deliberately requests publication. Draft reads and image previews require the same current administrator authorization as draft writes. Drafts are not shipped in Astro pages or copied into public image directories.

Each draft includes its revision and the source revision it was based on. Saving or publishing stale content returns a conflict rather than overwriting another administrator's work or later repository changes. Preserve existing source content during initial import. Existing images and unrelated assets are not removed by publication or unpublication.

Backend validation must independently enforce the content schema, referenced record IDs, permitted link protocols, image byte signatures, size limits, and safe paths. Hosted Markdown accepts text formatting, approved links, and images; executable HTML, scripts, MDX/components, and unsafe URLs are rejected before storage and publication. Client preview sanitization is supplementary.

## Publication

Use a GitHub App installed only on the intended repository. Its private key stays on the trusted host. Installation tokens are created server-side with the repository and permissions narrowed for the specific operation. GitHub documents that installation tokens can be narrowed and expire after one hour: [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).

An authenticated publish request freezes a validated draft revision and its referenced media. A durable job creates a dedicated content branch and pull request against `website` using GitHub APIs. The server constructs all repository paths; the browser cannot submit arbitrary files, branches, repository names, or shell commands. Permitted writes cover transmission Markdown, approved content-data records, and their approved images. They cannot edit workflows, application code, secrets, or authentication configuration.

Drafts remain private before publication is requested. The interface explains that submitting a publication request makes its source visible in the public repository even while deployment approval is pending.

Publication preserves repository review and merge protections, then uses the existing deployment workflow. Track the pull request, final merge commit, matching workflow, deployment, and verified deployed revision. A draft save, created pull request, passing checks, or accepted deployment request is not reported as published. Display awaiting review, awaiting deployment approval, deploying, published, and failed states separately.

Recheck current administrator enrollment and permissions before submitting queued repository mutations. Expired or revoked requests that have not been submitted are cancelled. A submitted pull request or completed public deployment remains an audited artifact and is not silently undone on logout or role revocation.

Unpublish submits a reviewed content change through the same publication process. Preserve published IDs and historical URLs where appropriate. Keep the existing local content editor as a separate supported tool.

## Service settings interface

Expose forms with fixed fields and explicit units rather than an arbitrary `.env` editor. Supported settings are stored by their backend owner and validated against the same rules used for startup configuration.

| Setting group | Hosted dashboard behavior |
| --- | --- |
| Main-server connection | Edit the approved HTTPS connection origin; verify the expected server identity and environment. The set of permitted destinations is established on the host. |
| Main-server read/write credentials | Replace each scoped credential independently using an empty secret input. Show configured/not configured and last replacement metadata, never the saved value. |
| Monitoring | Edit interval, freshness limit, failure/recovery thresholds, and staff/public notification channels within the existing bounds. Channels must belong to the configured Discord guild. |
| Maintenance and AI admission | Keep the existing revision-checked, audited maintenance and request-pause controls. |
| Models and inference | Keep the main server's approved models, advertised actions, and permitted inference bounds authoritative. |
| Foundational host configuration | Show readiness and operator instructions for the items below. Keep their authority on the appropriate host/provider. |

Initial host/provider setup remains necessary for Discord application/bot credentials, the configured guild and server identities, Cloudflare Access trust and gateway credentials, approved origins, CSRF signing, database/media locations, the credential-encryption key, GitHub App credentials, and deployment secrets. These values establish the dashboard's own trusted access and cannot all be bootstrapped by a dashboard that cannot yet authenticate.

Cloudflare Pages runtime secrets remain Pages secret bindings, independently configured for production and preview. The new backend settings store does not replace or automatically rewrite those provider bindings. Cloudflare documents encrypted secret bindings separately from plain environment variables: [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).

Replacing a client connection credential is distinct from issuing or revoking a credential on its peer service. The dashboard must say when the main-server operator still needs to configure the matching credential. It must not claim a rotation or usable write connection from a successful local save alone.

Provide separate Save settings and Verify connection actions. Verification uses bounded, approved read-only requests; it does not execute a privileged operation merely to test a write credential. Distinguish verified read access, write access not yet verified, authentication rejection, unavailable service, invalid response, and expected-server mismatch. Unverified write access remains unavailable until the peer offers a verified scope check or an explicitly authorized operational verification succeeds.

Changes that require a component refresh or restart report that requirement. Confirm application only after the owning component acknowledges the new revision. Configuration changes do not deploy the website or start/restart Minecraft implicitly.

## Durable configuration and credentials

Add versioned non-secret configuration and encrypted credential tables alongside the existing connected-service records. Do not rewrite `.env` files through HTTP requests or store plaintext credentials in generic JSON records, queued-operation parameters, idempotency response caches, logs, or audit reasons.

Use authenticated encryption with a host-managed key and a fresh nonce per stored credential. Bind ciphertext to the environment, service, credential scope, and format version. A missing or incorrect key makes affected connections unavailable; it does not discard records or silently replace existing secrets. Backups include encrypted credentials and separately managed key recovery.

Existing environment configuration remains the bootstrap/fallback when no managed configuration exists. Importing current credentials is an explicit trusted-host operation, without returning their values to the browser. Saved managed configuration has one documented precedence and survives backend restarts.

Apply a validated configuration revision atomically. Reconfigure only affected components, cancel obsolete timers and requests, clear stale capability caches, and fence results from older configuration revisions. Keep monitoring history, moderation records, service operations, and enrollment intact. Pending operations must not be redirected to a new endpoint or server identity by a connection change; reconcile accepted operations with their original service or report that operator reconciliation is required.

Require current administrator authorization, a fresh sign-in for credential replacement, same-origin CSRF protection, a revision, and idempotency for settings writes. Secret responses contain metadata only; inputs are cleared after submission and never written into browser storage. Secret idempotency stores a keyed request fingerprint and safe outcome metadata, not submitted secrets.

## Gateway and contracts

Add explicit content and configuration capabilities to the shared session contract. Only administrators receive write, publication, and credential-replacement capabilities. Update the current capability-count limit and synchronize the website and bot schemas. Reuse the shared signed-in actor; frontend visibility remains supplementary.

Add narrowly routed `/api/admin/v1/content/*` and `/api/admin/v1/configuration/*` families with corresponding Kinetic routes. Define strict schemas for draft records, structured page records, safe configuration projections, revisions, validation outcomes, and publication status. Secret submission schemas are write-only and have no response field for a credential value.

Keep normal operation and configuration JSON bounded by the existing 16 KiB limit. Use separate bounded content-save and media-upload handlers: content JSON at most 2 MiB; actual-image-byte uploads at most 12 MiB plus at most 1 MiB multipart overhead. Authenticated media responses have validated types and private/no-store caching. Do not increase every gateway route's size limit to accommodate images.

All upstream requests have deadlines, response-size limits, fixed routes, redirect rejection, and controlled retry behavior. Connection destinations must satisfy the host-managed allowlist and resolved-address policy at connection time; dashboard input cannot become an unrestricted network proxy.

## Implementation sequence

1. Complete and validate the coordinated Discord enrollment, session, revocation, and gateway changes described in the existing login proposal.
2. Synchronize scoped content/configuration contracts; add backend private draft/media storage, configuration validation, encrypted credential storage, and audit behavior.
3. Add the narrow repository publication service and connect it to the existing review/deployment workflow without changing deployment ownership.
4. Connect the existing content UI and new structured-content/settings forms to the shared signed-in session and same-origin gateway.
5. Add component acknowledgement, revision fencing, and connection-verification status to the existing runtime owners.
6. Validate locally with synthetic fixtures, then verify the complete staged login/edit/configuration/publication flow before requesting any production rollout.

Each implementation step must leave unavailable features clearly unavailable. Avoid a mock save or placeholder API that claims a real change happened.

Keep website implementation in the website checkout. Coordinate backend changes as a separate bot implementation/handoff; do not switch this shared checkout to `bot` or mix backend source into the static website. Preserve the in-progress login files and reconcile shared contracts before integration.

## Acceptance and evidence

- Eligible, bot-enrolled administrators can access both hosted areas; anonymous users, non-admin members, revoked enrollments, and wrong-guild users cannot read or mutate protected records.
- Current Discord permission/enrollment checks apply again after asynchronous work and before queued mutations. Expiry and logout clear the shared session.
- Private drafts and media remain inaccessible anonymously and survive a backend restart and verified backup restore.
- Stale content/configuration revisions are rejected; unrelated repository edits and legacy IDs survive publication.
- Malformed content, unsafe links, executable Markdown, unsupported image bytes, path traversal, wrong-server responses, arbitrary destinations, and oversized bodies are rejected by the backend.
- Stored credential values never appear in API responses, public assets, repository commits, browser storage, audit history, ordinary database JSON, or operation queues. Encryption and recovery failures are covered explicitly.
- Read verification is not presented as verified write authority. Save, apply, restart-required, review, and publication states remain distinguishable.
- Existing maintenance, moderation, model bounds, operation reconciliation, source content, local editor, and deployment gates retain their behavior.
- Run the website's `npm run verify` and browser checks for signed-in/denied flows, keyboard behavior, desktop/mobile layouts, console errors, and production gateway behavior. Run the bot's existing compiler, tests, and production build using its supported runtime.
- Report local fixture/build evidence separately from real Discord login, peer credential replacement, host persistence/restarts, GitHub permissions/reviews, Cloudflare publication, and main-server operation evidence.

## Review and rollout boundary

Review this proposed scope and architecture before preparing the detailed implementation plan. Keep the existing Discord-login draft unchanged until the related proposal is reconciled deliberately.

This document authorizes no GitHub App installation, credential issuance, public repository publication, hosting changes, deployment enablement, DNS changes, production service calls, or restarts. Those require the appropriate owner action after the implementation is reviewable and staging has established the relevant evidence.
