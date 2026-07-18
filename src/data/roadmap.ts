import type { FeatureCategory } from './features';

export const ROADMAP_STATUSES = ['Planned', 'Research', 'In Development', 'Testing', 'Blocked', 'Complete'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export type RoadmapTask = {
  label: string;
  complete: boolean;
};

export type RoadmapItem = {
  id: string;
  phase: string;
  title: string;
  description: string;
  category: FeatureCategory;
  status: RoadmapStatus;
  progress: number;
  progressLabel: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Later';
  milestone: string;
  dependencies: string[];
  relatedTransmissions: string[];
  tasks: RoadmapTask[];
  exitConditions: string[];
  communitySignal: string;
  image?: string;
};

const tasks = (...labels: string[]): RoadmapTask[] => labels.map((label) => ({ label, complete: false }));

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: 'first-alpha-foundation',
    phase: 'Phase A0',
    title: 'First Alpha Pack Foundation',
    description:
      'The pack has entered active construction. This phase turns the core mod list, configs, scripts, world systems, and lore into the first coherent playable Wilderness Odyssey build.',
    category: 'Survival',
    status: 'In Development',
    progress: 15,
    progressLabel: 'Early build',
    priority: 'Critical',
    milestone: 'Version 0.1.0',
    dependencies: [
      'Compatible core mod versions and a repeatable pack build.',
      'Worldgen, bunker, and water-performance tracks reaching their first-alpha gates.',
      'A small set of reproducible playtest seeds and hardware profiles.',
    ],
    relatedTransmissions: ['version-0-1-0-takes-shape'],
    tasks: tasks(
      'Assemble the core mods, configs, scripts, datapacks, and Wilderness Odyssey API systems into one repeatable build.',
      'Establish a stable fresh-world path from installation and first launch through the opening survival loop.',
      'Use the current lore canon as the design baseline without forcing players through a linear campaign.',
      'Hold the first alpha to a focused scope so later systems do not destabilize the foundation.',
    ),
    exitConditions: [
      'A clean install can create and enter a new world without startup blockers.',
      'The first session supports survival, exploration, and discovery with a recognizable identity.',
      'Known limitations are documented before the build is handed to alpha testers.',
    ],
    communitySignal:
      'The first testing call will focus on launch blockers, broken recipes, world creation, and first-session clarity.',
  },
  {
    id: 'worldgen-bunker-placement',
    phase: 'Phase A1',
    title: 'Worldgen Changes and Bunker Placement',
    description:
      'World generation is being reshaped while bunker placement is tuned so the opening mystery, exploration routes, and survival spaces appear naturally across fresh seeds.',
    category: 'World Generation',
    status: 'In Development',
    progress: 30,
    progressLabel: 'Active iteration',
    priority: 'Critical',
    milestone: 'First alpha content gate',
    dependencies: [
      'Stable worldgen configuration and structure templates.',
      'Placement rules that account for biome, slope, spacing, and spawn conditions.',
      'A seed matrix covering different terrain and biome combinations.',
    ],
    relatedTransmissions: ['version-0-1-0-takes-shape'],
    tasks: tasks(
      'Iterate on terrain and biome generation for a changed Earth that feels wild, dangerous, and still alive.',
      'Tune bunker spacing, rarity, terrain fit, and discovery pacing across a broad seed sample.',
      'Keep critical bunkers reachable without making the world feel crowded with repeated structures.',
      'Use bunkers and ruins to introduce cryo, Aether, the Blackout Archive, and Project Threshold through environmental clues.',
    ),
    exitConditions: [
      'Fresh seeds generate without broken terrain seams, missing regions, or placement crashes.',
      'Bunkers are discoverable but neither guaranteed everywhere nor vanishingly rare.',
      'Structure placement supports exploration and lore without blocking normal survival.',
    ],
    communitySignal:
      'Alpha testers will be asked for seed coordinates where bunkers are buried, exposed, clustered, missing, or unreachable.',
  },
  {
    id: 'sph-water-performance',
    phase: 'Phase A2',
    title: 'SPH Water VRAM and Performance',
    description:
      'The SPH water system is being profiled for VRAM leaks and runaway cost. Water can remain ambitious only if long exploration sessions stay responsive and memory use settles instead of climbing.',
    category: 'Water System',
    status: 'In Development',
    progress: 25,
    progressLabel: 'Profiling and leak hunt',
    priority: 'Critical',
    milestone: 'First alpha performance gate',
    dependencies: [
      'GPU and VRAM profiles from reproducible test sessions.',
      'Renderer-mod compatibility checks and clear quality presets.',
      'Representative low-, mid-, and high-range hardware results.',
    ],
    relatedTransmissions: ['version-0-1-0-takes-shape'],
    tasks: tasks(
      'Reproduce and measure VRAM growth during repeatable river, ocean, shoreline, and chunk-reload routes.',
      'Audit SPH particles, GPU buffers, textures, render targets, and chunk-lifecycle cleanup for retained resources.',
      'Cap or scale expensive simulation and rendering work without flattening the water system identity.',
      'Add practical performance settings for hardware that cannot sustain the highest water quality.',
    ),
    exitConditions: [
      'VRAM usage reaches a stable plateau during an extended water-heavy test route.',
      'Repeated chunk loads and dimension transitions do not leave water resources resident indefinitely.',
      'The first alpha maintains playable frame pacing on the agreed minimum test hardware.',
    ],
    communitySignal:
      'Testers should report GPU model, settings, route length, peak VRAM, and whether performance degrades over time.',
  },
  {
    id: 'lore-discovery-layer',
    phase: 'Phase A3',
    title: 'Lore Discovery Layer',
    description:
      'The story will be discovered through exploration rather than delivered as a forced campaign. Each structure, item, terminal, and quest should reveal a piece of the same mystery from a different direction.',
    category: 'Lore',
    status: 'Research',
    progress: 10,
    progressLabel: 'Canon mapped',
    priority: 'High',
    milestone: 'After the first-alpha foundation',
    dependencies: [
      'Finalized structure roles and placement rules.',
      'Current canon naming kept consistent across quests, terminals, items, and site copy.',
      'Reliable triggers for discoveries and Aether memory fragments.',
    ],
    relatedTransmissions: ['version-0-1-0-takes-shape'],
    tasks: tasks(
      'Create Aether-guided opening records that help the player survive without explaining the whole collapse.',
      'Build Blackout Archive trails marked by the lizard and Oliver symbols.',
      'Distribute Project Threshold, The Siren Night, and Exodus Protocol clues across military and civilian structures.',
      'Tie lore-linked items and unlocks to exploration so progress feels purposeful instead of arbitrary.',
    ),
    exitConditions: [
      'Lore can be found out of order while still forming a coherent picture over time.',
      'Players can ignore the mystery temporarily without losing the ability to progress later.',
      'Environmental clues create questions and theories instead of becoming exposition dumps.',
    ],
    communitySignal:
      'Need feedback on which clues feel intriguing, which are too explicit, and where players lose the trail.',
  },
  {
    id: 'echo-earth-progression',
    phase: 'Phase A4',
    title: 'Echo Earth and Anomaly Progression',
    description:
      'Meteor material, stabilization technology, and the damaged mirror world of Echo Earth will become a connected progression path that expands the mystery without replacing open-world survival.',
    category: 'Dimensions',
    status: 'Planned',
    progress: 0,
    progressLabel: 'Planned',
    priority: 'Later',
    milestone: 'Later alpha',
    dependencies: [
      'Stable overworld foundation and first-alpha feedback.',
      'Gateway safety, return placement, and save migration tests.',
      'Final balance for radiation, masks, rift materials, and stabilization tech.',
    ],
    relatedTransmissions: [],
    tasks: tasks(
      'Create meteor and rift materials with clear sources, risks, and uses.',
      'Connect Stabilizer Core and Rift Key progression to Project Threshold ruins.',
      'Build a first Echo Earth pass with familiar-but-wrong terrain, hazards, structures, and safe return logic.',
      'Add anomaly exposure and protection systems that reward preparation and adaptation.',
    ),
    exitConditions: [
      'Players understand how to prepare for Echo Earth without receiving a checklist of spoilers.',
      'Dimension rewards feed back into survival, exploration, and later rocket systems.',
      'Anomaly danger is readable, tense, and recoverable rather than random punishment.',
    ],
    communitySignal:
      'Later testing will focus on gateway safety, progression clarity, hazard fairness, and reasons to return to Earth.',
  },
  {
    id: 'version-0-1-0-stabilization',
    phase: 'Phase A5',
    title: 'Version 0.1.0 Stabilization and Testing',
    description:
      'Version 0.1.0 will open only after the foundation survives full-session tests. This pass turns active development work into a build other people can install, play, and report on usefully.',
    category: 'Performance',
    status: 'Planned',
    progress: 0,
    progressLabel: 'Gated',
    priority: 'High',
    milestone: 'Before 0.1.0 release',
    dependencies: [
      'The pack foundation, worldgen, bunker placement, and water-performance gates passing.',
      'Representative hardware tests and longer play sessions.',
      'A frozen first-alpha scope and final build manifest.',
    ],
    relatedTransmissions: ['version-0-1-0-takes-shape'],
    tasks: tasks(
      'Run fresh-install, world-creation, long-session, death/reload, and update-path smoke tests.',
      'Publish performance presets and known-issue notes for worldgen, bunkers, and SPH water.',
      'Prepare a focused alpha test checklist with log, seed, hardware, and reproduction guidance.',
      'Write accurate release notes that distinguish unfinished systems from first-alpha blockers.',
    ),
    exitConditions: [
      'No known startup, world-corruption, unbounded memory, or common placement blocker remains.',
      'A normal play session can explore generated terrain and bunkers without progressive performance collapse.',
      'Testers receive one reproducible build with clear expectations and reporting instructions.',
    ],
    communitySignal:
      'The first alpha call will ask testers for logs, seeds, hardware details, screenshots, and exact reproduction steps.',
  },
];

export const ROADMAP_STATS = [
  { value: '0.1.0', label: 'Upcoming pack version', detail: 'The first public alpha, currently in development.' },
  { value: '3', label: 'Critical active tracks', detail: 'Pack foundation, worldgen and bunkers, and SPH water performance.' },
  { value: 'Open world', label: 'Narrative structure', detail: 'Lore is discovered out of order through places, items, and records.' },
] as const;
