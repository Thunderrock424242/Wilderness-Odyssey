import type { SlashCommand } from '../types';
import { bugReportCommand } from './bugreport';
import { changelogCommand } from './changelog';
import { crashCommand } from './crash';
import { feedbackCommand } from './feedback';
import { helpCommand } from './help';
import { installHelpCommand } from './installhelp';
import { knownIssuesCommand } from './knownissues';
import { minecraftCommand } from './minecraft';
import { performanceCommand } from './performance';
import { perfReportCommand } from './perfreport';
import { playtestCommand } from './playtest';
import { privacyCommand } from './privacy';
import { staffCommand } from './staff';
import { statusCommand } from './status';
import { suggestCommand } from './suggest';
import { sparkReportCommand } from './sparkreport';
import { supportPanelCommand } from './supportpanel';
import { shutdownCommand } from './shutdown';

export const commands: SlashCommand[] = [
  helpCommand,
  bugReportCommand,
  crashCommand,
  performanceCommand,
  perfReportCommand,
  minecraftCommand,
  knownIssuesCommand,
  changelogCommand,
  playtestCommand,
  feedbackCommand,
  installHelpCommand,
  statusCommand,
  suggestCommand,
  sparkReportCommand,
  supportPanelCommand,
  shutdownCommand,
  staffCommand,
  privacyCommand
];
