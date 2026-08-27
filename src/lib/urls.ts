const runtimeBase = import.meta.env?.BASE_URL || '/';

const isExternalOrFragment = (value: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);

export function withBase(path = '/', base = runtimeBase): string {
  if (isExternalOrFragment(path)) return path;

  const normalizedBase = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  const normalizedPath = path.replace(/^\/+/, '');
  return normalizedPath ? `${normalizedBase}${normalizedPath}` : normalizedBase;
}

export function transmissionUrl(id: string, base = runtimeBase): string {
  return withBase(`/transmissions/${id}/`, base);
}

export function tagUrl(tag: string, base = runtimeBase): string {
  return withBase(`/tags/${slugify(tag)}/`, base);
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
