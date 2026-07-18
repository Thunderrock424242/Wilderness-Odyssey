import type { RoadmapItem } from '../data/roadmap';

export type RoadmapFilter = {
  query?: string;
  category?: string;
  status?: string;
};

export function roadmapMatches(item: RoadmapItem, filter: RoadmapFilter): boolean {
  const query = filter.query?.trim().toLowerCase() ?? '';
  const category = filter.category?.trim().toLowerCase() ?? '';
  const status = filter.status?.trim().toLowerCase() ?? '';
  const searchable = [item.title, item.description, item.category, item.phase, item.milestone, ...item.dependencies]
    .join(' ')
    .toLowerCase();

  return (
    (!query || searchable.includes(query)) &&
    (!category || category === 'all' || item.category.toLowerCase() === category) &&
    (!status || status === 'all' || item.status.toLowerCase() === status)
  );
}

export function filterRoadmap(items: RoadmapItem[], filter: RoadmapFilter): RoadmapItem[] {
  return items.filter((item) => roadmapMatches(item, filter));
}
