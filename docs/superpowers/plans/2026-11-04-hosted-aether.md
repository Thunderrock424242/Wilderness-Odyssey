# Hosted Aether implementation plan

User-authorized scope: finish hosted ordinary chat in the bot branch and the local API in-dev checkout, preserving native Minecraft and pinned playground contracts.

Design: add a strict, stateless `/v1/aether/chat` inference contract without Minecraft world/player fields. Both surfaces may use it for dialogue; native Minecraft generation remains unchanged. Gateway owns prompts, canon, model, admission and a shared bounded generation queue. Bot owns Discord authorization, routing, privacy and local limits. No history/profile/link data is exported; HMAC scope identifiers separate surface/user/guild. Remote failures never use a scripted fallback. Status reports a fresh bounded inference-scope check and remains unavailable before verification.

Alternatives rejected by the request: admin sandbox credentials for public chat; fabricated Minecraft context; local inference in Node; automatic candidate activation/training.

- [x] Add matching strict contract fixtures, gateway adapter and HTTP tests; verify authentication, native admission, format/thinking behavior, overload and failure boundaries (mock runtime only).
- [x] Add private validated provider configuration, bounded inference client and tests; wire factory and truthful status, preserve routing and suppress mentions.
- [x] Prepare disabled deployment templates and operator instructions; run bot check/test/build and standalone API check/assemble, review diffs and commit scoped changes.
- [ ] Validate hosted response and controlled Discord chat only if private host access/capacity are available. Otherwise report exact unverified gates.

Deployment facts: local API e9c0d22d includes 7f4bd3f6; local bot starts at 903d23a. Kinetic access, approved origin, hardware and credentials have not been supplied. Historical 7 GiB Minecraft + 1 GiB bot is insufficient evidence of Qwen capacity. Node production target is 22.x; local default is 24.13.1.

Validation: bot 220/220; compiler and build pass. API standalone check/assemble passes, 83 discovered/82 passed/1 existing skipped. Shared fixture hashes match. Initial API executable-test Windows log cleanup failure passed on retry without changes. No production token, private origin or live inference test exists locally. Kinetic authenticated home was visible, then URL-verification/browser-control failures prevented allocation inspection.

Final review: self-review after independent reviewer failed due to account usage limit. No reviewer findings were received. Found and tested fixes: distinguish 503 unavailable from overload; preserve opaque Minecraft bot bridge IDs using per-transaction UUID correlation; coalesce/cache status probes. Hosted acceptance remains incomplete; deployment stays disabled.
