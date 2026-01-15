/* ========================================
   FENNINGTON BUSINESS TEMPLATE JS
   
   TO CREATE A NEW SITE:
   1. Copy this template folder
   2. Update the CONFIG object below
   3. That's it! Everything else is automatic
   ======================================== */

// ========== CHANGE THIS CONFIG FOR EACH BUSINESS ==========
const CONFIG = {
  businessName: "Fennington Snow Removal",
  nicheName: "Snow Removal",
  city: "Denver",
  phone: "(720) 555-0123",
  email: "info@fenningtonsnowremoval.com",
  address: "1234 Main Street, Denver, CO 80202",
  hours: "24/7 During Snow Season<br>Mon-Fri: 8:00 AM - 5:00 PM Off-Season",
  
  // Hero section text
  heroHeadline: "Reliable Snow Removal Services You Can Count On",
  heroSubtitle: "Professional snow plowing and ice management serving Denver since 2012. Fast response, 24/7 availability during storms. Licensed, insured, and backed by 200+ five-star reviews.",
  
  // Services - customize these for each business type
  services: [
    {
      icon: "❄️",
      title: "Snow Plowing",
      description: "Fast, efficient snow plowing for driveways, parking lots, and commercial properties with priority service available."
    },
    {
      icon: "🧂",
      title: "Ice Management",
      description: "Professional de-icing and salt application to keep walkways, driveways, and parking areas safe and accessible."
    },
    {
      icon: "🏢",
      title: "Commercial Snow Removal",
      description: "Comprehensive snow removal services for businesses, including scheduled visits and 24/7 emergency response."
    },
    {
      icon: "🏠",
      title: "Residential Services",
      description: "Reliable residential snow removal keeping your driveway and walkways clear all winter long."
    },
    {
      icon: "📅",
      title: "Seasonal Contracts",
      description: "Worry-free winter with seasonal contracts providing unlimited snow removal throughout the season."
    },
    {
      icon: "🚨",
      title: "Emergency Service",
      description: "24/7 emergency snow removal when you need it most. Fast response during major winter storms."
    },
    {
      icon: "🧹",
      title: "Sidewalk Clearing",
      description: "Complete sidewalk and walkway clearing to ensure safe access and compliance with local ordinances."
    },
    {
      icon: "🛣️",
      title: "Parking Lot Services",
      description: "Large-scale parking lot plowing and maintenance for commercial properties of all sizes."
    }
  ],
  
  // FAQs - customize these for each business type
  faqs: [
    {
      question: "How quickly do you respond to snow events?",
      answer: "We begin plowing when snow accumulation reaches 2 inches, or sooner for priority contracts. Our crews are dispatched 24/7 during snow events, with most properties serviced within 2-4 hours of the trigger depth. Emergency service customers receive first priority."
    },
    {
      question: "Do you offer seasonal contracts or per-storm pricing?",
      answer: "We offer both options! Seasonal contracts provide unlimited service throughout winter at a fixed price, offering the best value and priority service. Per-storm pricing is available for those who prefer to pay as needed. We'll help you choose the best option based on your property and needs."
    },
    {
      question: "What areas do you service?",
      answer: "We provide snow removal throughout the Denver metro area including Aurora, Lakewood, Arvada, Westminster, Thornton, and surrounding communities. Contact us to confirm service availability for your specific location."
    },
    {
      question: "Do you provide salt/de-icing services?",
      answer: "Yes! Professional ice management is included with all our services. We use high-quality de-icing materials and can customize application based on your property's needs, environmental concerns, and local regulations."
    },
    {
      question: "Are you licensed and insured?",
      answer: "Absolutely. We are fully licensed, bonded, and insured with comprehensive liability and workers' compensation coverage. We can provide proof of insurance upon request for your peace of mind."
    },
    {
      question: "When should I sign up for winter service?",
      answer: "We recommend signing up in October or early November before the first snow. This ensures your spot is reserved and guarantees priority service. However, we accept new clients throughout the season as capacity allows."
    },
    {
      question: "What if I'm not satisfied with the service?",
      answer: "Customer satisfaction is our top priority. If you're not completely satisfied, contact us immediately and we'll return to address any concerns at no additional charge. We stand behind our work with a satisfaction guarantee."
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
