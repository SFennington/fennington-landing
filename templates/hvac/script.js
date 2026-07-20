const CONFIG = {
  businessName: "Sample HVAC Contractor",
  nicheName: "HVAC",
  city: "Nashville",
  phone: "413-255-1777",
  email: "Contact@fennington.com",
  services: [
    { icon: "AC", title: "AC Repair", description: "Cooling diagnostics and repair for urgent no-cool calls." },
    { icon: "HT", title: "Heating Repair", description: "Furnace and heat pump repair for Nashville homeowners." },
    { icon: "IN", title: "System Installation", description: "Replacement systems, installs, and efficiency upgrades." },
    { icon: "MT", title: "Maintenance", description: "Seasonal tune-ups and service plans." },
    { icon: "EM", title: "Emergency Service", description: "Fast response for urgent HVAC issues." },
    { icon: "IAQ", title: "Indoor Air Quality", description: "Ductwork, filtration, humidity, and air quality improvements." }
  ]
};

document.addEventListener('DOMContentLoaded', function() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  CONFIG.services.forEach(service => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `<div class="service-icon">${service.icon}</div><h3>${service.title}</h3><p>${service.description}</p>`;
    grid.appendChild(card);
  });
});
