import assert from 'node:assert/strict';
import test from 'node:test';
import { configurationView } from '../src/connected/configurationView';
import { loadConnectedConfig } from '../src/connected/config';

test('service settings report actual host configuration without leaking credentials or claiming verification', () => {
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED:'true',MAIN_SERVER_ORIGIN:'https://main.example',MAIN_SERVER_READ_TOKEN:'secret-read-'.repeat(4),MAIN_SERVER_WRITE_TOKEN:'secret-write-'.repeat(4),PLAYTEST_PUBLIC_API_ORIGIN:'https://gateway.example' });
  const content = {schemaVersion:'1.0' as const,imported:false,sourceRevision:null,transmissionCount:0,pageCount:0,publicationConfigured:false};
  const view = configurationView(config,content);
  assert.equal(view.settings.mainOrigin,'https://main.example');
  assert.equal(view.credentials.read.configured,true);
  assert.equal(view.verification.readVerified,false);
  assert.equal(view.application.state,'applied');
  assert.equal(view.bootstrap.find(item => item.label === 'Website source import')?.ready,false);
  assert.ok(!JSON.stringify(view).includes(config.readToken!));
  assert.ok(!JSON.stringify(view).includes(config.writeToken!));
  assert.deepEqual(configurationView(config,content),view);
});
