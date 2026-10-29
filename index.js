// Kinetic installs npm dependencies before this entry point runs.
// Build the TypeScript bot, then launch the compiled app in this process.
const { spawnSync } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['run', 'build'], {
  cwd: __dirname,
  stdio: 'inherit'
});

if (build.error) {
  console.error('Unable to run the bot build:', build.error);
  process.exit(1);
}

if (build.status !== 0) {
  console.error('Bot build failed; not starting an outdated build.');
  process.exit(build.status || 1);
}

const { logger } = require('./dist/utils/logger.js');
const { startCloudflareTunnel } = require('./dist/services/cloudflareTunnel.js');
const tunnel = startCloudflareTunnel({ root: __dirname, env: process.env, logger });
// Register before the bot's own shutdown handlers, which exit synchronously.
process.once('SIGINT', () => tunnel.stop());
process.once('SIGTERM', () => tunnel.stop());
process.once('exit', () => tunnel.stop(true));

require('./dist/index.js');
