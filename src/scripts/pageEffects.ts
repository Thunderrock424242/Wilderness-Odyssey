type Particle = {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
  hue: number;
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initCursor() {
  const cursor = document.querySelector<HTMLElement>('#cur');
  const trail = document.querySelector<HTMLElement>('#curt');
  if (!cursor || !trail || !window.matchMedia('(pointer: fine)').matches) return;
  let x = 0;
  let y = 0;
  document.addEventListener('mousemove', (event) => {
    x = event.clientX;
    y = event.clientY;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  });
  window.setInterval(() => {
    trail.style.left = `${x}px`;
    trail.style.top = `${y}px`;
  }, 90);
  document.querySelectorAll('a, button, input, select, summary').forEach((element) => {
    element.addEventListener('mouseenter', () => { cursor.style.transform = 'translate(-50%,-50%) scale(2.2)'; });
    element.addEventListener('mouseleave', () => { cursor.style.transform = 'translate(-50%,-50%) scale(1)'; });
  });
}

function initProgress() {
  const progress = document.querySelector<HTMLElement>('#prog');
  if (!progress) return;
  const update = () => {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${available > 0 ? (window.scrollY / available) * 100 : 0}%`;
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initNav() {
  const nav = document.querySelector<HTMLElement>('#nav');
  const toggle = nav?.querySelector<HTMLButtonElement>('.n-toggle');
  const links = nav?.querySelector<HTMLElement>('.n-links');
  if (!nav || !toggle || !links) return;
  document.documentElement.classList.add('js');
  const setOpen = (open: boolean) => {
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  const update = () => nav.classList.toggle('solid', window.scrollY > 60);
  update();
  window.addEventListener('scroll', update, { passive: true });
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
  links.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) setOpen(false); }, { passive: true });
}

function initReveal() {
  const items = document.querySelectorAll('.rx');
  if (!items.length || reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('in'); }),
    { threshold: 0.1, rootMargin: '0px 0px -45px 0px' },
  );
  items.forEach((item) => observer.observe(item));
}

function initHeroCanvas() {
  const hero = document.querySelector<HTMLElement>('#hero');
  const canvas = document.querySelector<HTMLCanvasElement>('#hero-canvas');
  const context = canvas?.getContext('2d');
  if (!hero || !canvas || !context || reducedMotion) return;
  const particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let running = true;

  const spawn = (initial = false): Particle => ({
    x: Math.random() * width,
    y: initial ? Math.random() * height : height + Math.random() * 60,
    radius: Math.random() * 1.9 + 0.45,
    vx: (Math.random() - 0.5) * 0.45,
    vy: -(Math.random() * 0.52 + 0.13),
    alpha: 0,
    maxAlpha: Math.random() * 0.46 + 0.18,
    life: initial ? Math.random() * 280 : 0,
    maxLife: Math.random() * 300 + 220,
    hue: Math.random() > 0.45 ? 201 : 21,
  });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = hero.clientWidth;
    height = hero.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const draw = () => {
    if (!running) return;
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      particle.life += 1;
      particle.x += particle.vx + Math.sin(particle.life * 0.025) * 0.16;
      particle.y += particle.vy;
      const progress = particle.life / particle.maxLife;
      particle.alpha = progress < 0.15 ? (progress / 0.15) * particle.maxAlpha : progress > 0.75 ? ((1 - progress) / 0.25) * particle.maxAlpha : particle.maxAlpha;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.shadowBlur = particle.radius * 8;
      context.shadowColor = `hsla(${particle.hue},90%,68%,${Math.max(0, particle.alpha)})`;
      context.fillStyle = `hsla(${particle.hue},90%,76%,${Math.max(0, particle.alpha)})`;
      context.fill();
      if (particle.life >= particle.maxLife || particle.y < -20) particles[index] = spawn();
    }
    context.shadowBlur = 0;
    frame = window.requestAnimationFrame(draw);
  };

  resize();
  const count = window.innerWidth < 700 ? 38 : 72;
  for (let index = 0; index < count; index += 1) particles.push(spawn(true));
  hero.classList.add('bars-open');
  draw();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) draw(); else window.cancelAnimationFrame(frame);
  });
}

initCursor();
initProgress();
initNav();
initReveal();
initHeroCanvas();
