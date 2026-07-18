# Future Discord publishing contract

This is a preparation boundary for the existing Wilderness Odyssey Discord bot. The site does not call the bot, expose an inbound webhook, or contain bot/GitHub credentials.

The machine-readable payload contract is `transmission-publishing-contract.schema.json`. It intentionally mirrors `src/content.config.ts`; the Astro schema remains authoritative during the website build.

## Expected flow

1. Accept a post request only from already-authorized bot commands and roles.
2. Normalize and validate the payload against the JSON Schema.
3. Reject an existing slug instead of overwriting it.
4. Write `src/content/transmissions/<slug>.md` on a short-lived branch based on `website`.
5. Put images below `public/images/transmissions/<slug>/` and use `/images/transmissions/<slug>/<file>` paths.
6. Default new bot-authored content to `draft: true` unless an authorized publish action explicitly says otherwise.
7. Run `npm ci` and `npm run check` in the bot's trusted worker or in pull-request CI.
8. Open a pull request whose base branch is `website`; include the source Discord message ID in the PR description, not in public frontmatter.
9. Require review for lore, announcements, and non-draft publication.
10. Merge through normal GitHub permissions. The Pages workflow handles deployment.

## Security boundaries

- Store the Discord token and GitHub App/private token only in the bot host or GitHub secrets.
- Never send credentials to website JavaScript or commit them to this branch.
- Prefer a narrowly scoped GitHub App installation over a personal access token.
- Do not provide remote console, arbitrary repository paths, raw YAML injection, or arbitrary workflow selection.
- Sanitize filenames, limit upload size/type, and redact secrets before creating a branch.
- The website must continue to build when the bot is offline.

## Slugs and images

Slugs are lowercase ASCII letters and numbers separated by single hyphens: `^[a-z0-9]+(?:-[a-z0-9]+)*$`. They are stable public identifiers and should not change after publication.

Image paths are repository-root public paths beginning with `/images/`. Do not accept remote image URLs in frontmatter. The bot should convert safe uploaded images to a practical web format, preserve truthful captions, and must not label concept art as an in-game screenshot.

## Draft and publish behavior

- `draft: true`: stored in the collection but excluded from all production output.
- `draft: false`: public after validation, review, merge into `website`, and a successful Pages workflow.
- Changing a draft to published should update `publishedAt` to the real publication date.
- Editing a public post may set `updatedAt`; it must not silently change the slug.

