import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthenticatedHttpMinecraftBridge } from '../src/aether/bridge/authenticatedBridge';
import { parseAetherBridgeRequest } from '../src/aether/bridge/schema';
import { validateDiagnosticAttachment } from '../src/aether/discord/diagnosticAttachment';
import { AetherPermissionManager } from '../src/aether/permissionManager';

test('profile permissions enforce self-only access by default', () => {
  const permissions = new AetherPermissionManager();
  assert.doesNotThrow(() => permissions.assertCanAccessProfile({
    requesterUserId: 'user-1',
    targetUserId: 'user-1',
    permissions: ['profile:self']
  }));
  assert.throws(() => permissions.assertCanAccessProfile({
    requesterUserId: 'user-1',
    targetUserId: 'user-2',
    permissions: ['profile:self']
  }), /only access your own/i);
});

test('Minecraft bridge authentication uses the configured shared secret', () => {
  const secret = 'a'.repeat(48);
  const bridge = new AuthenticatedHttpMinecraftBridge(secret);
  assert.equal(bridge.authenticate(secret), true);
  assert.equal(bridge.authenticate('a'.repeat(47)), false);
  assert.equal(bridge.authenticate(undefined), false);
  assert.deepEqual(bridge.getAllowedActions(), [
    'complete_link',
    'player_question',
    'crash_report',
    'server_status'
  ]);
});

test('bridge schema rejects arbitrary actions and client-supplied permissions', () => {
  assert.equal(parseAetherBridgeRequest({
    action: 'remote_console',
    requestId: 'request-1234',
    serverId: 'server-1',
    command: 'stop'
  }).ok, false);

  assert.equal(parseAetherBridgeRequest({
    action: 'player_question',
    requestId: 'request-1234',
    serverId: 'server-1',
    minecraftUuid: '123e4567-e89b-12d3-a456-426614174000',
    message: 'Where am I?',
    permissions: ['administrator']
  }).ok, false);
});

test('diagnostic attachment policy rejects unsafe files and untrusted URLs', () => {
  const policy = { maximumBytes: 1024, allowedFileTypes: ['txt', 'log'] };
  assert.equal(validateDiagnosticAttachment({
    name: 'latest.log',
    size: 100,
    contentType: 'text/plain',
    url: 'https://cdn.discordapp.com/attachments/1/2/latest.log'
  }, policy).ok, true);
  assert.equal(validateDiagnosticAttachment({
    name: 'payload.exe',
    size: 100,
    contentType: 'application/x-msdownload',
    url: 'https://cdn.discordapp.com/attachments/1/2/payload.exe'
  }, policy).ok, false);
  assert.equal(validateDiagnosticAttachment({
    name: 'latest.log',
    size: 2048,
    contentType: 'text/plain',
    url: 'https://example.com/latest.log'
  }, policy).ok, false);
});
