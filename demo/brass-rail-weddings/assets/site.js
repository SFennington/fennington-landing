// The Brass Rail Weddings: concept site by Fennington Solutions
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header turns solid once the page scrolls past the hero edge.
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-solid', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Full-screen mobile menu.
  const toggle = document.querySelector('.menu-toggle');
  const panel = document.getElementById('mobile-nav');
  if (toggle && panel) {
    const setOpen = (open) => {
      panel.classList.toggle('open', open);
      panel.inert = !open;
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('no-scroll', open);
      // Wait a frame so the panel is visible before moving focus into it.
      requestAnimationFrame(() => (open ? panel.querySelector('.menu-close') : toggle).focus());
    };
    toggle.addEventListener('click', () => setOpen(true));
    panel.querySelector('.menu-close').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
    });
  }

  // Fade sections in as they scroll into view.
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // Accessible tabs (menus page). Without JS every panel simply shows.
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        select(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
    select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  });

  // Available dates: drop anything already past, then tidy empty months and columns.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  document.querySelectorAll('[data-date]').forEach((el) => {
    if (new Date(`${el.dataset.date}T00:00:00`) < today) el.remove();
  });
  document.querySelectorAll('[data-limit]').forEach((box) => {
    [...box.querySelectorAll('[data-date]')].slice(Number(box.dataset.limit)).forEach((el) => el.remove());
  });
  document.querySelectorAll('.month').forEach((month) => {
    if (!month.querySelector('[data-date]')) month.remove();
  });
  document.querySelectorAll('.day-col').forEach((col) => {
    if (!col.querySelector('[data-date]')) col.querySelector('.day-empty')?.removeAttribute('hidden');
  });

  // Gallery filters and lightbox.
  const items = [...document.querySelectorAll('.g-item')];
  const filters = document.querySelectorAll('.filter');
  filters.forEach((btn) => btn.addEventListener('click', () => {
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const tag = btn.dataset.filter;
    items.forEach((item) => {
      item.closest('figure').hidden = tag !== 'all' && !item.dataset.tags.split(' ').includes(tag);
    });
  }));

  const lightbox = document.querySelector('.lightbox');
  if (lightbox && items.length && typeof lightbox.showModal === 'function') {
    const img = lightbox.querySelector('img');
    const caption = lightbox.querySelector('.lightbox-caption');
    let index = 0;
    const visible = () => items.filter((item) => !item.closest('figure').hidden);
    const show = (i) => {
      const list = visible();
      index = (i + list.length) % list.length;
      const item = list[index];
      img.src = item.dataset.full;
      img.alt = item.querySelector('img').alt;
      caption.textContent = item.dataset.caption || '';
    };
    items.forEach((item) => item.addEventListener('click', () => {
      show(visible().indexOf(item));
      lightbox.showModal();
    }));
    lightbox.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
    lightbox.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
    lightbox.querySelector('.lb-close').addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-inner')) lightbox.close();
    });
  }

  // Load heavy third-party embeds (3-D tour) only when asked.
  document.querySelectorAll('[data-embed]').forEach((btn) => btn.addEventListener('click', () => {
    const box = btn.closest('.embed');
    const frame = document.createElement('iframe');
    frame.src = btn.dataset.embed;
    frame.title = btn.dataset.title || 'Embedded content';
    frame.allow = 'fullscreen; xr-spatial-tracking; gyroscope; accelerometer';
    frame.allowFullscreen = true;
    box.replaceChildren(frame);
  }));
})();
