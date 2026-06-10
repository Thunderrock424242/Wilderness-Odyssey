import type { SlashCommand } from '../types';
import { bugReportCommand } from './bugreport';
import { changelogCommand } from './changelog';
import { crashCommand } from './crash';
import { feedbackCommand } from './feedback';
import { helpCommand } from './help';
import { knownIssuesCommand } from './knownissues';
import { performanceCommand } from './performance';
import { perfReportCommand } from './perfreport';
import { playtestCommand } from './playtest';
import { privacyCommand } from './privacy';
import { staffCommand } from './staff';
import { statusCommand } from './status';
import { suggestCommand } from './suggest';
import { sparkReportCommand } from './sparkreport';

export const commands: SlashCommand[] = [
  helpCommand,
  bugReportCommand,
  crashCommand,
  performanceCommand,
  perfReportCommand,
  knownIssuesCommand,
  changelogCommand,
  playtestCommand,
  feedbackCommand,
  statusCommand,
  suggestCommand,
  sparkReportCommand,
  staffCommand,
  privacyCommand
];
