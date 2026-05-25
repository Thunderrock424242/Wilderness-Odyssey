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
};

type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
  spd: number;
  dir: 1 | -1;
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export function initPageEffects() {
  initCursor();
  initProgressBar();
  initNav();
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

function initHeroBars() {
  window.addEventListener('load', () => {
    window.setTimeout(() => byId<HTMLElement>('hero')?.classList.add('bars-open'), 80);
  });
}

function initHeroCanvas() {
  const canvas = byId<HTMLCanvasElement>('hero-canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let stars: Star[] = [];

  const resize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };

  const spawnParticle = () => {
    const wisp = Math.random() > 0.4;
    particles.push({
      x: Math.random() * width,
      y: height + Math.random() * 110,
      r: wisp ? Math.random() * 2.3 + 0.7 : Math.random() * 1.55 + 0.35,
      vx: (Math.random() - 0.5) * (wisp ? 0.72 : 0.24),
      vy: -(Math.random() * (wisp ? 0.48 : 0.72) + 0.1),
      a: 0,
      maxA: wisp ? Math.random() * 0.52 + 0.22 : Math.random() * 0.62 + 0.2,
      hue: wisp ? 196 + Math.random() * 26 : 11 + Math.random() * 15,
      sat: wisp ? 86 : 100,
      lum: wisp ? 65 : 60,
      life: 0,
      maxLife: Math.random() * (wisp ? 570 : 265) + 200,
      glow: wisp ? Math.random() * 21 + 9 : Math.random() * 13 + 4,
      flicker: !wisp,
      wisp,
    });
  };

  const initParticles = () => {
    particles = [];
    stars = [];

    for (let i = 0; i < 250; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.35 + 0.2,
        a: Math.random() * 0.52 + 0.07,
        spd: Math.random() * 0.014 + 0.003,
        dir: Math.random() > 0.5 ? 1 : -1,
      });
    }

    for (let i = 0; i < 72; i += 1) spawnParticle();
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.a += star.spd * star.dir;
      if (star.a > 0.6 || star.a < 0.04) star.dir *= -1;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,222,240,${star.a})`;
      ctx.fill();
    });

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

      const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.glow);
      glow.addColorStop(0, `hsla(${particle.hue},${particle.sat}%,${particle.lum}%,${alpha * 0.88})`);
      glow.addColorStop(0.4, `hsla(${particle.hue},${particle.sat}%,${particle.lum}%,${alpha * 0.25})`);
      glow.addColorStop(1, `hsla(${particle.hue},${particle.sat}%,${particle.lum}%,0)`);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.glow, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${particle.hue},${particle.sat}%,83%,${alpha})`;
      ctx.fill();

      if (particle.life >= particle.maxLife) {
        particles.splice(i, 1);
        spawnParticle();
      }
    }

    window.requestAnimationFrame(draw);
  };

  resize();
  initParticles();
  draw();

  window.addEventListener(
    'resize',
    () => {
      resize();
      initParticles();
    },
    { passive: true },
  );
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
  const slides = Array.from(document.querySelectorAll<HTMLElement>('.gslide'));
  const dots = Array.from(document.querySelectorAll<HTMLElement>('.gdot'));
  const currentLabel = byId<HTMLElement>('gCur');
  const nextButton = byId<HTMLButtonElement>('gNext');
  const prevButton = byId<HTMLButtonElement>('gPrev');
  const stage = byId<HTMLElement>('galleryStage');

  if (!slides.length || !dots.length || !currentLabel || !nextButton || !prevButton || !stage) return;

  let current = 0;
  let timer = 0;

  const goTo = (index: number) => {
    slides[current].classList.remove('active');
    slides[current].classList.add('prev');
    window.setTimeout(() => slides[current]?.classList.remove('prev'), 1400);
    dots[current].classList.remove('active');

    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
    currentLabel.textContent = String(current + 1).padStart(2, '0');
  };

  const resetTimer = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => goTo(current + 1), 6000);
  };

  const next = () => {
    goTo(current + 1);
    resetTimer();
  };

  const prev = () => {
    goTo(current - 1);
    resetTimer();
  };

  nextButton.addEventListener('click', next);
  prevButton.addEventListener('click', prev);
  dots.forEach((dot) => dot.addEventListener('click', () => {
    goTo(Number(dot.dataset.i ?? 0));
    resetTimer();
  }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') prev();
  });

  let touchStartX = 0;
  stage.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    const deltaX = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(deltaX) > 45) (deltaX > 0 ? next : prev)();
  }, { passive: true });

  resetTimer();
}

function initSmoothScroll() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href') ?? '');
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
