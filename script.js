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
    
    // Get form data
    const phone = document.getElementById('phone').value.trim();
    const message = document.getElementById('message').value.trim();
    
    // Build email body
    const subject = `New Contact Form Submission - ${service}`;
    const body = `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\n\nMessage:\n${message}`;
    
    // Open mailto link
    window.location.href = `mailto:contact@fennington.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Reset form
    form.reset();
  });
}
