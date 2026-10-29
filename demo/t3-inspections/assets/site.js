// T3 Inspections concept site by Fennington Solutions
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header gets a solid background once the page scrolls.
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-solid', window.scrollY > 8);
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

  // Schedule notices hide themselves after their last day (data-until="YYYY-MM-DD").
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  document.querySelectorAll('[data-until]').forEach((el) => {
    if (new Date(`${el.dataset.until}T00:00:00`) >= today) el.hidden = false;
  });

  // Highlight today's row in the hours table.
  const day = today.getDay();
  document.querySelectorAll('.hours tr[data-days]').forEach((row) => {
    if (row.dataset.days.split(',').map(Number).includes(day)) row.classList.add('today');
  });

  // Booking page: ?type=<Acuity appointment type id> opens the calendar on that inspection.
  const frame = document.querySelector('[data-acuity]');
  if (frame) {
    const type = new URLSearchParams(window.location.search).get('type');
    if (type && /^\d+$/.test(type)) {
      const url = new URL(frame.src);
      url.searchParams.set('appointmentType', type);
      frame.src = url.toString();
    }
  }

  // Contact forms. In this concept preview nothing is sent; the live site posts to a form endpoint.
  document.querySelectorAll('form[data-contact]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const done = form.querySelector('.form-success');
      done.hidden = false;
      form.querySelector('button[type="submit"]').disabled = true;
      done.focus();
    });
  });
})();
