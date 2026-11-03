import { Marked } from 'marked';
import * as c from '../contracts/v1/content';
import { ServiceError } from './store';

const parser = new Marked();
const invalid = ():never => { throw new ServiceError(422,'UNSAFE_CONTENT','Use Markdown formatting, HTTPS links, site links and approved images. HTML and executable content are not supported.'); };

export function markdownImages(markdown:string):string[] {
  const images:string[] = [];
  if (/^\s*(?:import|export)\s/m.test(markdown) || markdown.includes('\0')) invalid();
  const tokens = parser.lexer(markdown);
  let count = 0;
  parser.walkTokens(tokens,token => {
    if (++count > 20000 || token.type === 'html') invalid();
    if (token.type !== 'image' && token.type !== 'link') return;
    const href = token.href;
    if (/[\s\\\u0000-\u001f\u007f]/.test(href)) invalid();
    if (token.type === 'image') {
      if (!c.imagePath.safeParse(href).success) invalid();
      images.push(href);
    } else if (!(href.startsWith('#') || (/^\/(?!\/)/.test(href) && !href.includes('..')) || c.publicLink.safeParse(href).success)) invalid();
  });
  return images;
}

export function transmissionImages(content:c.Transmission):string[] {
  return [...new Set([...(content.coverImage ? [content.coverImage] : []),...content.galleryImages.map(image => image.src),...markdownImages(content.bodyMarkdown)])];
}
