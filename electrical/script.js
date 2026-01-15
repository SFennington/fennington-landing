/* ========================================
   FENNINGTON BUSINESS TEMPLATE JS
   
   TO CREATE A NEW SITE:
   1. Copy this template folder
   2. Update the CONFIG object below
   3. That's it! Everything else is automatic
   ======================================== */

// ========== CHANGE THIS CONFIG FOR EACH BUSINESS ==========
const CONFIG = {
  businessName: "Fennington Electrical",
  nicheName: "Electrical",
  city: "Denver",
  phone: "(720) 555-0123",
  email: "info@fenningtonelectrical.com",
  address: "1234 Main Street, Denver, CO 80202",
  hours: "Mon-Fri: 8:00 AM - 5:00 PM<br>Sat: By Appointment<br>Emergency Service Available 24/7",
  
  // Hero section text
  heroHeadline: "Expert Electrical Services for Your Home and Business",
  heroSubtitle: "Professional electrical installation, repair, and maintenance serving Denver since 2012. Licensed master electricians, 24/7 emergency service. Licensed, insured, and backed by 200+ five-star reviews.",
  
  // Services - customize these for each business type
  services: [
    {
      icon: "⚡",
      title: "Electrical Repairs",
      description: "Fast, reliable repairs for outlets, switches, circuit breakers, and all electrical issues in your home or business."
    },
    {
      icon: "🔌",
      title: "Installation Services",
      description: "Professional installation of fixtures, outlets, ceiling fans, appliances, and complete electrical systems."
    },
    {
      icon: "🏠",
      title: "Panel Upgrades",
      description: "Electrical panel upgrades and replacements to meet modern power demands safely and efficiently."
    },
    {
      icon: "💡",
      title: "Lighting Solutions",
      description: "Indoor and outdoor lighting design, installation, and upgrades including LED conversions and smart lighting."
    },
    {
      icon: "🚨",
      title: "Emergency Service",
      description: "24/7 emergency electrical service for power outages, electrical failures, and safety hazards."
    },
    {
      icon: "🔍",
      title: "Inspections & Safety",
      description: "Comprehensive electrical inspections, safety audits, and code compliance assessments."
    },
    {
      icon: "🏢",
      title: "Commercial Electrical",
      description: "Complete commercial electrical services including tenant improvements, lighting, and power distribution."
    },
    {
      icon: "🔋",
      title: "EV Charger Installation",
      description: "Electric vehicle charging station installation for home and business with proper permits and inspection."
    }
  ],
  
  // FAQs - customize these for each business type
  faqs: [
    {
      question: "Do you offer 24/7 emergency electrical service?",
      answer: "Yes! We provide 24/7 emergency electrical service for urgent issues like power outages, sparking outlets, burning smells, or any electrical hazard. Our licensed electricians are on call and can respond quickly to keep your property safe."
    },
    {
      question: "How much does electrical work cost?",
      answer: "Costs vary depending on the scope of work. Simple repairs like replacing an outlet start around $150, while larger projects like panel upgrades typically range from $1,500-$3,000. We provide free estimates and transparent pricing before starting any work."
    },
    {
      question: "Are your electricians licensed and insured?",
      answer: "Absolutely. All our electricians are licensed master electricians with years of experience. We carry comprehensive liability insurance and workers' compensation coverage. We also pull permits and ensure all work meets or exceeds local electrical codes."
    },
    {
      question: "Can you help with electrical permits and inspections?",
      answer: "Yes! We handle all permit applications and coordinate required inspections with local authorities. This ensures your electrical work is code-compliant and properly documented for safety and future property transactions."
    },
    {
      question: "Do you work on both residential and commercial properties?",
      answer: "Yes, we provide full-service electrical work for both residential and commercial properties. Our team has experience with everything from single-family homes to large commercial buildings, retail spaces, and industrial facilities."
    },
    {
      question: "How long does a typical electrical panel upgrade take?",
      answer: "Most residential panel upgrades take 6-8 hours to complete, usually done in a single day. This includes shutting off power, installing the new panel, rewiring circuits, and final testing. We'll schedule the work to minimize disruption to your home or business."
    },
    {
      question: "Do you offer warranties on your work?",
      answer: "Yes! We stand behind all our work with a comprehensive warranty. Labor is warrantied for 1 year, and materials are covered by manufacturer warranties. If you experience any issues with our work, we'll make it right at no additional cost."
    }
  ]
};

// ========== DOM READY ==========
document.addEventListener('DOMContentLoaded', function() {
  
  // Update business info throughout the page
  updateBusinessInfo();
  
  // Load services
  loadServices();
  
  // Load FAQs
  loadFAQs();
  
  // Setup mobile menu
  setupMobileMenu();
  
  // Setup FAQ accordion
  setupFAQAccordion();
  
  // Setup smooth scrolling
  setupSmoothScrolling();
  
  // Setup form handling
  setupFormHandling();
  
});

// ========== UPDATE BUSINESS INFO ==========
function updateBusinessInfo() {
  // Business name
  const nameElements = document.querySelectorAll('#businessName, #footerBusiness');
  nameElements.forEach(el => el.textContent = CONFIG.businessName);
  
  // Hero content
  const heroHeadline = document.getElementById('heroHeadline');
  if (heroHeadline) heroHeadline.textContent = CONFIG.heroHeadline;
  
  const heroSubtitle = document.getElementById('heroSubtitle');
  if (heroSubtitle) heroSubtitle.textContent = CONFIG.heroSubtitle;
  
  // Phone
  const phoneElements = document.querySelectorAll('#headerPhone, #contactPhone');
  phoneElements.forEach(el => {
    el.textContent = CONFIG.phone;
    el.href = 'tel:' + CONFIG.phone.replace(/\D/g, '');
  });
  
  // Email
  const emailEl = document.getElementById('contactEmail');
  if (emailEl) {
    emailEl.textContent = CONFIG.email;
    emailEl.href = 'mailto:' + CONFIG.email;
  }
  
  // Address
  const addressEl = document.getElementById('contactAddress');
  if (addressEl) addressEl.innerHTML = CONFIG.address.replace(', ', '<br>');
  
  // Hours
  const hoursEl = document.getElementById('contactHours');
  if (hoursEl) hoursEl.innerHTML = CONFIG.hours;
}

// ========== LOAD SERVICES ==========
function loadServices() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  
  CONFIG.services.forEach(service => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="service-icon">${service.icon}</div>
      <h3>${service.title}</h3>
      <p>${service.description}</p>
    `;
    grid.appendChild(card);
  });
  
  // Also populate form dropdown
  const select = document.getElementById('service');
  if (select) {
    CONFIG.services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.title.toLowerCase().replace(/\s+/g, '-');
      option.textContent = service.title;
      select.appendChild(option);
    });
    
    // Add "Other" option
    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.textContent = 'Other / Not Sure';
    select.appendChild(otherOption);
  }
}

// ========== LOAD FAQs ==========
function loadFAQs() {
  const list = document.getElementById('faqList');
  if (!list) return;
  
  CONFIG.faqs.forEach((faq, index) => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.setAttribute('data-open', 'false');
    item.innerHTML = `
      <button class="faq-question" aria-expanded="false" aria-controls="faq-answer-${index}">
        <span>${faq.question}</span>
        <svg class="faq-icon" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="faq-answer" id="faq-answer-${index}">
        <p>${faq.answer}</p>
      </div>
    `;
    list.appendChild(item);
  });
}

// ========== MOBILE MENU ==========
function setupMobileMenu() {
  const toggle = document.getElementById('mobileToggle');
  const nav = document.getElementById('mainNav');
  
  if (!toggle || !nav) return;
  
  toggle.addEventListener('click', function() {
    nav.classList.toggle('active');
    const isOpen = nav.classList.contains('active');
    toggle.setAttribute('aria-expanded', isOpen);
  });
  
  // Close menu when clicking a link
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ========== FAQ ACCORDION ==========
function setupFAQAccordion() {
  const items = document.querySelectorAll('.faq-item');
  
  items.forEach(item => {
    const button = item.querySelector('.faq-question');
    
    button.addEventListener('click', function() {
      const isOpen = item.getAttribute('data-open') === 'true';
      
      // Close all other items
      items.forEach(i => {
        i.setAttribute('data-open', 'false');
        i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      
      // Toggle this item
      if (!isOpen) {
        item.setAttribute('data-open', 'true');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// ========== SMOOTH SCROLLING ==========
function setupSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      
      e.preventDefault();
      const target = document.querySelector(href);
      
      if (target) {
        const headerHeight = document.getElementById('header').offsetHeight;
        const targetPosition = target.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ========== FORM HANDLING ==========
function setupFormHandling() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Basic validation
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const service = document.getElementById('service').value;
    
    if (!name || !phone || !email || !service) {
      alert('Please fill in all required fields.');
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    
    // Get form data
    const message = document.getElementById('message').value.trim();
    
    // Mailto fallback (opens email client)
    const subject = encodeURIComponent(`${CONFIG.businessName} - New Quote Request`);
    const body = encodeURIComponent(
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Email: ${email}\n` +
      `Service: ${service}\n` +
      `Message: ${message}`
    );
    
    window.location.href = `mailto:${CONFIG.email}?subject=${subject}&body=${body}`;
    
    // Show success message
    alert('Thank you! Your request has been sent. We\'ll contact you shortly.');
    form.reset();
  });
}
