# Discord dashboard authentication implementation plan

**Goal:** Implement the backend contract in `docs/discord-admin-bot-codex-message.md` on the bot checkout, leaving an uncommitted reviewable diff.

**Architecture:** Keep OAuth, enrollment and session authority in a focused connected-service module, use the attached bot client's REST transport for fresh Discord permission checks, and extend existing machine Access verification. Reuse existing admin routing, capability ceilings, audits, idempotency and operation processing.

**Constraints:** Node 22; exact website auth schemas; one configured guild and environment callback; hash-only 32-byte opaque credentials; five-minute single-use attempts; fifteen-minute absolute sessions; no deployment, live registration, production restart, policy changes or unrelated edits.

## Tasks

- [ ] Add tests for caller/guild binding, Administrator on any role and ownership, denial/outages, repeat enable, self-revocation, attempt bindings/replay, bot users, session expiry and revocation races. Watch these fail before implementing.
- [ ] Implement the auth schemas, additive durable storage, bounded OAuth transport, fresh bot REST permission lookup and thin dashboard command. Use a distinct dashboard actor namespace to preserve historical staff assignments and audits.
- [ ] Split machine assertion verification from legacy human verification; require explicit staff authentication mode and runtime settings. Test identity/audience/environment/expiry denial without a human assertion.
- [ ] Integrate auth endpoints and session credentials with existing admin actions. Revalidate after body uploads and remote capability lookups, and before queued dispatch. Confirmed loss revokes enrollment/sessions; dependency failure denies without deletion. Test each race and denial.
- [ ] Validate producers against the website's generated `discordAuthentication` schemas, run `npm run check`, `npm test`, `npm run build`, review the diff and document runtime/callback setup.

## Review focus

Concurrent enable/disable and callback/logout must never resurrect revoked access. A member's unrelated highest role must not hide a lower Administrator role. Discord 404 unknown-member differs from bot access failure. Queued operations must recheck immediately after remote reconciliation. Legacy Access cannot be selected by a failed Discord login.

## Execution notes

The user explicitly authorized implementation from the supplied handoff. Execute inline on the requested bot checkout; preserve the other website/backend worktrees and existing untracked directories. No commits or deployment commands are part of this request.
