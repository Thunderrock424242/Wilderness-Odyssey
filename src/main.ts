// Corresponds to the site startup sequence.
import { initPageEffects } from './pageEffects';
import { initTerminal } from './terminal';
import { renderPageContent } from './renderContent';

renderPageContent();
initPageEffects();
initTerminal();
