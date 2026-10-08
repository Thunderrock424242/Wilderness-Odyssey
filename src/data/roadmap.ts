import roadmapData from './editable/roadmap.json';
import { roadmapDataSchema } from '../../contracts/v1/content';
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

export const ROADMAP_ITEMS: RoadmapItem[] = roadmapDataSchema.parse(roadmapData);

export const ROADMAP_STATS = [
  { value: '0.1.0', label: 'Upcoming pack version', detail: 'The first public alpha, currently in development.' },
  { value: '3', label: 'Critical active tracks', detail: 'Pack foundation, worldgen and bunkers, and SPH water performance.' },
  { value: 'Open world', label: 'Narrative structure', detail: 'Lore is discovered out of order through places, items, and records.' },
] as const;
