// Corresponds to the Patch Notes section.
export type PatchNote = {
  version: string;
  date: string;
  status: string;
  title: string;
  summary: string;
  highlights: string[];
  fixes: string[];
  knownIssues: string[];
};

export const PATCH_NOTES: PatchNote[] = [
  {
    version: 'Alpha 0.5',
    date: '2026-05-29',
    status: 'Current',
    title: 'Public Site and Update Hub',
    summary:
      'The project site now has focused archive pages for roadmap, gallery, news, blog posts, and release notes so future updates are easier to read and maintain.',
    highlights: [
      'Added dedicated roadmap, gallery, latest news, blog, and patch notes pages.',
      'Moved repeated site content into focused TypeScript data files.',
      'Kept the Bunker OS terminal, survivor logs, and home-page story sections as the main first-visit experience.',
    ],
    fixes: [
      'Updated the GitHub Pages build path for the main Wilderness Odyssey repository.',
      'Improved mobile navigation with a collapsible menu and better small-screen spacing.',
      'Added generated share pages for individual field-note entries.',
    ],
    knownIssues: [
      'Gallery entries still need more real in-game screenshots as new builds produce them.',
      'Patch note entries are maintained manually until the release pipeline is more formal.',
    ],
  },
  {
    version: 'Alpha 0.4',
    date: '2026-05-25',
    status: 'Archived',
    title: 'Field Notes and Modular Content',
    summary:
      'This pass made site updates less painful by separating editable content from the main page layout.',
    highlights: [
      'Added blog and latest-news feeds powered by the same content source.',
      'Moved features, gallery slides, roadmap entries, survivor logs, and terminal hints into content modules.',
      'Added clearer maintenance copy around incomplete Bunker OS archive records.',
    ],
    fixes: [
      'Reduced duplicated hardcoded content in the main HTML.',
      'Mapped roadmap status labels to stable CSS class names.',
      'Kept content modules labeled so future edits are easier to find.',
    ],
    knownIssues: [
      'Some older site copy still reflects placeholder public-alpha language.',
      'Download links remain pointed at the general CurseForge Minecraft page until the project page is final.',
    ],
  },
  {
    version: 'Alpha 0.3',
    date: '2026-05-09',
    status: 'Archived',
    title: 'Bunker OS Terminal Build',
    summary:
      'The interactive terminal became part of the site identity, turning update text and lore hooks into an in-world interface.',
    highlights: [
      'Added command history, autocomplete, clickable command hints, and terminal output styling.',
      'Introduced Bunker OS language for the post-impact setting.',
      'Created a foundation for future lore commands, version output, and hidden records.',
    ],
    fixes: [
      'Improved the first-page survival mood with terminal warnings and recovered record styling.',
      'Made the terminal usable as a real interaction instead of a static prop.',
    ],
    knownIssues: [
      'Terminal records are still limited and should expand as in-game systems become stable.',
    ],
  },
];
