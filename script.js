/* ========================================
   FENNINGTON MAIN SITE JS
   ======================================== */

// ========== CONFIG ==========
const CONFIG = {
  businessName: "Fennington",
  email: "contact@fennington.com"
};

// ========== DOM READY ==========
document.addEventListener('DOMContentLoaded', function() {
  
  // Setup mobile menu
  setupMobileMenu();
  
  // Setup smooth scrolling
  setupSmoothScrolling();
  
  // Setup form handling
  setupFormHandling();
  
});

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
    const email = document.getElementById('email').value.trim();
    const service = document.getElementById('service').value;
    
    if (!name || !email || !service) {
      alert('Please fill in all required fields.');
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    
    const formData = new FormData(form);
    const phone = document.getElementById('phone').value.trim();
    const message = document.getElementById('message').value.trim();
    
    // Mailto fallback
    const subject = encodeURIComponent(`${CONFIG.businessName} - New Project Inquiry`);
    const body = encodeURIComponent(
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone}\n` +
      `Service: ${service}\n` +
      `Message: ${message}`
    );
    
    window.location.href = `mailto:${CONFIG.email}?subject=${subject}&body=${body}`;
    
    // Show success message
    alert('Thank you! Your message has been sent. We\'ll be in touch soon.');
    form.reset();
  });
}
