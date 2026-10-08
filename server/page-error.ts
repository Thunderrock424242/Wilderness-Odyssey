import { GatewayError } from './http';

const styles = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#04030a;color:#f0ece0;font:1rem/1.7 system-ui,sans-serif}main{width:min(100%,48rem);margin:8vh auto;padding:clamp(1.5rem,5vw,3rem)}.label{color:#e8a020;font:0.875rem/1.5 monospace;letter-spacing:.12em}h1{font-size:clamp(2rem,6vw,3rem);line-height:1.15;overflow-wrap:anywhere}p{color:#cac2ae}nav{display:flex;flex-wrap:wrap;gap:1rem;margin-top:2rem}a{display:inline-flex;align-items:center;min-height:44px;padding:.65rem 1rem;border:1px solid #e8a020;color:#e8a020;text-decoration:none}a:hover{background:#e8a020;color:#04030a}a:focus-visible{outline:3px solid #f0ece0;outline-offset:4px}`;
let styleHash: Promise<string> | undefined;

export async function pageError(error: unknown) {
  const known = error instanceof GatewayError;
  const status = known ? error.status : 503;
  const setup = known && error.code.endsWith('NOT_CONFIGURED');
  const title = setup ? 'Staff access is being set up' : status === 401 || status === 403 ? 'Staff access is unavailable' : status === 400 ? 'This link could not be opened' : 'Staff access is temporarily unavailable';
  const message = setup ? 'The staff sign-in service has not been connected yet. Please return later. The public website is still available.'
    : status === 401 || status === 403 ? 'This account or website address cannot open the staff dashboard. Return to the public site or contact the project team for help.'
      : status === 400 ? 'Return to the public website and use its navigation to find the page you need.'
        : 'The staff service could not be reached. Please try again later. The public website is still available.';
  styleHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(styles)).then(digest => btoa(String.fromCharCode(...new Uint8Array(digest))));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} // Wilderness Odyssey</title><style>${styles}</style></head><body><main><p class="label">WILDERNESS ODYSSEY // STAFF ACCESS</p><h1>${title}</h1><p>${message}</p><nav aria-label="Return to the public website"><a href="/">Go to homepage</a><a href="/support/">Get help</a></nav></main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; style-src 'sha256-${await styleHash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  });
}
