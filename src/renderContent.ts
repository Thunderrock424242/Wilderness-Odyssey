// Corresponds to rendering data-driven sections into page containers.
import { FEATURES } from './content/features';
import { GALLERY_SLIDES, type GallerySlide } from './content/gallerySlides';
import { BLOG_POSTS, type BlogPost } from './content/blogPosts';
import { PATCH_NOTES, type PatchNote } from './content/patchNotes';
import { ROADMAP_ITEMS, ROADMAP_STATS, type RoadmapStatus } from './content/roadmap';
import { SURVIVOR_LOGS } from './content/survivorLogs';
import { TERMINAL_HINTS } from './content/terminalHints';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const delayClass = (index: number) => `d${Math.min(index + 1, 7)}`;
const roadmapStatusClass: Record<RoadmapStatus, string> = {
  complete: 'done',
  'in progress': 'in-progress',
  'next up': 'next-up',
  planned: 'planned',
  research: 'research',
};

export function renderPageContent() {
  renderGallery();
  renderFeatures();
  renderRoadmap();
  renderTerminalHints();
  renderSurvivorLogs();
  renderLatestNews();
  renderBlogPosts();
  renderPatchNotes();
  scrollToHashTarget();
}

function renderGallery() {
  const stage = byId<HTMLElement>('galleryStage');
  if (!stage) return;

  byId<HTMLElement>('galleryLightbox')?.remove();

  const fragment = document.createDocumentFragment();
  const grid = div('gallery-grid');
  grid.setAttribute('aria-label', 'Wilderness Odyssey screenshot gallery');
  GALLERY_SLIDES.forEach((slide, index) => grid.appendChild(createGalleryCard(slide, index)));
  fragment.appendChild(grid);
  stage.replaceChildren(fragment);
  document.body.appendChild(createGalleryLightbox(GALLERY_SLIDES));
}

function createGalleryCard(slide: GallerySlide, index: number) {
  const card = document.createElement('button');
  card.className = `gallery-card rx rx-up ${delayClass(index)}`;
  card.type = 'button';
  card.dataset.galleryIndex = String(index);
  card.dataset.tag = slide.tag;
  card.dataset.title = slide.title;
  card.dataset.description = slide.description;
  card.dataset.placeholderIcon = slide.placeholderIcon;
  card.dataset.placeholderLabel = slide.placeholderLabel;
  card.dataset.placeholderHint = slide.placeholderHint;
  card.ariaLabel = `Open ${slide.title} screenshot`;

  if (slide.image) {
    card.dataset.imageSrc = slide.image.src;
    card.dataset.imageAlt = slide.image.alt;
  }

  const media = div('gallery-card-media');

  if (slide.image) {
    const image = document.createElement('img');
    image.className = 'gallery-card-img';
    image.src = slide.image.src;
    image.alt = slide.image.alt;
    image.loading = index === 0 ? 'eager' : 'lazy';
    media.appendChild(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-card-placeholder';
    placeholder.appendChild(span('gallery-placeholder-icon', slide.placeholderIcon));
    placeholder.appendChild(span('gallery-placeholder-label', slide.placeholderLabel));
    placeholder.appendChild(span('gallery-placeholder-hint', slide.placeholderHint));
    media.appendChild(placeholder);
  }

  media.appendChild(div('gallery-card-shade'));
  card.appendChild(media);

  const caption = div('gallery-card-caption');
  caption.appendChild(div('gallery-card-tag', slide.tag));
  caption.appendChild(div('gallery-card-title', slide.title));
  card.appendChild(caption);

  return card;
}

function createGalleryLightbox(slides: GallerySlide[]) {
  const lightbox = document.createElement('div');
  lightbox.className = 'gallery-lightbox';
  lightbox.id = 'galleryLightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Gallery image viewer');

  const backdrop = div('gallery-lightbox-backdrop');
  backdrop.dataset.galleryClose = 'true';
  lightbox.appendChild(backdrop);

  const counter = div('gallery-lightbox-counter');
  counter.id = 'galleryLightboxCounter';
  lightbox.appendChild(counter);

  const close = document.createElement('button');
  close.className = 'gallery-lightbox-close';
  close.id = 'galleryLightboxClose';
  close.type = 'button';
  close.ariaLabel = 'Close gallery viewer';
  close.textContent = 'x';
  lightbox.appendChild(close);

  const prev = document.createElement('button');
  prev.className = 'gallery-lightbox-nav gallery-lightbox-prev';
  prev.id = 'galleryLightboxPrev';
  prev.type = 'button';
  prev.ariaLabel = 'Previous image';
  prev.textContent = '\u2190';

  const frame = div('gallery-lightbox-frame');
  frame.id = 'galleryLightboxFrame';

  const caption = document.createElement('figcaption');
  caption.className = 'gallery-lightbox-caption';
  caption.id = 'galleryLightboxCaption';

  const figure = document.createElement('figure');
  figure.className = 'gallery-lightbox-figure';
  figure.append(frame, caption);

  const next = document.createElement('button');
  next.className = 'gallery-lightbox-nav gallery-lightbox-next';
  next.id = 'galleryLightboxNext';
  next.type = 'button';
  next.ariaLabel = 'Next image';
  next.textContent = '\u2192';

  const main = div('gallery-lightbox-main');
  main.append(prev, figure, next);
  lightbox.appendChild(main);

  const thumbs = div('gallery-lightbox-thumbs');
  thumbs.id = 'galleryLightboxThumbs';
  slides.forEach((slide, index) => thumbs.appendChild(createGalleryThumb(slide, index)));
  lightbox.appendChild(thumbs);

  return lightbox;
}

function createGalleryThumb(slide: GallerySlide, index: number) {
  const thumb = document.createElement('button');
  thumb.className = 'gallery-lightbox-thumb';
  thumb.type = 'button';
  thumb.dataset.thumbIndex = String(index);
  thumb.ariaLabel = `Show ${slide.title}`;

  if (slide.image) {
    const image = document.createElement('img');
    image.src = slide.image.src;
    image.alt = '';
    image.loading = 'lazy';
    thumb.appendChild(image);
    return thumb;
  }

  const placeholder = div('gallery-thumb-placeholder');
  placeholder.appendChild(span('gallery-thumb-icon', slide.placeholderIcon));
  thumb.appendChild(placeholder);

  return thumb;
}

function renderFeatures() {
  const grid = byId<HTMLElement>('featuresGrid') ?? document.querySelector<HTMLElement>('.feat-grid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  FEATURES.forEach((feature, index) => {
    const item = div(`fitem rx rx-up ${delayClass(index)}`);
    item.appendChild(div('fi-num', String(index + 1).padStart(2, '0')));
    item.appendChild(span('fi-ico', feature.icon));
    item.appendChild(heading('h3', 'fi-title', feature.title));
    item.appendChild(paragraph('fi-body', feature.body));
    fragment.appendChild(item);
  });

  grid.replaceChildren(fragment);
}

function renderRoadmap() {
  const list = byId<HTMLUListElement>('roadmapList') ?? document.querySelector<HTMLUListElement>('.rmap');
  if (!list) return;

  const roadmap = list.closest<HTMLElement>('#roadmap');
  const isSummary = roadmap?.dataset.roadmapMode === 'summary';

  const stats = byId<HTMLElement>('roadmapStats');
  if (stats) {
    const statsFragment = document.createDocumentFragment();
    ROADMAP_STATS.forEach((stat, index) => {
      const statItem = div(`road-stat rx rx-left ${delayClass(index + 2)}`);
      statItem.appendChild(div('road-stat-value', stat.value));
      statItem.appendChild(div('road-stat-label', stat.label));
      statItem.appendChild(paragraph('road-stat-detail', stat.detail));
      statsFragment.appendChild(statItem);
    });
    stats.replaceChildren(statsFragment);
  }

  const fragment = document.createDocumentFragment();
  ROADMAP_ITEMS.forEach((item, index) => {
    if (isSummary) {
      fragment.appendChild(createRoadmapSummaryRow(item, index));
      return;
    }

    const row = document.createElement('li');
    row.className = `ri rx rx-right ${delayClass(index)}`;
    row.dataset.status = roadmapStatusClass[item.status];

    const dotWrap = div('ri-dot-wrap');
    const statusClass = roadmapStatusClass[item.status];
    const dot = div(`ri-dot${statusClass ? ` ${statusClass}` : ''}`);
    const phase = span('ri-phase-dot', item.phase);
    dotWrap.appendChild(dot);
    dotWrap.appendChild(phase);

    const body = div('ri-body');
    const head = div('ri-head');
    const meta = div('ri-meta');
    meta.appendChild(span('ri-phase', item.phase));
    meta.appendChild(span(`ri-status ${statusClass}`, item.status));
    meta.appendChild(span('ri-target', item.target));
    head.appendChild(meta);
    head.appendChild(heading('h4', '', item.title));
    head.appendChild(paragraph('ri-summary', item.summary));
    body.appendChild(head);

    const progress = div('ri-progress');
    const progressLabel = div('ri-progress-label');
    progressLabel.appendChild(span('', item.track));
    progressLabel.appendChild(span('', `${item.progress}%`));
    const progressTrack = div('ri-progress-track');
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', `${item.title} progress`);
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', String(item.progress));
    const progressFill = div('ri-progress-fill');
    progressFill.style.width = `${Math.max(0, Math.min(item.progress, 100))}%`;
    progressTrack.appendChild(progressFill);
    progress.append(progressLabel, progressTrack);
    body.appendChild(progress);

    const details = div('ri-detail-grid');
    details.appendChild(createRoadmapBlock('Deliverables', item.deliverables));
    details.appendChild(createRoadmapBlock('Exit check', item.successCriteria));
    details.appendChild(createRoadmapBlock('Depends on', item.dependencies));
    body.appendChild(details);
    body.appendChild(paragraph('ri-community', item.communitySignal));

    row.append(dotWrap, body);
    fragment.appendChild(row);
  });

  list.replaceChildren(fragment);
}

function createRoadmapSummaryRow(item: (typeof ROADMAP_ITEMS)[number], index: number) {
  const statusClass = roadmapStatusClass[item.status];
  const row = document.createElement('li');
  row.className = `ri ri-summary-card rx rx-right ${delayClass(index)}`;
  row.dataset.status = statusClass;

  const dotWrap = div('ri-dot-wrap');
  dotWrap.appendChild(div(`ri-dot${statusClass ? ` ${statusClass}` : ''}`));
  dotWrap.appendChild(span('ri-phase-dot', item.phase));

  const body = div('ri-body');

  const meta = div('ri-meta');
  meta.appendChild(span('ri-phase', item.phase));
  meta.appendChild(span(`ri-status ${statusClass}`, item.status));
  meta.appendChild(span('ri-target', item.target));

  const titleRow = div('ri-summary-title-row');
  titleRow.appendChild(heading('h4', '', item.title));
  titleRow.appendChild(span('ri-summary-percent', `${item.progress}%`));

  const progress = div('ri-progress');
  const progressTrack = div('ri-progress-track');
  progressTrack.setAttribute('role', 'progressbar');
  progressTrack.setAttribute('aria-label', `${item.title} progress`);
  progressTrack.setAttribute('aria-valuemin', '0');
  progressTrack.setAttribute('aria-valuemax', '100');
  progressTrack.setAttribute('aria-valuenow', String(item.progress));
  const progressFill = div('ri-progress-fill');
  progressFill.style.width = `${Math.max(0, Math.min(item.progress, 100))}%`;
  progressTrack.appendChild(progressFill);
  progress.appendChild(progressTrack);

  body.append(meta, titleRow, paragraph('ri-summary', item.summary), progress);
  row.append(dotWrap, body);

  return row;
}

function createRoadmapBlock(title: string, items: string[]) {
  const block = div('ri-block');
  block.appendChild(div('ri-block-title', title));

  const list = document.createElement('ul');
  list.className = 'ri-points';
  items.forEach((item) => {
    const row = document.createElement('li');
    row.textContent = item;
    list.appendChild(row);
  });
  block.appendChild(list);

  return block;
}

function renderTerminalHints() {
  const hints = byId<HTMLElement>('terminalCommandHints');
  if (!hints) return;

  const fragment = document.createDocumentFragment();
  TERMINAL_HINTS.forEach((hint) => {
    const item = span(`cmd-hint${hint.tone && hint.tone !== 'default' ? ` cmd-hint-${hint.tone}` : ''}`, hint.command);
    item.role = 'button';
    item.tabIndex = 0;
    item.dataset.command = hint.command;
    fragment.appendChild(item);
  });

  hints.replaceChildren(fragment);
}

function renderSurvivorLogs() {
  const grid = byId<HTMLElement>('survivorLogsGrid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  SURVIVOR_LOGS.forEach((log, index) => {
    const card = div(`slog${log.locked ? ' slog-locked' : ''} rx rx-up ${delayClass(index)}`);

    const head = div('slog-head');
    head.appendChild(span('slog-id', log.id));
    head.appendChild(span('slog-date', log.date));

    card.appendChild(head);
    card.appendChild(div('slog-author', `\u2014 Survivor: ${log.survivor}`));
    card.appendChild(paragraph('slog-body', log.body));

    const footer = div('slog-footer');
    footer.appendChild(span(`slog-tag ${log.tone}`, log.status));
    card.appendChild(footer);

    fragment.appendChild(card);
  });

  grid.replaceChildren(fragment);
}

function renderBlogPosts() {
  const grids = Array.from(document.querySelectorAll<HTMLElement>('[data-blog-feed], #blogPostsGrid'));
  if (!grids.length) return;

  grids.forEach((grid) => {
    const fragment = document.createDocumentFragment();
    getLatestPosts().forEach((post, index) => fragment.appendChild(createBlogPostCard(post, index, true)));
    grid.replaceChildren(fragment);
  });
}

function renderLatestNews() {
  const feeds = Array.from(document.querySelectorAll<HTMLElement>('[data-news-feed]'));
  if (!feeds.length) return;

  feeds.forEach((feed) => {
    const limit = Number(feed.dataset.newsLimit ?? BLOG_POSTS.length);
    const fragment = document.createDocumentFragment();
    getLatestPosts()
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : BLOG_POSTS.length)
      .forEach((post, index) => fragment.appendChild(createBlogPostCard(post, index, false)));
    feed.replaceChildren(fragment);
  });
}

function createBlogPostCard(post: BlogPost, index: number, showFullEntry: boolean) {
  const slug = slugify(post.title);
  const shareUrl = blogPostShareUrl(slug);
  const card = document.createElement('article');
  card.className = `blog-card${post.featured ? ' featured' : ''} rx rx-up ${delayClass(index)}`;
  card.id = `${showFullEntry ? 'post' : 'news'}-${slug}`;

  const meta = div('blog-meta');
  meta.appendChild(span('blog-label', post.label));
  meta.appendChild(span('blog-date', post.date));

  card.appendChild(meta);
  card.appendChild(heading('h3', 'blog-title', post.title));
  card.appendChild(paragraph('blog-excerpt', post.excerpt));

  const tags = div('blog-tags');
  post.tags.forEach((tag) => tags.appendChild(span('blog-tag', tag)));
  card.appendChild(tags);

  if (showFullEntry) {
    const details = document.createElement('details');
    details.className = 'blog-details';

    const summary = document.createElement('summary');
    summary.textContent = 'Read entry';
    details.appendChild(summary);

    const body = div('blog-body');
    post.body.forEach((paragraphText) => body.appendChild(paragraph('', paragraphText)));
    details.appendChild(body);

    card.appendChild(details);
    card.appendChild(createBlogPostLink(shareUrl, 'Share field note'));
    return card;
  }

  card.appendChild(createBlogPostLink(shareUrl, 'Read field note'));

  return card;
}

function getLatestPosts() {
  return [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function blogPostShareUrl(slug: string) {
  return `blog/${slug}/`;
}

function createBlogPostLink(href: string, text: string) {
  const link = document.createElement('a');
  link.className = 'blog-read-link';
  link.href = href;
  link.textContent = text;
  return link;
}

function renderPatchNotes() {
  const grid = byId<HTMLElement>('patchNotesGrid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  getLatestPatchNotes().forEach((note, index) => fragment.appendChild(createPatchNoteCard(note, index)));
  grid.replaceChildren(fragment);
}

function createPatchNoteCard(note: PatchNote, index: number) {
  const card = document.createElement('article');
  card.className = `patch-card rx rx-up ${delayClass(index)}`;

  const meta = div('patch-meta');
  meta.appendChild(span('patch-version', note.version));
  meta.appendChild(span('patch-status', note.status));
  meta.appendChild(span('patch-date', note.date));

  card.appendChild(meta);
  card.appendChild(heading('h3', 'patch-title', note.title));
  card.appendChild(paragraph('patch-summary', note.summary));

  const lists = div('patch-lists');
  lists.appendChild(createPatchBlock('Highlights', note.highlights));
  lists.appendChild(createPatchBlock('Fixes', note.fixes));
  lists.appendChild(createPatchBlock('Known issues', note.knownIssues));
  card.appendChild(lists);

  return card;
}

function createPatchBlock(title: string, items: string[]) {
  const block = div('patch-block');
  block.appendChild(div('patch-block-title', title));

  const list = document.createElement('ul');
  list.className = 'patch-points';
  items.forEach((item) => {
    const row = document.createElement('li');
    row.textContent = item;
    list.appendChild(row);
  });

  block.appendChild(list);
  return block;
}

function getLatestPatchNotes() {
  return [...PATCH_NOTES].sort((a, b) => b.date.localeCompare(a.date));
}

function scrollToHashTarget() {
  if (!window.location.hash) return;

  window.requestAnimationFrame(() => {
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);
    target?.scrollIntoView();
  });
}

function div(className: string, text?: string) {
  const element = document.createElement('div');
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function span(className: string, text: string) {
  const element = document.createElement('span');
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function paragraph(className: string, text: string) {
  const element = document.createElement('p');
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function heading(tagName: 'h3' | 'h4', className: string, text: string) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}
