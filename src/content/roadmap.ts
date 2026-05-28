// Corresponds to the Roadmap section.
export type RoadmapStatus = 'complete' | 'in progress' | 'next up' | 'planned' | 'research';

export type RoadmapStat = {
  value: string;
  label: string;
  detail: string;
};

export type RoadmapItem = {
  status: RoadmapStatus;
  phase: string;
  title: string;
  target: string;
  track: string;
  progress: number;
  summary: string;
  deliverables: string[];
  successCriteria: string[];
  dependencies: string[];
  communitySignal: string;
};

export const ROADMAP_STATS: RoadmapStat[] = [
  {
    value: '0.5',
    label: 'Current public alpha',
    detail: 'Foundation, site systems, and first public-facing loops are live.',
  },
  {
    value: '6',
    label: 'Tracked milestones',
    detail: 'Each phase has deliverables, dependencies, and a clear exit check.',
  },
  {
    value: 'No dates',
    label: 'Window-based targets',
    detail: 'Milestones move by build quality instead of fake calendar promises.',
  },
];

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    status: 'complete',
    phase: 'Phase A0',
    title: 'Public Alpha Foundation',
    target: 'Available now',
    track: 'Launch baseline',
    progress: 100,
    summary:
      'The public alpha establishes the core identity of Wilderness Odyssey: post-impact exploration, living biomes, anomaly mystery, and a feedback loop through the site and Discord.',
    deliverables: [
      'Public project presence with cinematic one-page site, gallery, field notes, and Bunker OS terminal.',
      'Core exploration fantasy defined around a reborn world, anomaly energy, evolved wildlife, and lost civilisation clues.',
      'Modular site content files so roadmap entries, blogs, logs, features, and gallery slides can be updated without layout edits.',
      'Initial community path for bug reports, suggestions, preview sharing, and contributor coordination.',
    ],
    successCriteria: [
      'Players can understand the mod fantasy in the first visit and find where to follow development.',
      'Future content updates can be added to the site from focused TypeScript data files.',
      'Known issues are gathered before the next feature-heavy alpha push.',
    ],
    dependencies: [
      'GitHub Pages build path staying aligned with the main Wilderness Odyssey repo.',
      'Community reports from early alpha players.',
    ],
    communitySignal: 'Report install friction, confusing site copy, missing screenshots, and first-session gameplay blockers.',
  },
  {
    status: 'in progress',
    phase: 'Phase A1',
    title: 'Water Systems and Terrain Feel',
    target: 'Next alpha build',
    track: 'Simulation polish',
    progress: 68,
    summary:
      'Water is being moved from visual promise to dependable gameplay tech: stable simulation hooks, readable shore behavior, and performance that survives real exploration sessions.',
    deliverables: [
      'Stabilise SPH-driven water behavior for buckets, rivers, oceans, and shoreline scenes.',
      'Tune shore waves, fluid rendering, and terrain transitions so water feels alive without becoming noisy.',
      'Profile client and server tick paths in high-water areas to protect frame rate and server health.',
      'Document known limits so future biome and dimension work can reuse the system safely.',
    ],
    successCriteria: [
      'Extended ocean and river exploration does not create simulation drift, runaway particles, or obvious frame spikes.',
      'Water features look intentional from the player camera instead of feeling like debug effects.',
      'The next alpha can ship water improvements without blocking unrelated worldgen work.',
    ],
    dependencies: [
      'NeoForge client/server tick hooks and renderer paths.',
      'Repeatable playtest worlds with beaches, rivers, and deep water.',
      'Performance checks on mid-range hardware.',
    ],
    communitySignal: 'Need reports from ocean bases, riverside travel, and long boat routes once the build is posted.',
  },
  {
    status: 'next up',
    phase: 'Phase A2',
    title: 'Anomaly Exposure and Affliction Loop',
    target: 'After water stabilisation',
    track: 'Survival systems',
    progress: 35,
    summary:
      'Anomaly energy should become a readable survival pressure, not just lore. The goal is a danger loop where players recognise exposure, make decisions, and carry consequences back to base.',
    deliverables: [
      'Exposure meter or equivalent feedback that makes unsafe anomaly zones understandable in the moment.',
      'Affliction stages with symptoms, escalating penalties, and room for rare beneficial mutations later.',
      'Shelter, equipment, consumables, or rituals that give players meaningful counterplay.',
      'Riftfall-style world events that make anomaly energy feel global instead of locked to one biome.',
    ],
    successCriteria: [
      'Players can tell when they are in danger before the system becomes punishing.',
      'Counterplay requires preparation but does not feel like random busywork.',
      'Affliction outcomes create stories without permanently ruining a save by surprise.',
    ],
    dependencies: [
      'Status effect balance pass.',
      'Weather/event hooks for world-wide anomaly pressure.',
      'Clear UI language for exposure, symptoms, and recovery.',
    ],
    communitySignal: 'Need feedback on whether the system feels tense, fair, and worth preparing for.',
  },
  {
    status: 'planned',
    phase: 'Phase A3',
    title: 'Meteor Progression and Gateway Dimension',
    target: 'Mid alpha',
    track: 'World progression',
    progress: 24,
    summary:
      'Meteor impacts are planned to become a progression pillar: find the scars, recover anomaly resources, craft a gateway, and step into a dimension that changes what the overworld means.',
    deliverables: [
      'Meteor-linked resource path with anomaly ore, impact-site rewards, and rare exploration incentives.',
      'Craftable gateway structure or block that turns meteor discoveries into a clear progression moment.',
      'First anomaly dimension pass with unique terrain, hazards, resources, and return logic.',
      'Reason to revisit overworld ruins after dimension resources enter the loop.',
    ],
    successCriteria: [
      'Players can discover the path naturally through exploration and codex clues.',
      'The gateway feels earned and dangerous instead of becoming a simple menu teleport.',
      'Dimension rewards feed back into base-building, survival, and later story systems.',
    ],
    dependencies: [
      'Meteor generation reliability across seeds.',
      'Gateway teleporter safety checks.',
      'Loot, recipe, and balance pass for anomaly resources.',
    ],
    communitySignal: 'Need seed reports where meteor sites are too rare, too common, buried, or unrewarding.',
  },
  {
    status: 'planned',
    phase: 'Phase A4',
    title: 'Codex, Lore, and Survivor Narrative',
    target: 'Late alpha',
    track: 'Narrative systems',
    progress: 18,
    summary:
      'The story should feel uncovered through play: field reports, ruined sites, redacted documents, bunker terminals, and a first-party codex that belongs inside the world.',
    deliverables: [
      'Custom codex screen for discoveries, tutorials, lore pages, and progression hints.',
      'Starter pages that explain survival basics without breaking the mystery.',
      'Unlockable survivor logs, redacted research notes, and meteor investigation records.',
      'Narrative arc connecting the impact, anomaly energy, afflictions, ruins, and possible recovery.',
    ],
    successCriteria: [
      'New players can learn what to do next without needing an external wiki.',
      'Lore entries reward exploration and create theories instead of dumping exposition.',
      'The codex supports future systems without turning into a hard-to-maintain tangle.',
    ],
    dependencies: [
      'Lore unlock triggers tied to gameplay events.',
      'Screen polish for readability at common Minecraft UI scales.',
      'Final naming for key creatures, factions, and anomaly phenomena.',
    ],
    communitySignal: 'Need suggestions for found documents, ruin stories, and codex topics players actually want in-game.',
  },
  {
    status: 'research',
    phase: 'Phase B0',
    title: 'Beta Readiness and Multiplayer Hardening',
    target: 'Beta gate',
    track: 'Release quality',
    progress: 10,
    summary:
      'Before beta, the mod needs the unglamorous but crucial pass: server stability, config sanity, repeatable update notes, and enough polish that a world can last longer than a test session.',
    deliverables: [
      'Dedicated-server test pass for major systems, especially water, weather, dimensions, and progression triggers.',
      'Config options for worldgen density, anomaly intensity, difficulty pressure, and performance-sensitive effects.',
      'Compatibility notes for common modpack environments and launcher setup.',
      'Release checklist covering migrations, changelog accuracy, screenshots, known issues, and rollback guidance.',
    ],
    successCriteria: [
      'Small multiplayer servers can run the core loop without desyncs or runaway tick cost.',
      'Pack makers have enough config control to tune Wilderness Odyssey without editing code.',
      'Release notes describe real player-facing changes, not just internal file movement.',
    ],
    dependencies: [
      'Stable alpha feature set.',
      'Server logs from longer multiplayer sessions.',
      'Compatibility testing against likely pack combinations.',
    ],
    communitySignal: 'Need server owners and modpack testers willing to share logs, configs, and reproduction steps.',
  },
];
