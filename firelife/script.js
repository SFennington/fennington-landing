const features = [
  {
    icon: "🔥",
    title: "Guided Discipleship",
    description: "Daily beginner-friendly devotionals help new believers read Scripture, reflect, pray, and build consistent spiritual habits."
  },
  {
    icon: "📖",
    title: "Verse and Reflection",
    description: "Each day includes a focused Bible verse, simple teaching, and space to write personal reflections."
  },
  {
    icon: "🙏",
    title: "Prayer Timer",
    description: "A simple prayer timer and guided prompts help users learn how to spend intentional time with God."
  },
  {
    icon: "💬",
    title: "Prayer Requests",
    description: "Track prayer requests, mark answered prayers, and remember what God has done over time."
  },
  {
    icon: "🎵",
    title: "Worship Guidance",
    description: "Worship explanations, practical tips, and playlist links help beginners engage their heart in worship."
  },
  {
    icon: "🕊️",
    title: "Repentance Journal",
    description: "A private space for confession, repentance, Scripture, and growth without judgment or exposure."
  },
  {
    icon: "📱",
    title: "Offline-First",
    description: "Your devotional progress, reflections, and prayer requests are stored locally on your device."
  },
  {
    icon: "🔒",
    title: "Privacy Focused",
    description: "No account is required. FireLife does not sell user data or use your spiritual journal content for advertising."
  }
];

const faqs = [
  {
    question: "What is FireLife?",
    answer: "FireLife Discipleship is a mobile app designed to help new believers build simple daily rhythms of Scripture, prayer, worship, reflection, and repentance."
  },
  {
    question: "Do I need an account?",
    answer: "No. FireLife is designed for core use without an account. Your progress and entries are stored locally on your device."
  },
  {
    question: "Is my prayer or journal content private?",
    answer: "Yes. Prayer requests, reflections, repentance entries, and devotional progress are stored locally on your device and are not sold or used for advertising."
  },
  {
    question: "Does FireLife work offline?",
    answer: "Yes. Core app content and saved progress are designed to work offline once the app is installed. External worship playlist links require internet access."
  },
  {
    question: "Who is FireLife for?",
    answer: "FireLife is especially helpful for new Christians or anyone who wants a simple, structured path for daily discipleship."
  },
  {
    question: "How do I get support?",
    answer: "Email support@fennington.com with questions, feedback, bug reports, or privacy requests."
  }
];

function populateFeatures() {
  const featuresGrid = document.getElementById('featuresGrid');
  if (!featuresGrid) return;

  featuresGrid.innerHTML = features.map(feature => `
    <div class="feature-card">
      <span class="feature-icon">${feature.icon}</span>
      <h3>${feature.title}</h3>
      <p>${feature.description}</p>
    </div>
  `).join('');
}

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

  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', function() {
      const faqItem = this.parentElement;
      const wasActive = faqItem.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('active'));
      if (!wasActive) faqItem.classList.add('active');
    });
  });
}

function initSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function initMobileMenu() {
  const toggle = document.getElementById('mobileToggle');
  const nav = document.getElementById('mainNav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function() {
    nav.classList.toggle('mobile-open');
    this.classList.toggle('active');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  populateFeatures();
  populateFAQs();
  initSmoothScrolling();
  initMobileMenu();
});
