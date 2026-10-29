# Editable deployment configuration

## Intent

Give the website owner one readable file for editing non-secret deployment settings, including the Discord server ID that currently causes deployment preparation to fail.

## Chosen approach

Add `config/deployment.jsonc`, with comments explaining each setting, shared defaults, and separate `production` and `preview` overrides. Keep recognizable names such as `DISCORD_GUILD_ID` and explain how to find the value. Leave unknown values empty rather than inventing working credentials or identifiers.

The owner chose an editable file over an interactive setup command. Keeping everything in GitHub variables would preserve the current scattered setup; a setup command would add a second interface to maintain.

## Behavior

- Build, Pages configuration, and deployment verification read settings through one shared loader. The canonical site URL must remain consistent between the tested artifact and deployment.
- Explicit, nonempty environment variables can override file values for compatibility. Empty GitHub variables do not erase file settings. Document this precedence clearly.
- Add `npm run config:check -- --environment production` (or `preview`) to report all missing or invalid settings together, with file locations and useful guidance. Run the same validation before deployment preparation.
- Keep the loader usable in the isolated deployment job without installing application dependencies.
- Update the deployment workflow and setup documentation so ordinary settings can be managed from the file. Keep existing deployment enablement and protected-environment approval gates.

## Boundaries

Tokens, passwords, signing secrets, and runtime credentials stay in GitHub or Cloudflare secret bindings. This change does not deploy, change DNS, relax authorization, change public paths, or migrate authentication modes. The actual Discord guild ID still has to be supplied by the owner.

## Validation

Add focused tests for file loading, overrides, malformed settings, production/preview separation, actionable validation, and consistent build/deployment settings. Run `npm run verify` and `npm run test:e2e`, inspect the diff, and check the production preview and Pages root/legacy routes.
