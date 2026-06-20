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
  progressLabel: string;
  summary: string;
  deliverables: string[];
  successCriteria: string[];
  dependencies: string[];
  communitySignal: string;
};

export const ROADMAP_STATS: RoadmapStat[] = [
  {
    value: '0.1.0',
    label: 'Upcoming pack version',
    detail: 'The pack is now being assembled; version 0.1.0 will be the first alpha.',
  },
  {
    value: '3',
    label: 'Active engineering tracks',
    detail: 'Worldgen changes, bunker placement, and performance tuning are moving together.',
  },
  {
    value: 'Open World',
    label: 'Narrative structure',
    detail: 'Project Threshold, Echo Earth, the Blackout Archive, and the Exodus now guide content.',
  },
];

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    status: 'in progress',
    phase: 'Phase A0',
    title: 'First Alpha Pack Foundation',
    target: 'Version 0.1.0',
    track: 'Pack assembly',
    progress: 15,
    progressLabel: 'Early build',
    summary:
      'The pack has entered active construction. This phase turns the core mod list, configs, scripts, world systems, and lore into the first coherent playable Wilderness Odyssey build.',
    deliverables: [
      'Assemble the core mods, configs, scripts, datapacks, and Wilderness Odyssey API systems into one repeatable build.',
      'Establish a stable fresh-world path from installation and first launch through the opening survival loop.',
      'Use the current lore canon as the design baseline without forcing players through a linear campaign.',
      'Hold the first alpha to a focused scope so later systems do not destabilise the foundation.',
    ],
    successCriteria: [
      'A clean install can create and enter a new world without startup blockers.',
      'The first session supports survival, exploration, and discovery with a recognisable identity.',
      'Known limitations are documented before the build is handed to alpha testers.',
    ],
    dependencies: [
      'Compatible core mod versions and a repeatable pack build.',
      'Worldgen, bunker, and water-performance tracks reaching their first-alpha gates.',
      'A small set of reproducible playtest seeds and hardware profiles.',
    ],
    communitySignal: 'The first testing call will focus on launch blockers, broken recipes, world creation, and first-session clarity.',
  },
  {
    status: 'in progress',
    phase: 'Phase A1',
    title: 'Worldgen Changes and Bunker Placement',
    target: 'First alpha content gate',
    track: 'World creation',
    progress: 30,
    progressLabel: 'Active iteration',
    summary:
      'World generation is being reshaped while bunker placement is tuned so the opening mystery, exploration routes, and survival spaces appear naturally across fresh seeds.',
    deliverables: [
      'Iterate on terrain and biome generation for a changed Earth that feels wild, dangerous, and still alive.',
      'Tune bunker spacing, rarity, terrain fit, and discovery pacing across a broad seed sample.',
      'Keep critical bunkers reachable without making the world feel crowded with repeated structures.',
      'Use bunkers and ruins to introduce cryo, Aether, the Blackout Archive, and Project Threshold through environmental clues.',
    ],
    successCriteria: [
      'Fresh seeds generate without broken terrain seams, missing regions, or placement crashes.',
      'Bunkers are discoverable but neither guaranteed everywhere nor vanishingly rare.',
      'Structure placement supports exploration and lore without blocking normal survival.',
    ],
    dependencies: [
      'Stable worldgen configuration and structure templates.',
      'Placement rules that account for biome, slope, spacing, and spawn conditions.',
      'A seed matrix covering different terrain and biome combinations.',
    ],
    communitySignal: 'Alpha testers will be asked for seed coordinates where bunkers are buried, exposed, clustered, missing, or unreachable.',
  },
  {
    status: 'in progress',
    phase: 'Phase A2',
    title: 'SPH Water VRAM and Performance',
    target: 'First alpha performance gate',
    track: 'Renderer and simulation',
    progress: 25,
    progressLabel: 'Profiling and leak hunt',
    summary:
      'The SPH water system is being profiled for VRAM leaks and runaway cost. Water can remain ambitious only if long exploration sessions stay responsive and memory use settles instead of climbing.',
    deliverables: [
      'Reproduce and measure VRAM growth during repeatable river, ocean, shoreline, and chunk-reload routes.',
      'Audit SPH particles, GPU buffers, textures, render targets, and chunk-lifecycle cleanup for retained resources.',
      'Cap or scale expensive simulation and rendering work without flattening the water system identity.',
      'Add practical performance settings for hardware that cannot sustain the highest water quality.',
    ],
    successCriteria: [
      'VRAM usage reaches a stable plateau during an extended water-heavy test route.',
      'Repeated chunk loads and dimension transitions do not leave water resources resident indefinitely.',
      'The first alpha maintains playable frame pacing on the agreed minimum test hardware.',
    ],
    dependencies: [
      'GPU and VRAM profiles from reproducible test sessions.',
      'Renderer-mod compatibility checks and clear quality presets.',
      'Representative low-, mid-, and high-range hardware results.',
    ],
    communitySignal: 'Testers should report GPU model, settings, route length, peak VRAM, and whether performance degrades over time.',
  },
  {
    status: 'next up',
    phase: 'Phase A3',
    title: 'Lore Discovery Layer',
    target: 'After the first-alpha foundation',
    track: 'Narrative integration',
    progress: 10,
    progressLabel: 'Canon mapped',
    summary:
      'The story will be discovered through exploration rather than delivered as a forced campaign. Each structure, item, terminal, and quest should reveal a piece of the same mystery from a different direction.',
    deliverables: [
      'Aether-guided opening records that help the player survive without explaining the whole collapse.',
      'Blackout Archive trails marked by the lizard and Oliver symbols.',
      'Project Threshold, The Siren Night, and Exodus Protocol clues distributed across military and civilian structures.',
      'Lore-linked items and unlocks that make exploration progress feel purposeful instead of arbitrary.',
    ],
    successCriteria: [
      'Lore can be found out of order while still forming a coherent picture over time.',
      'Players can ignore the mystery temporarily without losing the ability to progress later.',
      'Environmental clues create questions and theories instead of becoming exposition dumps.',
    ],
    dependencies: [
      'Finalised structure roles and placement rules.',
      'Current canon naming kept consistent across quests, terminals, items, and site copy.',
      'Reliable triggers for discoveries and Aether memory fragments.',
    ],
    communitySignal: 'Need feedback on which clues feel intriguing, which are too explicit, and where players lose the trail.',
  },
  {
    status: 'planned',
    phase: 'Phase A4',
    title: 'Echo Earth and Anomaly Progression',
    target: 'Later alpha',
    track: 'World progression',
    progress: 0,
    progressLabel: 'Planned',
    summary:
      'Meteor material, stabilisation technology, and the damaged mirror world of Echo Earth will become a connected progression path that expands the mystery without replacing open-world survival.',
    deliverables: [
      'Meteor and rift materials with clear sources, risks, and uses.',
      'Stabilizer Core and Rift Key progression tied to Project Threshold ruins.',
      'A first Echo Earth pass with familiar-but-wrong terrain, hazards, structures, and safe return logic.',
      'Anomaly exposure and protection systems that reward preparation and adaptation.',
    ],
    successCriteria: [
      'Players understand how to prepare for Echo Earth without receiving a checklist of spoilers.',
      'Dimension rewards feed back into survival, exploration, and later rocket systems.',
      'Anomaly danger is readable, tense, and recoverable rather than random punishment.',
    ],
    dependencies: [
      'Stable overworld foundation and first-alpha feedback.',
      'Gateway safety, return placement, and save migration tests.',
      'Final balance for radiation, masks, rift materials, and stabilisation tech.',
    ],
    communitySignal: 'Later testing will focus on gateway safety, progression clarity, hazard fairness, and reasons to return to Earth.',
  },
  {
    status: 'planned',
    phase: 'Phase A5',
    title: 'Version 0.1.0 Stabilisation and Testing',
    target: 'Before 0.1.0 release',
    track: 'Release quality',
    progress: 0,
    progressLabel: 'Gated',
    summary:
      'Version 0.1.0 will open only after the foundation survives full-session tests. This pass turns active development work into a build other people can install, play, and report on usefully.',
    deliverables: [
      'Fresh-install, world-creation, long-session, death/reload, and update-path smoke tests.',
      'Performance presets and known-issue notes for worldgen, bunkers, and SPH water.',
      'A focused alpha test checklist with log, seed, hardware, and reproduction guidance.',
      'Accurate release notes that distinguish unfinished systems from first-alpha blockers.',
    ],
    successCriteria: [
      'No known startup, world-corruption, unbounded memory, or common placement blocker remains.',
      'A normal play session can explore generated terrain and bunkers without progressive performance collapse.',
      'Testers receive one reproducible build with clear expectations and reporting instructions.',
    ],
    dependencies: [
      'The pack foundation, worldgen, bunker placement, and water-performance gates passing.',
      'Representative hardware tests and longer play sessions.',
      'A frozen first-alpha scope and final build manifest.',
    ],
    communitySignal: 'The first alpha call will ask testers for logs, seeds, hardware details, screenshots, and exact reproduction steps.',
  },
];
