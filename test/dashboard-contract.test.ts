import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { DashboardAuth } from '../src/connected/dashboardAuth';
import { ConnectedStore } from '../src/connected/store';
import * as authSchemas from '../src/contracts/v1/auth';

// Exact generated discordAuthentication section copied from the website branch; no runtime checkout dependency.
const website = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/discord-auth-schemas.json'), 'utf8'));
test('backend auth schemas and actual producers match the website generated JSON contracts', async () => {
  const db = new DatabaseSync(':memory:'), store = new ConnectedStore(db);
  const redirectUri = 'https://staff.example/api/auth/discord/callback', user = '123456789012345678', guild = '234567890123456789';
  const auth = new DashboardAuth(store, { guildId: guild, clientId: user, clientSecret: 'test-secret', redirectUri }, async () => {}, async url => String(url).endsWith('/oauth2/token') ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Admin' }));
  try {
    const schemas = [authSchemas.discordStartInput, authSchemas.discordCallbackInput, z.object({}).strict()];
    for (const [index, route] of website.routes.entries()) {
      assert.deepEqual(z.toJSONSchema(schemas[index]!), route.input);
    }
    assert.equal(website.sessionHeader, 'X-WO-Admin-Session');
    // The bot's existing eight capabilities are within the website's fourteen-capability ceiling.
    // Validate actual producers against the frozen JSON schemas, including their exact timestamp patterns.
    await auth.enroll(user, guild, true);
    const start = auth.start({ redirectUri });
    z.fromJSONSchema(website.routes[0].output).parse(start);
    const result = await auth.callback({ redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
    z.fromJSONSchema(website.routes[1].output).parse(result);
    z.fromJSONSchema(website.staffSession).parse(await auth.session(result.sessionToken));
    z.fromJSONSchema(website.routes[2].output).parse(auth.logout(result.sessionToken));
  } finally { db.close(); }
});
