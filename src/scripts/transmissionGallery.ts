type TransmissionGalleryImage = { src: string; alt: string; caption?: string };

document.querySelectorAll<HTMLElement>('[data-transmission-gallery]').forEach((gallery) => {
  const data = gallery.querySelector<HTMLScriptElement>('[data-transmission-gallery-data]');
  const dialog = gallery.querySelector<HTMLDialogElement>('[data-transmission-gallery-dialog]');
  const media = gallery.querySelector<HTMLElement>('[data-transmission-gallery-media]');
  const title = gallery.querySelector<HTMLElement>('[data-transmission-gallery-title]');
  const caption = gallery.querySelector<HTMLElement>('[data-transmission-gallery-caption]');
  const counter = gallery.querySelector<HTMLElement>('[data-transmission-gallery-counter]');
  const closeButton = gallery.querySelector<HTMLButtonElement>('[data-transmission-gallery-close]');
  if (!data?.textContent || !dialog || !media || !title || !caption || !counter || !closeButton) return;

  const images = JSON.parse(data.textContent) as TransmissionGalleryImage[];
  let current = 0;
  let previousFocus: HTMLElement | null = null;

  const render = () => {
    const item = images[current];
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.alt;
    media.replaceChildren(image);
    title.textContent = item.alt;
    caption.textContent = item.caption ?? '';
    caption.hidden = !item.caption;
    counter.textContent = `VISUAL ${current + 1} / ${images.length}`;
  };

  const open = (index: number) => {
    if (!images[index]) return;
    current = index;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    render();
    dialog.showModal();
    closeButton.focus();
  };

  const close = () => dialog.close();
  const shift = (amount: number) => {
    current = (current + amount + images.length) % images.length;
    render();
  };

  gallery.querySelectorAll<HTMLButtonElement>('[data-transmission-gallery-open]').forEach((button) => {
    button.addEventListener('click', () => open(Number(button.dataset.transmissionGalleryOpen)));
  });
  closeButton.addEventListener('click', close);
  gallery.querySelector<HTMLButtonElement>('[data-transmission-gallery-prev]')?.addEventListener('click', () => shift(-1));
  gallery.querySelector<HTMLButtonElement>('[data-transmission-gallery-next]')?.addEventListener('click', () => shift(1));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowLeft') shift(-1);
    else if (event.key === 'ArrowRight') shift(1);
  });
  dialog.addEventListener('close', () => previousFocus?.focus());
});
