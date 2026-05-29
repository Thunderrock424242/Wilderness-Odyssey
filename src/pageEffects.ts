// Corresponds to global page motion, cursor, scroll, and gallery behavior.
type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  maxA: number;
  hue: number;
  sat: number;
  lum: number;
  life: number;
  maxLife: number;
  glow: number;
  flicker: boolean;
  wisp: boolean;
  sprite: HTMLCanvasElement;
  color: string;
};

type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initPageEffects() {
  initCursor();
  initProgressBar();
  initNav();
  initMobileNav();
  initHeroBars();
  initHeroCanvas();
  initScrollReveal();
  initHeroParallax();
  initGallery();
  initSmoothScroll();
}

function initCursor() {
  const cursor = byId<HTMLDivElement>('cur');
  const trail = byId<HTMLDivElement>('curt');
  if (!cursor || !trail) return;
  if (!window.matchMedia('(pointer: fine)').matches) {
    cursor.remove();
    trail.remove();
    return;
  }

  let cursorX = 0;
  let cursorY = 0;

  document.addEventListener('mousemove', (event) => {
    cursorX = event.clientX;
    cursorY = event.clientY;
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
  });

  window.setInterval(() => {
    trail.style.left = `${cursorX}px`;
    trail.style.top = `${cursorY}px`;
  }, 90);

  document.querySelectorAll('a, button, [role="button"]').forEach((element) => {
    element.addEventListener('mouseenter', () => {
      cursor.style.transform = 'translate(-50%,-50%) scale(2.2)';
    });
    element.addEventListener('mouseleave', () => {
      cursor.style.transform = 'translate(-50%,-50%) scale(1)';
    });
  });
}

function initProgressBar() {
  const progress = byId<HTMLDivElement>('prog');
  if (!progress) return;

  window.addEventListener(
    'scroll',
    () => {
      const scrollableHeight = document.body.scrollHeight - window.innerHeight;
      progress.style.width = `${scrollableHeight <= 0 ? 0 : (window.scrollY / scrollableHeight) * 100}%`;
    },
    { passive: true },
  );
}

function initNav() {
  const nav = byId<HTMLElement>('nav');
  if (!nav) return;

  window.addEventListener('scroll', () => nav.classList.toggle('solid', window.scrollY > 60), { passive: true });
}

function initMobileNav() {
  const nav = byId<HTMLElement>('nav');
  const toggle = nav?.querySelector<HTMLButtonElement>('.n-toggle');
  const links = nav?.querySelector<HTMLElement>('.n-links');
  if (!nav || !toggle || !links) return;

  const setOpen = (open: boolean) => {
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));

  links.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth > 900) setOpen(false);
    },
    { passive: true },
  );
}

function initHeroBars() {
  const openBars = () => window.requestAnimationFrame(() => byId<HTMLElement>('hero')?.classList.add('bars-open'));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openBars, { once: true });
    return;
  }

  openBars();
}

function initHeroCanvas() {
  const canvas = byId<HTMLCanvasElement>('hero-canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let stars: Star[] = [];
  let rafId = 0;
  let running = false;
  let lastFrame = 0;
  let visible = true;
  let startupReady = false;
  const frameInterval = window.matchMedia('(max-width: 700px)').matches ? 1000 / 24 : 1000 / 30;
  const starCount = window.matchMedia('(max-width: 700px)').matches ? 80 : 140;
  const particleCount = window.matchMedia('(max-width: 700px)').matches ? 22 : 38;
  const starLayer = document.createElement('canvas');
  const starCtx = starLayer.getContext('2d');
  const emberGlow = createGlowSprite(18, 100, 62);
  const wispGlow = createGlowSprite(204, 86, 68);

  const resize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    starLayer.width = width;
    starLayer.height = height;
    drawStarLayer();
  };

  const spawnParticle = () => {
    const wisp = Math.random() > 0.4;
    const hue = wisp ? 196 + Math.random() * 26 : 11 + Math.random() * 15;
    const sat = wisp ? 86 : 100;
    particles.push({
      x: Math.random() * width,
      y: height + Math.random() * 110,
      r: wisp ? Math.random() * 2.3 + 0.7 : Math.random() * 1.55 + 0.35,
      vx: (Math.random() - 0.5) * (wisp ? 0.72 : 0.24),
      vy: -(Math.random() * (wisp ? 0.48 : 0.72) + 0.1),
      a: 0,
      maxA: wisp ? Math.random() * 0.52 + 0.22 : Math.random() * 0.62 + 0.2,
      hue,
      sat,
      lum: wisp ? 65 : 60,
      life: 0,
      maxLife: Math.random() * (wisp ? 570 : 265) + 200,
      glow: wisp ? Math.random() * 21 + 9 : Math.random() * 13 + 4,
      flicker: !wisp,
      wisp,
      sprite: wisp ? wispGlow : emberGlow,
      color: `hsla(${hue},${sat}%,83%,`,
    });
  };

  const initParticles = () => {
    particles = [];
    stars = [];

    for (let i = 0; i < starCount; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.35 + 0.2,
        a: Math.random() * 0.52 + 0.07,
      });
    }

    for (let i = 0; i < particleCount; i += 1) spawnParticle();
    drawStarLayer();
  };

  function createGlowSprite(hue: number, sat: number, lum: number) {
    const sprite = document.createElement('canvas');
    const size = 64;
    sprite.width = size;
    sprite.height = size;

    const spriteCtx = sprite.getContext('2d');
    if (!spriteCtx) return sprite;

    const center = size / 2;
    const glow = spriteCtx.createRadialGradient(center, center, 0, center, center, center);
    glow.addColorStop(0, `hsla(${hue},${sat}%,${lum}%,0.88)`);
    glow.addColorStop(0.42, `hsla(${hue},${sat}%,${lum}%,0.24)`);
    glow.addColorStop(1, `hsla(${hue},${sat}%,${lum}%,0)`);
    spriteCtx.fillStyle = glow;
    spriteCtx.fillRect(0, 0, size, size);
    return sprite;
  }

  function drawStarLayer() {
    if (!starCtx) return;

    starCtx.clearRect(0, 0, width, height);
    stars.forEach((star) => {
      starCtx.beginPath();
      starCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      starCtx.fillStyle = `rgba(215,222,240,${star.a})`;
      starCtx.fill();
    });
  }

  const paintFrame = () => {
    ctx.clearRect(0, 0, width, height);
    if (starCtx) ctx.drawImage(starLayer, 0, 0);

    particles.forEach((particle) => {
      const size = particle.glow * 2;
      ctx.globalAlpha = Math.max(0, particle.a || particle.maxA * 0.45);
      ctx.drawImage(particle.sprite, particle.x - particle.glow, particle.y - particle.glow, size, size);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `${particle.color}${Math.max(0, particle.a || particle.maxA * 0.45)})`;
      ctx.fill();
    });
  };

  const draw = (timestamp: number) => {
    if (!running) return;
    rafId = window.requestAnimationFrame(draw);
    if (timestamp - lastFrame < frameInterval) return;
    lastFrame = timestamp;

    ctx.clearRect(0, 0, width, height);
    if (starCtx) ctx.drawImage(starLayer, 0, 0);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life += 1;
      particle.x += particle.vx + (particle.wisp ? Math.sin(particle.life * 0.022) * 0.54 : Math.sin(particle.life * 0.042) * 0.11);
      particle.y += particle.vy + (particle.flicker ? (Math.random() - 0.5) * 0.07 : 0);

      const progress = particle.life / particle.maxLife;
      let alpha =
        progress < 0.12
          ? (progress / 0.12) * particle.maxA
          : progress > 0.7
            ? ((1 - progress) / 0.3) * particle.maxA
            : particle.maxA;
      if (particle.flicker) alpha *= 0.74 + Math.random() * 0.26;

      const glowSize = particle.glow * 2;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.drawImage(particle.sprite, particle.x - particle.glow, particle.y - particle.glow, glowSize, glowSize);
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `${particle.color}${Math.max(0, alpha)})`;
      ctx.fill();

      if (particle.life >= particle.maxLife) {
        particles.splice(i, 1);
        spawnParticle();
      }
    }
  };

  const start = () => {
    if (running || !startupReady || !visible || prefersReducedMotion()) return;
    running = true;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(draw);
  };

  const stop = () => {
    running = false;
    window.cancelAnimationFrame(rafId);
  };

  const scheduleStart = () => {
    window.setTimeout(() => {
      startupReady = true;
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      };
      if (idleWindow.requestIdleCallback) {
        idleWindow.requestIdleCallback(start, { timeout: 1400 });
        return;
      }

      start();
    }, 1200);
  };

  resize();
  initParticles();
  paintFrame();
  scheduleStart();

  window.addEventListener(
    'resize',
    () => {
      resize();
      initParticles();
    },
    { passive: true },
  );

  if ('IntersectionObserver' in window) {
    const hero = byId<HTMLElement>('hero');
    if (hero) {
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      });
      observer.observe(hero);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

function initScrollReveal() {
  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('in')),
    { threshold: 0.11, rootMargin: '0px 0px -50px 0px' },
  );

  document.querySelectorAll('.rx').forEach((element) => revealObserver.observe(element));
}

function initHeroParallax() {
  window.addEventListener(
    'scroll',
    () => {
      const heroContent = document.querySelector<HTMLElement>('.h-content');
      if (!heroContent || window.scrollY >= window.innerHeight) return;

      heroContent.style.transform = `translateY(${window.scrollY * 0.26}px)`;
      heroContent.style.opacity = String(Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.58)));
    },
    { passive: true },
  );
}

function initGallery() {
  const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('.gallery-card'));
  const lightbox = byId<HTMLElement>('galleryLightbox');
  const frame = byId<HTMLElement>('galleryLightboxFrame');
  const caption = byId<HTMLElement>('galleryLightboxCaption');
  const counter = byId<HTMLElement>('galleryLightboxCounter');
  const thumbs = Array.from(document.querySelectorAll<HTMLButtonElement>('.gallery-lightbox-thumb'));
  const nextButton = byId<HTMLButtonElement>('galleryLightboxNext');
  const prevButton = byId<HTMLButtonElement>('galleryLightboxPrev');
  const closeButton = byId<HTMLButtonElement>('galleryLightboxClose');

  if (!cards.length || !lightbox || !frame || !caption || !counter || !thumbs.length || !nextButton || !prevButton || !closeButton) return;

  let current = 0;
  let lastFocused: HTMLElement | null = null;

  const activeCard = () => cards[current];

  const wrapIndex = (index: number) => (index + cards.length) % cards.length;

  const createPlaceholder = (card: HTMLButtonElement, large: boolean) => {
    const placeholder = div(large ? 'gallery-lightbox-placeholder' : 'gallery-thumb-placeholder');
    placeholder.appendChild(span(large ? 'gallery-placeholder-icon' : 'gallery-thumb-icon', card.dataset.placeholderIcon ?? '?'));
    if (large) {
      placeholder.appendChild(span('gallery-placeholder-label', card.dataset.placeholderLabel ?? 'Screenshot pending'));
      placeholder.appendChild(span('gallery-placeholder-hint', card.dataset.placeholderHint ?? 'Visual record pending'));
    }
    return placeholder;
  };

  const renderCurrent = () => {
    const card = activeCard();
    const imageSrc = card.dataset.imageSrc;
    frame.replaceChildren();
    caption.replaceChildren();

    if (imageSrc) {
      const image = document.createElement('img');
      image.className = 'gallery-lightbox-img';
      image.src = imageSrc;
      image.alt = card.dataset.imageAlt ?? card.dataset.title ?? 'Gallery image';
      frame.appendChild(image);
    } else {
      frame.appendChild(createPlaceholder(card, true));
    }

    caption.appendChild(div('gallery-lightbox-tag', card.dataset.tag ?? 'Gallery'));
    caption.appendChild(div('gallery-lightbox-title', card.dataset.title ?? 'Untitled image'));
    caption.appendChild(paragraph('gallery-lightbox-desc', card.dataset.description ?? ''));
    counter.textContent = `${current + 1}/${cards.length}`;
    thumbs.forEach((thumb, index) => {
      const isActive = index === current;
      thumb.classList.toggle('active', isActive);
      thumb.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  };

  const goTo = (index: number) => {
    current = wrapIndex(index);
    renderCurrent();
  };

  const open = (index: number) => {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    current = wrapIndex(index);
    renderCurrent();
    lightbox.hidden = false;
    document.body.classList.add('gallery-lock');
    window.requestAnimationFrame(() => lightbox.classList.add('open'));
    closeButton.focus({ preventScroll: true });
  };

  const close = () => {
    lightbox.classList.remove('open');
    document.body.classList.remove('gallery-lock');
    window.setTimeout(() => {
      lightbox.hidden = true;
      frame.replaceChildren();
    }, 180);
    lastFocused?.focus({ preventScroll: true });
  };

  const next = () => {
    goTo(current + 1);
  };

  const prev = () => {
    goTo(current - 1);
  };

  cards.forEach((card, index) => card.addEventListener('click', () => open(index)));
  thumbs.forEach((thumb) => thumb.addEventListener('click', () => goTo(Number(thumb.dataset.thumbIndex ?? 0))));
  nextButton.addEventListener('click', next);
  prevButton.addEventListener('click', prev);
  closeButton.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.galleryClose === 'true') close();
  });

  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') prev();
  });
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

function initSmoothScroll() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const href = anchor.getAttribute('href') ?? '';
      if (href === '#') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const target = document.querySelector(href);
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
