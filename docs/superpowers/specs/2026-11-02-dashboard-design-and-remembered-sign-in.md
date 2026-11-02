# Dashboard design and remembered sign-in

## Intent and approved direction

Make the login, administrator workspace, and playtester home feel like Wilderness Odyssey while keeping routine tasks easy to read and use. The user selected the first sidebar layout, then approved a blend of Echo Earth and Blackout Archive: misty midnight blue landscapes, muted violet accents, softer headings, restrained industrial details, and a text wordmark without the large W badge.

The interactive reference is `C:/Users/mason/.codex/visualizations/2026/11/02/01a19cbb-8831-7e11-b141-9ad4c11df073/odyssey-access.html`. Its dashboard values are illustrative, never production defaults.

## Scope and boundaries

- Website branch: redesign `/login/`, shared administrator layouts (including authoring), and `/playtester/`; keep existing controls, routes, data, permissions, and workflows working.
- Bot branch: implement trusted remembered authentication for administrators and participants. Website gateways own browser cookies and forward authenticated requests; the bot remains the authority for sessions and permissions.
- Other public pages received an initial source review; their redesign is outside this implementation scope.
- Preserve hosting entry points, environment names, deployments, public paths, and legacy redirects. No live deployment is authorized by this design.

## Approaches considered

1. Compact centered portal with horizontal navigation: simpler but provides less atmosphere and weaker organization for many staff sections.
2. Sidebar workspace with an illustrated split login: selected by the user for its stronger identity and grouped navigation.
3. Separate themed experiences: Echo Earth supplied the landscape and softer typography; Blackout Archive supplied violet tones and industrial details. The user selected a blend within the sidebar approach.

## Login and dashboard behavior

Login has clearly selected Playtester and Administrator options, one Discord continuation button, an unchecked stay-signed-in checkbox, and role-specific expandable setup help. Preserve invitation claiming and Discord enrollment instructions. Provide explicit loading, denied, expired, unavailable, and signed-out states without exposing internal errors.

Use shared visual tokens and reusable layouts across operational and authoring panels. Group staff navigation by existing functions; indicate current route accessibly. Keep verified data and capability checks, and never populate the mockup's example metrics without real API support. On the playtester home, prioritize invitations and active playtests, followed by recorded statistics and history. Preserve consent instructions and recorded-time caveats.

Atmosphere must not interfere with text contrast, keyboard focus, reduced motion, or mobile layouts. Use decorative landscapes independently from content; avoid animation by default. Final artwork and implementation details are builder decisions within the approved direction.

## Remembered sign-in

The user approved a 30-day absolute remembered lifetime for playtesters and 7 days for administrators. These are maximum times from initial sign-in, not sliding extensions. Unchecked login retains the existing 15-minute absolute session behavior.

Builder proposal: retain short-lived access sessions and add separate cryptographically random, revocable remembered credentials, stored only as hashes by the trusted backend and as Secure, HttpOnly, SameSite cookies by the gateway. Never put credentials in local storage, URLs, frontend bundles, or logs. Bind remember choice to the OAuth attempt server-side, rather than trusting callback query parameters. Administrator and participant credentials and refresh operations stay separate.

Renew on demand, with bounded requests, before protected page operations; do not add continuous background polling. Rotate remembered credentials transactionally when used, prevent replay, and account for simultaneous tabs without issuing duplicate live successors. Preserve the original absolute remembered deadline. Refresh and every privileged operation must enforce current session validity, administrator enrollment, guild membership and required permissions. Participant refresh must follow existing participant authorization semantics; do not invent new access requirements.

Renewal validates the remembered credential and current authorization, and must work after the short access session expires. Expired short access credentials cannot authorize protected operations by themselves.

Logout revokes the current short session and its associated remembered credential and clears both browser cookies. `/dashboard disable` revokes all administrator sessions and remembered credentials. Confirmed loss of admin membership, permission, or enrollment revokes remembered admin access as well; transient upstream failure denies renewal without misreporting permission loss. Website and backend failures must not silently fall back to longer sessions or imply successful revocation.

Keep existing OAuth state binding, CSRF protections, machine authentication, environment checks, input/response limits, and request timeouts. Use additive database migrations and strict shared schemas; legacy callers that omit remember choice continue to receive short sessions. Gateways must be updated to accept intended session types without removing lifetime validation.

## Validation and delivery

Bot: run `npm run check`, `npm test`, and `npm run build`. Add focused auth tests covering default/remembered lifetimes, absolute expiry, rotation and concurrent refresh, replay, logout, disable, role loss, service failure, and participant/admin separation.

Website: run `npm run verify` and `npm run test:e2e`. Cover both login roles, checkbox propagation, no-JavaScript sign-in behavior, renewal and failure states, invitation handling, cookies/CSRF, mobile layouts and keyboard navigation. Inspect affected pages in the production preview and Pages runtime. Existing working controls must remain functional.

Review source diffs for accidental secrets, generated edits and unrelated changes. Deliver local validated changes with coordinated website/backend rollout requirements; deployment and production policy changes remain separate.

## Builder decisions and non-goals

The builder chooses module names, additive persistence fields, artwork technique, and race-safe rotation details after inspecting existing implementations. Record meaningful departures. Do not add unsupported overview APIs merely to reproduce mockup cards, change Discord permission policy, redesign unrelated public content, or replace existing operational workflows.
