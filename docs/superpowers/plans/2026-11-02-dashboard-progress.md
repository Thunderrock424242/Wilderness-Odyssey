# SDD ledger — plan: docs/superpowers/plans/2026-11-02-dashboard-and-remembered-sign-in.md

Execution: inline. Bot edits in the existing bot checkout; website edits in a managed website worktree.
Pre-flight: Task 1 produces optional remembered callback fields and refresh/forget schemas; Task 2 consumes the same contracts. Callback input must not inherit the new start-only remember field.
Pre-flight: Task 3 preserves existing DOM hooks and consumes Task 2 browser renewal helpers.
Ruling: Keep bot edits on its existing non-main bot branch and isolate website through the app-managed worktree, since branches have different project roots. No merge or deployment.
Task 1: in progress.
Task 1: Auth lifecycle implemented. Focused auth tests 14/14; full bot tests 148/148; compiler and production build pass. Contract fixture regenerated from website export.
Task 2: Gateway and client renewal implemented. Same-origin Origin plus non-simple intent header protects refresh/forget after short access expiry. Custom response contains no tokens.
Ruling: Use on-demand session probes before writes and retry only reads after renewal. This ensures fresh CSRF without replaying a potentially executed mutation; costs one bounded session read per write.
Task 3: Approved split login and shared workspace styles implemented, no W badge. Grouped sidebar reused in staff and authoring layouts. Playtester invitations and campaigns precede statistics/history.
Task 4: Website verify passes: 232 unit tests, compiler, build and generated-link checks. Browser suite running.
Final review: independent read-only reviewer found seven important edge cases. Added failing tests for identity switching, tab-lock reuse, error statuses, bookmarked private-page entry and dual-credential logout; all focused review tests now pass (29/29 before final logout-failure test addition).
Final: fixed absolute deadline clamp for administrator and participant access; last-minute renewal regression RED→GREEN.
Final: fixed on-demand behavior by keeping timer revocation reads on raw fetch, and added browser coverage distinguishing idle checks from user refresh.
Final: fixed participant logout guidance to account for remembered credentials and made credential-free retry report unconfirmed revocation.
Final: minor (deferred): expired remembered families and historical token/access mappings need bounded opportunistic storage cleanup; authorization still rejects them at expiry.
Final: Ruling: live Discord and deployed Cloudflare checks require a separate staging rollout; local tests use controlled OAuth/backend responses — no deployment authorized — risk is environment-specific integration differences.
Final: Ruling: visual QA is handled by browser screenshots and narrow-layout/accessibility tests; the independent reviewer assessed source security/functionality — residual risk is subjective visual preference.
Task 1: complete — npm run check, npm test (149/149), npm run build, all passing.
Task 2: complete — remembered gateway, browser renewal, bot gateway allowlist, schema export and generated fixture synchronized. Review regression tests RED→GREEN.
Task 3: complete — source and production screenshots verified. Screenshot-discovered legacy radio width conflict reproduced by a new browser assertion, fixed in scoped CSS; desktop and mobile controls now fit.
Task 4: complete — npm run verify: zero compiler errors/warnings, 241 unit tests passing, production Pages build and 65 generated HTML/link checks pass. npm run test:e2e: 86/86 passing, including keyboard, no-JavaScript sign-in, bookmarked renewal, idle nonrenewal and Pages runtime guards.
Changes are local only. Bot → bot-gateway Worker → website is required rollout order. Independent review issues fixed in one regression-test pass; expired-family storage cleanup remains the sole deferred minor.
