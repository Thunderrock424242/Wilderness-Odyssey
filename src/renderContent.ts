// Corresponds to rendering data-driven page sections into index.html containers.
import { FEATURES } from './content/features';
import { GALLERY_SLIDES, type GallerySlide } from './content/gallerySlides';
import { BLOG_POSTS } from './content/blogPosts';
import { ROADMAP_ITEMS, type RoadmapStatus } from './content/roadmap';
import { SURVIVOR_LOGS } from './content/survivorLogs';
import { TERMINAL_HINTS } from './content/terminalHints';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const delayClass = (index: number) => `d${Math.min(index + 1, 7)}`;
const roadmapStatusClass: Record<RoadmapStatus, string> = {
  done: 'done',
  'in progress': 'in-progress',
  planned: '',
};

export function renderPageContent() {
  renderGallery();
  renderFeatures();
  renderRoadmap();
  renderTerminalHints();
  renderSurvivorLogs();
  renderBlogPosts();
}

function renderGallery() {
  const stage = byId<HTMLElement>('galleryStage');
  if (!stage) return;

  const fragment = document.createDocumentFragment();
  GALLERY_SLIDES.forEach((slide, index) => fragment.appendChild(createGallerySlide(slide, index)));
  fragment.appendChild(createGalleryControls(GALLERY_SLIDES.length));
  stage.replaceChildren(fragment);
}

function createGallerySlide(slide: GallerySlide, index: number) {
  const wrapper = document.createElement('div');
  wrapper.className = `gslide${index === 0 ? ' active' : ''}`;
  wrapper.dataset.index = String(index);

  if (slide.image) {
    const image = document.createElement('img');
    image.className = 'gslide-img';
    image.src = slide.image.src;
    image.alt = slide.image.alt;
    image.loading = index === 0 ? 'eager' : 'lazy';
    wrapper.appendChild(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'gslide-placeholder';
    placeholder.appendChild(span('gph-icon', slide.placeholderIcon));
    placeholder.appendChild(span('gph-label', slide.placeholderLabel));
    placeholder.appendChild(span('gph-hint', slide.placeholderHint));
    wrapper.appendChild(placeholder);
  }

  wrapper.appendChild(div('gslide-ov'));
  wrapper.appendChild(div('gslide-left-ov'));

  const caption = div('gcaption');
  caption.appendChild(div('gcap-tag', slide.tag));
  caption.appendChild(div('gcap-title', slide.title));
  caption.appendChild(div('gcap-desc', slide.description));
  wrapper.appendChild(caption);

  return wrapper;
}

function createGalleryControls(totalSlides: number) {
  const controls = div('g-controls');

  const prev = document.createElement('button');
  prev.className = 'g-prev';
  prev.id = 'gPrev';
  prev.type = 'button';
  prev.ariaLabel = 'Previous';
  prev.textContent = '\u2190';
  controls.appendChild(prev);

  const dots = div('g-dots');
  dots.id = 'gDots';
  for (let index = 0; index < totalSlides; index += 1) {
    const dot = div(`gdot${index === 0 ? ' active' : ''}`);
    dot.dataset.i = String(index);
    dots.appendChild(dot);
  }
  controls.appendChild(dots);

  const next = document.createElement('button');
  next.className = 'g-next';
  next.id = 'gNext';
  next.type = 'button';
  next.ariaLabel = 'Next';
  next.textContent = '\u2192';
  controls.appendChild(next);

  const counter = div('g-counter');
  const current = document.createElement('span');
  current.id = 'gCur';
  current.textContent = '01';
  counter.append(current, ` / ${String(totalSlides).padStart(2, '0')}`);
  controls.appendChild(counter);

  return controls;
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

  const fragment = document.createDocumentFragment();
  ROADMAP_ITEMS.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = `ri rx rx-right ${delayClass(index)}`;

    const dotWrap = div('ri-dot-wrap');
    const statusClass = roadmapStatusClass[item.status];
    const dot = div(`ri-dot${statusClass ? ` ${statusClass}` : ''}`);
    dotWrap.appendChild(dot);

    const body = div('ri-body');
    body.appendChild(heading('h4', '', item.title));
    body.appendChild(paragraph('', item.body));

    row.append(dotWrap, body);
    fragment.appendChild(row);
  });

  list.replaceChildren(fragment);
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
  const grid = byId<HTMLElement>('blogPostsGrid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  BLOG_POSTS.forEach((post, index) => {
    const card = document.createElement('article');
    card.className = `blog-card${post.featured ? ' featured' : ''} rx rx-up ${delayClass(index)}`;

    const meta = div('blog-meta');
    meta.appendChild(span('blog-label', post.label));
    meta.appendChild(span('blog-date', post.date));

    card.appendChild(meta);
    card.appendChild(heading('h3', 'blog-title', post.title));
    card.appendChild(paragraph('blog-excerpt', post.excerpt));

    const tags = div('blog-tags');
    post.tags.forEach((tag) => tags.appendChild(span('blog-tag', tag)));
    card.appendChild(tags);

    const details = document.createElement('details');
    details.className = 'blog-details';

    const summary = document.createElement('summary');
    summary.textContent = 'Read entry';
    details.appendChild(summary);

    const body = div('blog-body');
    post.body.forEach((paragraphText) => body.appendChild(paragraph('', paragraphText)));
    details.appendChild(body);

    card.appendChild(details);
    fragment.appendChild(card);
  });

  grid.replaceChildren(fragment);
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
