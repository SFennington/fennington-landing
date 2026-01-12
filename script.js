/* ========================================
   BLUE-COLLAR SERVICE LANDING PAGE JS
   Easy config at top for each niche
   ======================================== */

// ========== CHANGE THIS CONFIG FOR EACH NICHE ==========
const CONFIG = {
  businessName: "Fennington Landscaping",
  nicheName: "Landscaping",
  city: "Denver",
  phone: "(720) 555-0123",
  email: "info@fenningtonlandscaping.com",
  address: "1234 Main Street, Denver, CO 80202",
  hours: "Mon-Fri: 8:00 AM - 5:00 PM<br>Sat: By Appointment<br>Sun: Closed",
  
  services: [
    {
      icon: "🌿",
      title: "Landscape Design",
      description: "Custom outdoor designs that enhance your property's beauty and functionality with expert planning."
    },
    {
      icon: "🪨",
      title: "Hardscaping",
      description: "Patios, walkways, retaining walls, and outdoor living spaces built with quality materials."
    },
    {
      icon: "🌱",
      title: "Lawn Installation",
      description: "Sod installation, seeding, and soil preparation for a lush, healthy lawn."
    },
    {
      icon: "💧",
      title: "Irrigation Systems",
      description: "Smart watering solutions that conserve water while keeping your landscape vibrant."
    },
    {
      icon: "🪴",
      title: "Planting & Gardens",
      description: "Professional plant selection, installation, and garden bed design."
    },
    {
      icon: "🔧",
      title: "Maintenance",
      description: "Regular upkeep including mowing, trimming, fertilization, and seasonal cleanups."
    },
    {
      icon: "💡",
      title: "Outdoor Lighting",
      description: "Landscape lighting design and installation to enhance curb appeal and safety."
    },
    {
      icon: "🚧",
      title: "Drainage Solutions",
      description: "French drains, grading, and erosion control to protect your property."
    }
  ],
  
  faqs: [
    {
      question: "How much does a typical landscaping project cost?",
      answer: "Project costs vary based on size, scope, and materials. Small projects like garden bed installation start around $1,500, while full landscape renovations typically range from $8,000-$25,000+. We offer free consultations and detailed written estimates so you know exactly what to expect."
    },
    {
      question: "How long will my landscaping project take?",
      answer: "Timeline depends on project complexity. Simple installations may take 1-3 days, while comprehensive landscape renovations typically take 1-3 weeks. We'll provide a clear timeline in your proposal and keep you updated throughout the process."
    },
    {
      question: "Do you offer maintenance services after installation?",
      answer: "Yes! We offer comprehensive maintenance packages including mowing, trimming, fertilization, seasonal cleanups, and system checks. Regular maintenance keeps your landscape looking its best and protects your investment."
    },
    {
      question: "Are you licensed and insured?",
      answer: "Absolutely. We are fully licensed, bonded, and insured with comprehensive liability and workers' compensation coverage. We can provide proof of insurance upon request for your peace of mind."
    },
    {
      question: "What's the best time of year for landscaping projects?",
      answer: "Spring and fall are ideal for most landscaping work due to moderate temperatures and adequate moisture. However, we work year-round and can accommodate projects in any season. Hardscaping can be done almost any time, while planting is best in spring or fall."
    },
    {
      question: "Do you provide free estimates?",
      answer: "Yes, we offer free, no-obligation consultations and written estimates. We'll visit your property, discuss your goals and budget, and provide a detailed proposal outlining the scope of work and costs."
    },
    {
      question: "Do you warranty your work?",
      answer: "Yes, we stand behind our work with comprehensive warranties. Installation workmanship is guaranteed for one year, and plant materials come with a 30-day warranty. Extended warranties are available for maintenance plan customers."
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
    
    // CHANGE: Replace with your form endpoint
    // Options:
    // 1. mailto: fallback (opens email client)
    // 2. FormSpree, Basin, or similar service
    // 3. Your own backend endpoint
    
    const formData = new FormData(form);
    const message = document.getElementById('message').value.trim();
    
    // Mailto fallback
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
    
    // UNCOMMENT for real endpoint:
    /*
    fetch('YOUR_ENDPOINT_HERE', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      alert('Thank you! Your request has been sent.');
      form.reset();
    })
    .catch(error => {
      alert('Sorry, there was an error. Please call us directly.');
    });
    */
  });
}
