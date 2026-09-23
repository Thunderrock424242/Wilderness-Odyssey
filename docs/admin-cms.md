# Local content editor

The existing editor is preserved at `/admin/content/`. Run `npm run admin` from the website checkout. It remains a loopback-only repository editor with per-session CSRF and origin validation, actual-image-byte checks, schema validation, narrow commits, and protection against unrelated staged changes.

Drafts write real Markdown to `src/content/transmissions/`; approved images go to `public/images/transmissions/<slug>/`. The TipTap editor retains Markdown mode, sanitized preview, metadata, tags, roadmap links, cover/gallery uploads, and draft/publish/unpublish controls.

Publishing requires branch `website`, exact sync with origin, no staged changes, and `npm run verify`. It pushes only the selected transmission and referenced files. It then checks both the matching workflow and the cloudflare-production deployment status. Passing checks without a deployment is labelled checks-passed. Approval and verification remain explicit pending states.

The local HTTP contract still lives in `src/lib/admin/types.ts` and `scripts/local-admin-server.ts`. It is not an Internet administration API and must never be exposed through a public bind address or tunnel.

The public build ignores remote `PUBLIC_ADMIN_API_BASE` configuration for this editor. Hosted content publishing is not connected. `PUBLIC_ADMIN_MOCK` remains development-only; its demo records do not write or publish files.

The earlier proposed hosted username/password CMS contract is superseded. The new staff dashboard uses Cloudflare Access plus Pages Functions and the Kinetic backend, described in [api-integration.md](api-integration.md). Dashboard privileges do not automatically grant repository publishing access.

Use [cloudflare-deployment.md](cloudflare-deployment.md) for hosting, approval gates, secrets, preview isolation, and rollback.