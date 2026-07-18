document.querySelectorAll<HTMLElement>('[data-archive-filter]').forEach((archive) => {
  const form = archive.querySelector<HTMLFormElement>('[data-filter-form]');
  const query = archive.querySelector<HTMLInputElement>('[data-filter-query]');
  const type = archive.querySelector<HTMLSelectElement>('[data-filter-type]');
  const tag = archive.querySelector<HTMLSelectElement>('[data-filter-tag]');
  const version = archive.querySelector<HTMLSelectElement>('[data-filter-version]');
  const items = [...archive.querySelectorAll<HTMLElement>('[data-filter-item]')];
  const count = archive.querySelector<HTMLElement>('[data-filter-count]');
  const empty = archive.querySelector<HTMLElement>('[data-empty-state]');

  const apply = () => {
    const searchValue = query?.value.trim().toLowerCase() ?? '';
    const typeValue = type?.value ?? 'all';
    const tagValue = tag?.value ?? 'all';
    const versionValue = version?.value ?? 'all';
    let visible = 0;

    items.forEach((item) => {
      const matches =
        (!searchValue || (item.dataset.search ?? '').includes(searchValue)) &&
        (typeValue === 'all' || item.dataset.type === typeValue) &&
        (tagValue === 'all' || (item.dataset.tags ?? '').split('|').includes(tagValue)) &&
        (versionValue === 'all' || item.dataset.version === versionValue);
      item.hidden = !matches;
      if (matches) visible += 1;
    });

    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  };

  form?.addEventListener('input', apply);
  form?.addEventListener('change', apply);
  form?.addEventListener('reset', () => window.requestAnimationFrame(apply));
});
