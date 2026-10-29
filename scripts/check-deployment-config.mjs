import { deploymentEnvironment, requireDeploymentSettings } from './deployment-config.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--environment')) throw new Error('Usage: npm run config:check -- --environment production (or preview).');
  const environment = args[1] ?? deploymentEnvironment();
  const settings = requireDeploymentSettings({ environment });
  console.log(settings.STAFF_AUTH_MODE === 'disabled' && environment === 'production'
    ? 'Public website configuration is valid for production. Staff access is disabled; backend and Access setup are not required.'
    : 'Deployment configuration is valid for ' + environment + '. Secret bindings and live services must still be configured separately.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
