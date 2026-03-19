/* ========================================
   LIVESTOCK TRACKER LANDING PAGE JS
   ======================================== */

// FEATURES DATA
const features = [
  {
    icon: "🐔",
    title: "Multi-Species Tracking",
    description: "Track chickens, ducks, and rabbits with species-specific features tailored to each animal type."
  },
  {
    icon: "🥚",
    title: "Egg Production Logging",
    description: "Quick and easy egg collection tracking with daily totals, voice input, and historical trends."
  },
  {
    icon: "🥛",
    title: "Milk Production Logging",
    description: "Track daily milk yields with fast entries, per-animal records, and historical production trends."
  },
  {
    icon: "🧬",
    title: "Breeding Records",
    description: "Track breeding pairs, planned matches, and parent history."
  },
  {
    icon: "🐣",
    title: "Incubation Tracking",
    description: "Log incubation timelines, hatch windows, and outcomes."
  },
  {
    icon: "💊",
    title: "Health Records",
    description: "Log vaccinations, treatments, weight changes, and medical history for every animal.",
    comingSoon: true
  },
  {
    icon: "💰",
    title: "Financial Tracking",
    description: "Track expenses, income, feed costs, and get insights into farm profitability."
  },
  {
    icon: "📊",
    title: "Analytics & Insights",
    description: "Visual charts and reports showing production trends, costs per egg, and flock performance."
  },
  {
    icon: "📱",
    title: "Offline-First",
    description: "Works completely offline. No internet required. Your data stays on your device."
  },
  {
    icon: "🔒",
    title: "Privacy Focused",
    description: "No account needed. Your farm data stays on your device. Minimal anonymous analytics only for app stability."
  },
  {
    icon: "☁️",
    title: "Sign in With Google/Apple",
    description: "Sign in with Google or Apple to sync your data across devices and keep secure cloud backups.",
    comingSoon: true
  },
  {
    icon: "💾",
    title: "Backup & Export",
    description: "Export your data as JSON or CSV. Create backups to your own cloud storage."
  }
];

// TUTORIALS DATA
const tutorials = [
  {
    title: "Getting Started",
    description: "Learn the basics of Livestock Tracker and add your first animals.",
    duration: "3:45"
  },
  {
    title: "Logging Egg Production",
    description: "Quick tutorial on tracking daily egg collection and viewing trends.",
    duration: "2:30"
  },
  {
    title: "Managing Breeding Records",
    description: "Track breeding pairs, incubation, and hatch records effectively.",
    duration: "4:15"
  },
  {
    title: "Health & Vaccination Tracking",
    description: "Keep comprehensive health records for your flock.",
    duration: "3:20"
  },
  {
    title: "Financial Tracking",
    description: "Log expenses, income, and understand your farm's profitability.",
    duration: "5:00"
  },
  {
    title: "Using Analytics",
    description: "Understand charts, trends, and insights to improve your farm.",
    duration: "4:30"
  }
];

// FAQ DATA
const faqs = [
  {
    question: "How much does Livestock Tracker cost?",
    answer: "Livestock Tracker is free to download and use with core features like animal tracking, egg logging, and basic health records. Premium features like advanced analytics, cloud backup, and bulk operations are available through an optional subscription."
  },
  {
    question: "Does it work offline?",
    answer: "Absolutely. Livestock Tracker is designed to work completely offline. All your data is stored locally on your device, so you don't need internet access to use any features."
  },
  {
    question: "What animals can I track?",
    answer: "Currently, you can track chickens, ducks, and rabbits. Each species has tailored features. We're planning to add more animals like goats, sheep, and pigs in future updates."
  },
  {
    question: "Can I backup my data?",
    answer: "Yes! You can export your entire database as a JSON or CSV file at any time. You control where the backup is saved—whether that's your phone, cloud storage, or computer."
  },
  {
    question: "Do I need to create an account?",
    answer: "No account required! Just download the app and start using it immediately. No email, password, or personal information needed."
  },
  {
    question: "Is my data private?",
    answer: "Your farm records stay on your device. We collect only limited technical analytics to improve app stability and performance, and optional account features may use limited personal information as described in our Privacy Policy."
  },
  {
    question: "What platforms are supported?",
    answer: "Livestock Tracker is available for iOS (13+) and Android (8+). We're working on a web version for desktop access."
  },
  {
    question: "Can I track multiple flocks or farms?",
    answer: "Yes! You can create groups and organize animals by location, breed, or any custom category you choose."
  },
  {
    question: "How do I report bugs or request features?",
    answer: "We'd love to hear from you! Email us at bugs@fennington.com for bug reports or feedback@fennington.com for feature requests."
  },
  {
    question: "Will there be more features?",
    answer: "Definitely! We're actively developing new features based on user feedback. Upcoming features include advanced breeding analytics, medication schedules, and multi-farm management."
  }
];

// POPULATE FEATURES
function populateFeatures() {
  const featuresGrid = document.getElementById('featuresGrid');
  if (!featuresGrid) return;
  
  featuresGrid.innerHTML = features.map(feature => `
    <div class="feature-card">
      <span class="feature-icon">${feature.icon}</span>
      <h3>
        ${feature.title}
        ${feature.comingSoon ? '<span class="coming-soon-badge">Coming Soon</span>' : ''}
      </h3>
      <p>${feature.description}</p>
    </div>
  `).join('');
}

// POPULATE TUTORIALS
function populateTutorials() {
  const tutorialsGrid = document.getElementById('tutorialsGrid');
  if (!tutorialsGrid) return;
  
  tutorialsGrid.innerHTML = tutorials.map(tutorial => `
    <div class="tutorial-card">
      <div class="tutorial-thumbnail">
        <div class="play-button">
          <svg viewBox="0 0 24 24">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
      </div>
      <div class="tutorial-content">
        <h3>${tutorial.title}</h3>
        <p>${tutorial.description}</p>
        <span class="tutorial-duration">⏱️ ${tutorial.duration}</span>
      </div>
    </div>
  `).join('');
}

// POPULATE FAQS
function populateFAQs() {
  const faqList = document.getElementById('faqList');
  if (!faqList) return;
  
  faqList.innerHTML = faqs.map((faq, index) => `
    <div class="faq-item" data-index="${index}">
      <div class="faq-question">
        <span>${faq.question}</span>
        <span class="faq-toggle">+</span>
      </div>
      <div class="faq-answer">
        <div class="faq-answer-content">${faq.answer}</div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', function() {
      const faqItem = this.parentElement;
      const wasActive = faqItem.classList.contains('active');
      
      // Close all FAQs
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
      });
      
      // Open clicked FAQ if it wasn't already open
      if (!wasActive) {
        faqItem.classList.add('active');
      }
    });
  });
}

// SMOOTH SCROLLING
function initSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

// MOBILE MENU TOGGLE
function initMobileMenu() {
  const toggle = document.getElementById('mobileToggle');
  const nav = document.getElementById('mainNav');
  
  if (toggle && nav) {
    toggle.addEventListener('click', function() {
      nav.classList.toggle('mobile-open');
      this.classList.toggle('active');
    });
  }
}

// STICKY HEADER
function initStickyHeader() {
  const header = document.getElementById('header');
  let lastScroll = 0;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll <= 0) {
      header.classList.remove('scroll-up');
      return;
    }
    
    if (currentScroll > lastScroll && !header.classList.contains('scroll-down')) {
      header.classList.remove('scroll-up');
      header.classList.add('scroll-down');
    } else if (currentScroll < lastScroll && header.classList.contains('scroll-down')) {
      header.classList.remove('scroll-down');
      header.classList.add('scroll-up');
    }
    
    lastScroll = currentScroll;
  });
}

// CONTACT FORM HANDLER
function initContactForm() {
  const form = document.getElementById('contactForm');
  
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value
      };
      
      // In production, you'd send this to your backend
      console.log('Form submitted:', formData);
      
      // Show success message
      alert('Thank you for your message! We\'ll get back to you soon.');
      form.reset();
    });
  }
}

// STORE BUTTONS
function initStoreButtons() {
  const appStoreBtn = document.getElementById('appStoreBtn');
  const playStoreBtn = document.getElementById('playStoreBtn');
  
  if (appStoreBtn) {
    // Live on App Store: allow normal link navigation.
    appStoreBtn.removeAttribute('aria-disabled');
  }
  
  if (playStoreBtn) {
    // Live on Google Play: allow normal link navigation.
    playStoreBtn.removeAttribute('aria-disabled');
  }
}

// INITIALIZE ALL
document.addEventListener('DOMContentLoaded', function() {
  populateFeatures();
  populateTutorials();
  populateFAQs();
  initSmoothScrolling();
  initMobileMenu();
  initStickyHeader();
  initContactForm();
  initStoreButtons();
});
