import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
  strongDelimiter: '**',
});

turndown.addRule('cms-image', {
  filter: 'img',
  replacement(_content, node) {
    const image = node as HTMLImageElement;
    const source = image.dataset.publicSrc || image.getAttribute('src') || '';
    const alt = image.getAttribute('alt') || '';
    const title = image.getAttribute('title');
    return `![${alt}](${source}${title ? ` ${JSON.stringify(title)}` : ''})`;
  },
});

export function markdownToEditorHtml(markdown: string, basePath: string): string {
  const html = sanitizeHtml(marked.parse(markdown, { async: false }) as string);
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const source = image.getAttribute('src') ?? '';
    if (source.startsWith('/')) {
      image.dataset.publicSrc = source;
      image.src = `${basePath}${source}`.replace(/\/\/{2,}/g, '/');
    }
  });
  return document.body.innerHTML;
}

export function editorHtmlToMarkdown(html: string): string {
  return turndown.turndown(sanitizeHtml(html)).trim();
}

export function markdownToPreviewHtml(markdown: string, basePath: string): string {
  return markdownToEditorHtml(markdown, basePath);
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'img', 'li', 'ol', 'p', 'pre', 's', 'strong', 'ul',
    ],
    ALLOWED_ATTR: ['alt', 'class', 'data-public-src', 'href', 'rel', 'src', 'target', 'title'],
  });
}
