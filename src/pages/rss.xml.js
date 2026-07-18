import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../data/site';
import { getPublishedTransmissions } from '../lib/transmissions';
import { transmissionUrl } from '../lib/urls';

export async function GET(context) {
  const entries = getPublishedTransmissions(await getCollection('transmissions'));
  return rss({
    title: `${SITE.name} Transmissions`,
    description: SITE.description,
    site: context.site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.publishedAt,
      link: transmissionUrl(entry.id),
      categories: [entry.data.type, ...entry.data.tags],
      author: entry.data.author,
    })),
    customData: '<language>en-us</language>',
  });
}
