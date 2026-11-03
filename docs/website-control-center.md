# Website control center: bot backend

The bot now implements the hosted content editor's real permissions and API, and accepts playtester invitations for Discord accounts outside the configured server. These are local source changes; deploy the bot before checking the live site. A successful website login alone did not previously grant `content:read`, and the bot also lacked the content routes. Adding a permission without its backend would not have fixed the editor.

## Outside-server playtests

Use the existing **Playtester website access** page. Enter the person's Discord account ID and campaign ID. The backend verifies the Discord account without requiring server membership. It attempts a DM; if Discord refuses delivery, the page provides a private fallback claim link that you can send yourself. Only that Discord account can claim the invitation. Expiry, revocation, staff authorization, and separate diagnostic consent remain enforced.

The Discord command also supports `/playtester invite campaign:CAMPAIGN account_id:DISCORD_ID`; use either `account` or `account_id`. Re-register the changed command schema during rollout. Staff must still be administrators in the configured guild. Tester website access grants no staff access and does not enroll a game installation or enable collection.

## Initialize the hosted editor

The dashboard now provides a one-time import in **Admin guide & setup** (`/admin/help/`). Review the acknowledgement and select **Import missing website content**. Pages supplies its own build's public source; the browser cannot upload arbitrary replacement source. The bot preserves unrelated private drafts and refuses to overwrite matching slugs or an earlier import. The same page reports whether reviewed GitHub publication is configured. This import prepares both the transmission archive and site/roadmap/gallery forms; it does not publish changes.

The operator steps below remain available for recovery or larger source snapshots.

Saving new transmission drafts works without repository credentials. To edit existing website content and structured pages, first import the public source once. Do this from the actual website revision intended for publication, not an unrelated branch or an unpushed revision:

1. Back up the existing bot database using `connected:operator backup`.
2. In the website checkout, use its existing exporter: `npx tsx scripts/export-content-snapshot.ts --output website-content-snapshot.json`. This exports public transmissions, site/roadmap/gallery data, asset paths, and the source Git commit; it does not include bot drafts or credentials.
3. Copy the resulting public snapshot to the trusted bot host.
4. Run `npm run connected:operator -- import-content --database data/wilderness-oddesy.sqlite --input website-content-snapshot.json --operator HOST_OPERATOR`. Use the actual `DATABASE_PATH`. On a production-only install, the compiled equivalent is `node dist/connected/operator.js import-content ...`; startup does not require tsx or the website checkout.
5. Sign in as an enrolled Discord administrator and open `/admin/content/` or `/admin/content/pages/`.

The import validates every record and reference in one transaction. It preserves existing private drafts with other IDs, rejects collisions, and refuses to overwrite a previous source import. A failed import leaves no partial state. Reconciliation of later external source edits is an operator task; publication detects conflicts rather than overwriting them.

Private transmission drafts and structured page drafts live in the bot's SQLite database. Saves are revision-checked and idempotent; source revisions and public IDs are preserved. Published-source records cannot be deleted through the draft delete action. Use the separate unpublish request instead. Markdown permits formatting, HTTPS/site links and approved images; raw HTML/components and unsafe link schemes are rejected. Images must be imported source assets or validated private uploads. New images stay in SQLite BLOB storage and are available only through authenticated image routes.

Limits: content JSON 2 MiB per request; transmission body 1.5 million characters; private drafts 64 MiB; private images 12 MiB each, 16 megapixels and 256 MiB total. Idempotency responses have a separate 64 MiB quota and expire after 24 hours; cleanup occurs on the next write. Keep database backups private because they now include unpublished content and images.

## Enable reviewed publication

Publication is separate from saving. Configure a GitHub App installed only on the intended repository, with Contents and Pull requests write and Actions and Deployments read permissions. Keep its PEM key and installation settings in the trusted host environment:

```text
CONTENT_GITHUB_REPOSITORY=OWNER/REPOSITORY
CONTENT_GITHUB_APP_ID=APP_ID
CONTENT_GITHUB_INSTALLATION_ID=INSTALLATION_ID
CONTENT_GITHUB_PRIVATE_KEY=actual multiline PEM key, stored only as a host secret
```

The App installation token is narrowed to that repository and those permissions. It stays in process memory. No existing `GITHUB_TOKEN` is reused or exposed. Missing/incomplete settings leave publication unavailable while private draft editing continues.

An acknowledged publication request freezes the draft and referenced images in a durable job. Before each repository mutation, the bot rechecks the requesting administrator. Pending jobs expire after five minutes if they cannot be submitted. A revoked/expired session cannot authorize new repository writes. Already submitted artifacts remain auditable.

The bot creates a dedicated `codex/content-*` branch and PR targeting `website`. It writes only the selected transmission Markdown or the selected `src/data/editable/{site,roadmap,gallery}.json`, plus referenced approved images. It does not merge PRs or change workflows. Current source-file hashes must match the imported source revision. Unrelated website changes are preserved through the base tree. Unpublication marks a transmission as a draft through the same review process and preserves assets.

The website displays saved, requested, awaiting review, awaiting approval, deploying, published, failed, or cancelled states. Published requires both the matching successful `deploy-site.yml` push workflow and the matching successful `cloudflare-production` deployment. Passing checks or creating a PR alone does not count. The existing workflow performs deployed-artifact verification; its review, merge, deployment enablement and protected-environment gates remain in force.

## Existing controls and the remaining inventory

| Area | Bot API / status |
| --- | --- |
| Status, incidents, performance | Existing `/overview`, `/incidents` and public status projections |
| Maintenance notifications | Existing revision-checked `/maintenance` |
| Main-server checks and Aether admission | Existing `/service-operations`, `/ai-requests` |
| Approved models and inference settings | Existing `/models`, `/model-changes`, `/inference-settings`; peer capabilities remain authoritative |
| Verified players, account restrictions and appeals | Existing `/players/*` and `/accounts/*` |
| Selected private Aether reports | Existing `/reports/*`; these are not the separate Discord support reports |
| Playtester website invitations, instructions and revocation | Existing `/participant-staff/*`, now supporting outside accounts |
| Content editor and structured pages | Implemented `/content/*` in this delivery |
| Invited game diagnostics | Existing singular `/playtest/*` API; the website's richer plural `/playtests/*` facade needs a separate adapter |
| Managed connection settings / credential replacement | The website has forms, but the bot does not yet implement `/configuration/*`; those capabilities are deliberately not advertised |
| Discord support-report/ticket triage, announcements, support-panel posting, known issues/changelog and Q&A administration | Next control-center increment: reuse existing bot services behind focused staff APIs and matching website forms |

The remaining areas above are not represented as working site controls by this change. They need coordinated website and bot work, especially encrypted connection credentials, approved connection destinations, component reconfiguration, and the plural playtest contract. Keep website UI on its branch. Never expose arbitrary environment editing, raw credentials, shell execution or unrestricted HTTP calls as dashboard features.

## Validation and rollout

The regression suite covers real staff HTTP permission/draft/image flows, outsider invitations, blocked/stalled delivery, claim ownership, source import, conflicts, unsafe content and publication state transitions with synthetic GitHub transport. The real website exporter snapshot imported all nine transmissions and all three structured page documents locally. Compiler checks and the production build use the repository scripts; tests also run with Node.js 22.13.1.

Deploy in order: bot backend, current bot-gateway Worker, then the website if its contracts/gateway are not current. The gateway must preserve the added content capabilities and allow the content/image paths and their separate bounds. This bot checkout contains a historical Worker copy; its deployment owner and complete shared contracts remain on the website branch. Do not deploy that incomplete historical copy from the bot checkout.

Real Discord delivery/OAuth, Kinetic persistence, live gateway configuration, GitHub App permissions and protected publication require staging checks after installation. No credentials, live command registration, repository publication, Cloudflare deployment or restart was performed during local implementation.
