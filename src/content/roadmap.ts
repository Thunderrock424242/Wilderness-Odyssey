// Corresponds to the Roadmap section.
export type RoadmapStatus = 'done' | 'in progress' | 'planned';

export type RoadmapItem = {
  status: RoadmapStatus;
  title: string;
  body: string;
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    status: 'done',
    title: 'Alpha Launch',
    body: 'Core biomes, creatures, and exploration systems live on CurseForge.',
  },
  {
    status: 'in progress',
    title: 'Water Physics',
    body: 'Advanced ocean, river, and tide simulation with SPH fluid dynamics.',
  },
  {
    status: 'planned',
    title: 'Anomaly & Affliction',
    body: 'Deadly anomaly effects that warp the world around you - exposure brings consequences no potion can fix.',
  },
  {
    status: 'planned',
    title: 'New Dimensions',
    body: 'Alternate worlds accessible through meteor-energy portals.',
  },
  {
    status: 'planned',
    title: 'Full Narrative',
    body: 'A complete story arc uncovering the fall - and possible rebirth - of civilisation.',
  },
];
