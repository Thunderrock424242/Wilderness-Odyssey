type GalleryItem = {
  id: string;
  category: string;
  title: string;
  caption: string;
  version: string;
  lore?: string;
  image?: string;
  alt?: string;
  placeholderSymbol: string;
};

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((gallery) => {
  const data = gallery.querySelector<HTMLScriptElement>('[data-gallery-data]');
  const dialog = gallery.querySelector<HTMLDialogElement>('[data-gallery-dialog]');
  const media = gallery.querySelector<HTMLElement>('[data-gallery-media]');
  const title = gallery.querySelector<HTMLElement>('[data-gallery-title]');
  const caption = gallery.querySelector<HTMLElement>('[data-gallery-caption]');
  const meta = gallery.querySelector<HTMLElement>('[data-gallery-meta]');
  const lore = gallery.querySelector<HTMLElement>('[data-gallery-lore]');
  const counter = gallery.querySelector<HTMLElement>('[data-gallery-counter]');
  const category = gallery.querySelector<HTMLSelectElement>('[data-gallery-category]');
  const filter = gallery.querySelector<HTMLFormElement>('[data-gallery-filter]');
  const count = gallery.querySelector<HTMLElement>('[data-gallery-count]');
  const empty = gallery.querySelector<HTMLElement>('[data-empty-state]');
  const cards = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-card]')];
  if (!data?.textContent || !dialog || !media || !title || !caption || !meta || !lore || !counter) return;

  const items = JSON.parse(data.textContent) as GalleryItem[];
  let current = 0;
  let previousFocus: HTMLElement | null = null;

  const render = () => {
    const item = items[current];
    media.replaceChildren();
    if (item.image) {
      const image = document.createElement('img');
      image.src = item.image;
      image.alt = item.alt ?? item.title;
      media.appendChild(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'gallery-placeholder gallery-placeholder--large';
      const symbol = document.createElement('strong');
      symbol.textContent = item.placeholderSymbol;
      const line = document.createElement('i');
      const note = document.createElement('small');
      note.textContent = 'VISUAL RECORD PENDING';
      placeholder.append(symbol, line, note);
      media.appendChild(placeholder);
    }
    title.textContent = item.title;
    caption.textContent = item.caption;
    meta.textContent = `${item.category} // ${item.version}`;
    lore.textContent = item.lore ?? '';
    lore.hidden = !item.lore;
    counter.textContent = `${current + 1} / ${items.length}`;
  };

  const open = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    current = index;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    render();
    dialog.showModal();
  };

  const close = () => dialog.close();
  const shift = (amount: number) => {
    current = (current + amount + items.length) % items.length;
    render();
  };

  gallery.querySelectorAll<HTMLButtonElement>('[data-gallery-open]').forEach((button) => {
    button.addEventListener('click', () => open(button.dataset.galleryOpen ?? ''));
  });
  gallery.querySelector<HTMLButtonElement>('[data-gallery-close]')?.addEventListener('click', close);
  gallery.querySelector<HTMLButtonElement>('[data-gallery-prev]')?.addEventListener('click', () => shift(-1));
  gallery.querySelector<HTMLButtonElement>('[data-gallery-next]')?.addEventListener('click', () => shift(1));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowLeft') shift(-1);
    if (event.key === 'ArrowRight') shift(1);
  });
  dialog.addEventListener('close', () => previousFocus?.focus());

  const applyFilter = () => {
    const selected = category?.value ?? 'all';
    let visible = 0;
    cards.forEach((card) => {
      const matches = selected === 'all' || card.dataset.category === selected;
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  };

  filter?.addEventListener('change', applyFilter);
  filter?.addEventListener('reset', () => window.requestAnimationFrame(applyFilter));
});
