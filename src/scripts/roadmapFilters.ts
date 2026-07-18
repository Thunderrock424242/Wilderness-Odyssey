document.querySelectorAll<HTMLElement>('[data-roadmap-dashboard]').forEach((dashboard) => {
  const form = dashboard.querySelector<HTMLFormElement>('[data-roadmap-filters]');
  const query = dashboard.querySelector<HTMLInputElement>('[data-roadmap-query]');
  const category = dashboard.querySelector<HTMLSelectElement>('[data-roadmap-category]');
  const status = dashboard.querySelector<HTMLSelectElement>('[data-roadmap-status]');
  const count = dashboard.querySelector<HTMLElement>('[data-roadmap-count]');
  const empty = dashboard.querySelector<HTMLElement>('[data-empty-state]');
  const items = [...dashboard.querySelectorAll<HTMLElement>('[data-roadmap-item]')];

  const apply = () => {
    const searchValue = query?.value.trim().toLowerCase() ?? '';
    const categoryValue = category?.value ?? 'all';
    const statusValue = status?.value ?? 'all';
    let visible = 0;

    items.forEach((item) => {
      const matches =
        (!searchValue || (item.dataset.search ?? '').includes(searchValue)) &&
        (categoryValue === 'all' || item.dataset.category === categoryValue) &&
        (statusValue === 'all' || item.dataset.status === statusValue);
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
