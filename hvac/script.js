const CONFIG = {
  businessName: "Fennington HVAC",
  nicheName: "HVAC",
  city: "Nashville",
  phone: "413-255-1777",
  email: "Contact@fennington.com",
  address: "Nashville, TN",
  hours: "HVAC previews, local landing pages, and activation workflow.",
  heroHeadline: "Nashville HVAC Websites Built to Turn Reviews Into Calls",
  heroSubtitle: "A fast, mobile-friendly sample page for heating and air contractors that highlights AC repair, heating service, installs, maintenance, and emergency calls.",
  services: [
    { icon: "AC", title: "AC Repair", description: "Clear repair pages for no-cool calls, refrigerant issues, frozen coils, airflow problems, and urgent summer service." },
    { icon: "HT", title: "Heating Repair", description: "Heating repair messaging for furnaces, heat pumps, short cycling, ignition issues, and cold-weather calls." },
    { icon: "IN", title: "System Installation", description: "Replacement and installation copy that helps homeowners compare efficient HVAC options." },
    { icon: "MT", title: "Maintenance Plans", description: "Seasonal tune-up sections that support recurring service and prevent emergency breakdowns." },
    { icon: "EM", title: "Emergency Service", description: "Prominent emergency calls-to-action for after-hours heating and cooling needs." },
    { icon: "IAQ", title: "Indoor Air Quality", description: "Ductwork, filtration, humidity, and air quality content for higher-value service opportunities." }
  ],
  faqs: [
    { question: "Can this page use a contractor's real Google review count?", answer: "Yes. Generated previews are designed to use the lead's actual rating and review count instead of generic review claims." },
    { question: "Why focus on HVAC in Nashville first?", answer: "The first MVP market is Nashville HVAC because the lead system is intentionally capped and focused before expanding to more trades or cities." },
    { question: "Does the preview imply contractor endorsement?", answer: "No. Unpaid previews are marked as Fennington-generated previews and set to noindex until activated." },
    { question: "What services should an HVAC page highlight?", answer: "AC repair, heating repair, installation, maintenance, emergency service, ductwork, and indoor air quality are strong starting points." }
  ]
};

document.addEventListener('DOMContentLoaded', function() {
  updateBusinessInfo();
  loadServices();
  loadFAQs();
  setupMobileMenu();
  setupFAQAccordion();
  setupSmoothScrolling();
  setupFormHandling();
});

function updateBusinessInfo() {
  document.querySelectorAll('#businessName, #footerBusiness').forEach(el => el.textContent = CONFIG.businessName);
  const heroHeadline = document.getElementById('heroHeadline');
  if (heroHeadline) heroHeadline.textContent = CONFIG.heroHeadline;
  const heroSubtitle = document.getElementById('heroSubtitle');
  if (heroSubtitle) heroSubtitle.textContent = CONFIG.heroSubtitle;
  document.querySelectorAll('#headerPhone, #contactPhone').forEach(el => {
    el.textContent = CONFIG.phone;
    el.href = 'tel:' + CONFIG.phone.replace(/\D/g, '');
  });
  const emailEl = document.getElementById('contactEmail');
  if (emailEl) {
    emailEl.textContent = CONFIG.email;
    emailEl.href = 'mailto:' + CONFIG.email;
  }
}

function loadServices() {
  const grid = document.getElementById('servicesGrid');
  if (grid) {
    CONFIG.services.forEach(service => {
      const card = document.createElement('div');
      card.className = 'service-card';
      card.innerHTML = `<div class="service-icon">${service.icon}</div><h3>${service.title}</h3><p>${service.description}</p>`;
      grid.appendChild(card);
    });
  }
  const select = document.getElementById('service');
  if (select) {
    CONFIG.services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.title.toLowerCase().replace(/\s+/g, '-');
      option.textContent = service.title;
      select.appendChild(option);
    });
    const other = document.createElement('option');
    other.value = 'other';
    other.textContent = 'Other / Not Sure';
    select.appendChild(other);
  }
}

function loadFAQs() {
  const list = document.getElementById('faqList');
  if (!list) return;
  CONFIG.faqs.forEach((faq, index) => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.setAttribute('data-open', 'false');
    item.innerHTML = `<button class="faq-question" aria-expanded="false" aria-controls="faq-answer-${index}"><span>${faq.question}</span><svg class="faq-icon" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="faq-answer" id="faq-answer-${index}"><p>${faq.answer}</p></div>`;
    list.appendChild(item);
  });
}

function setupMobileMenu() {
  const toggle = document.getElementById('mobileToggle');
  const nav = document.getElementById('mainNav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function() {
    nav.classList.toggle('active');
    toggle.setAttribute('aria-expanded', nav.classList.contains('active'));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

function setupFAQAccordion() {
  document.querySelectorAll('.faq-item').forEach(item => {
    const button = item.querySelector('.faq-question');
    button.addEventListener('click', function() {
      const isOpen = item.getAttribute('data-open') === 'true';
      document.querySelectorAll('.faq-item').forEach(i => {
        i.setAttribute('data-open', 'false');
        i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.setAttribute('data-open', 'true');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

function setupSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const headerHeight = document.getElementById('header').offsetHeight;
      window.scrollTo({ top: target.offsetTop - headerHeight - 20, behavior: 'smooth' });
    });
  });
}

function setupFormHandling() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const service = document.getElementById('service').value;
    if (!name || !phone || !email || !service) {
      alert('Please fill in all required fields.');
      return;
    }
    const message = document.getElementById('message').value.trim();
    const subject = encodeURIComponent('Fennington HVAC Preview Request');
    const body = encodeURIComponent(`Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nInterest: ${service}\nMessage: ${message}`);
    window.location.href = `mailto:${CONFIG.email}?subject=${subject}&body=${body}`;
    alert('Thank you. Your request has been prepared in your email client.');
    form.reset();
  });
}
