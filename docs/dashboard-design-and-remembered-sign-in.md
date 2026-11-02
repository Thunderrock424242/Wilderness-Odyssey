# Dashboard design and remembered sign-in

The login, staff operations, content studio and playtester home share the Echo Earth / Blackout Archive visual direction: midnight blue, violet, landscape atmosphere and a text wordmark. Existing actions, invitations and consent behavior are preserved.

## Remembered authentication

Stay signed in is optional and unchecked. Normal sign-in lasts 15 minutes. Remembered sign-in lasts absolutely 7 days for administrators or 30 days for participants, with short access sessions renewed only on entry or user requests. New access sessions cannot exceed the remembered deadline.

The trusted bot owns random hashed remembered credential families. Cookies are Secure, HttpOnly and SameSite=Lax. Gateway refresh/forget POSTs require an exact approved Origin and a non-simple X-WO-Auth-Intent header. They return no credentials to browser JavaScript. Refresh is role-specific and rotates the remembered credential; Web Locks coordinate tabs with a session recheck. Privileged requests still validate current permissions, enrollment, environment and machine identity. Browser clients pin account identity and never automatically replay a mutation.

Pages middleware continues to guard private staff HTML. A remembered administrator arriving with expired access is directed through the public login page, which renews via same-origin POST and returns only to a validated /admin/ path. The existing periodic permission check does not renew idle sessions.

Logout revokes both presented access and remembered credentials and clears both cookies. If the backend is unavailable, browser sign-out completes but remote revocation remains unconfirmed. An administrator can use /dashboard disable to revoke every administrator family. Participant users should contact the owner if remote sign-out cannot be confirmed; merely waiting 15 minutes does not end a remembered credential.

## Coordinated rollout

Deploy bot support and additive SQLite tables first, then the bot gateway Worker route allowlist, then the website Pages build. Older website calls omit remember and retain 15-minute behavior. No new environment settings or hosting startup changes are required. This local implementation does not deploy or change production policies.

Authentication schemas are exported with npm run contracts:export. The bot fixture uses the generated discordAuthentication section. Validate the website with npm run verify and npm run test:e2e; validate the bot with npm run check, npm test and npm run build. Live Discord OAuth and deployed infrastructure require a separate staging check.

Known follow-up: expired remembered database rows remain until explicit family revocation; introduce bounded opportunistic cleanup in a focused maintenance change.
