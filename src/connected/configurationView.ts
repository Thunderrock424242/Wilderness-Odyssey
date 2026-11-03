import { createHash } from 'node:crypto';
import { configurationSchema } from '../contracts/v1/configuration';
import type { ConnectedConfig } from './config';
import type { ContentService } from './content';

/** Read-only projection of the actual runtime owner. Never serialize its config. */
export function configurationView(config: ConnectedConfig, content: ReturnType<ContentService['setup']>) {
  const settings = { mainOrigin:config.mainOrigin ?? null,intervalMs:config.intervalMs,staleSeconds:config.staleSeconds,failures:config.failures,recoveries:config.recoveries,staffChannel:config.staffChannel ?? null,publicChannel:config.publicChannel ?? null };
  const credentials = {read:{configured:!!config.readToken,updatedAt:null},write:{configured:!!config.writeToken,updatedAt:null}};
  const revision = 'host-' + createHash('sha256').update(JSON.stringify({settings,credentials})).digest('hex').slice(0,32);
  return configurationSchema.parse({schemaVersion:'1.0',revision,settings,credentials,
    verification:{state:'unverified',checkedAt:null,readVerified:false,writeVerified:false,message:'These settings are managed on Kinetic. Presence of a credential does not prove that the main server is reachable.'},
    application:{state:'applied',revision},bootstrap:[
      {label:'Discord sign-in',ready:!!config.discord},
      {label:'Website source import',ready:content.imported},
      {label:'GitHub publication',ready:content.publicationConfigured},
      {label:'Playtest client API',ready:!!config.playtestPublicApiOrigin},
      {label:'Main-server origin',ready:!!config.mainOrigin},
      {label:'Read credential',ready:!!config.readToken},
      {label:'Write credential',ready:!!config.writeToken},
    ]});
}
