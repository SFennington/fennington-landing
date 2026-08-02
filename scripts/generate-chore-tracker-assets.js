const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const productRoot = "G:\\My Drive\\Business\\Digital Products\\Backyard Livestock Planner 1\\Attempt 2";
const sourceDir = path.join(productRoot, "final-source");
const deliverablesDir = path.join(productRoot, "final-deliverables");
const privateDir = path.join(root, "functions", "private-products", "chore-tracker");

const productName = "14-Day Homestead Chore Tracker System";
const supportEmail = "support@fennington.com";

const days = [
  [1, "Inventory every recurring chore", "Walk the homestead with paper in hand. Write every task that must happen for animals, garden, greenhouse, compost, water, fences, tools, feed, supplies, and household-adjacent homestead work. Do not organize yet; capture the full reality."],
  [2, "Sort chores by area and time of day", "Group the inventory by poultry, goats, rabbits, garden, greenhouse, compost, water systems, tools, fences, feed, supplies, and household support. Mark each chore as morning, midday, evening, weekly, seasonal, or exception-based."],
  [3, "Separate daily, weekly, seasonal, and exception tasks", "Keep true daily chores visible. Move weekly tasks to the weekly schedule. Put seasonal and exception tasks where they will not crowd the daily list but can still be reviewed."],
  [4, "Build the master chore list", "Create one clean master list with the chore, area, timing, frequency, owner, backup owner, supplies needed, and notes. This becomes the source list for every checklist."],
  [5, "Create morning and evening checklists", "Build short checklists that can be completed without rereading the entire binder. Morning focuses on water, feed, observation, release/opening tasks, and urgent exceptions. Evening focuses on feed, water, lockup, collection, security, and notes."],
  [6, "Assign responsible people and backups", "Write the primary owner and backup owner for each recurring chore. If one person does everything, still name a backup for illness, travel, bad weather, or emergency coverage."],
  [7, "Run the first full-day paper test", "Use the morning and evening checklists for one complete day. Check off work in real time, not from memory. Circle anything unclear, missing, too vague, or in the wrong order."],
  [8, "Add notes and exception tracking", "Start recording unusual events: low feed, frozen water, sick animal, broken latch, missing tool, garden pest, storm damage, late chore, or skipped chore. The log is for fixing the system, not blaming people."],
  [9, "Simplify repeated or unnecessary steps", "Remove duplicate wording, combine tasks that naturally happen together, and rewrite vague items. A checklist that is too long gets ignored; a clear checklist gets used."],
  [10, "Add weekly schedule anchors", "Assign weekly tasks to specific days or routines. Examples: deep clean poultry waterers on Saturday, check fence line Sunday afternoon, review feed inventory Wednesday evening."],
  [11, "Tighten animal and area sections", "Give each animal group or area a small reference section: normal feed/water expectations, special notes, supplies location, warning signs, and who to contact if something is wrong."],
  [12, "Review missed chores and failure points", "Look at the first eleven days and identify misses. Was the chore unclear, hidden, assigned to the wrong person, missing supplies, weather-dependent, too frequent, or not actually necessary?"],
  [13, "Finalize the repeatable routine", "Rewrite the master list, morning list, evening list, weekly schedule, assignments, and exception log using what you learned. Print clean copies for regular use."],
  [14, "Complete the maintenance plan", "Schedule a 10-minute weekly review. Replace filled sheets, update assignments, add new chores, remove stale chores, and keep the binder or clipboard where work actually happens."]
];

const worksheets = [
  ["Master Chore Inventory", ["Chore", "Area/Animal", "Frequency", "Time", "Owner", "Notes"]],
  ["Homestead Area/Animal Section Planner", ["Area or Animal Group", "Normal Routine", "Supplies Location", "Warning Signs", "Backup Instructions"]],
  ["Morning Checklist", ["Done", "Morning Task", "Owner", "Notes"]],
  ["Evening Checklist", ["Done", "Evening Task", "Owner", "Notes"]],
  ["Daily Chore Tracker", ["Done", "Task", "Owner", "Time", "Exception or Follow-Up"]],
  ["Weekly Schedule", ["Day", "Weekly Anchor Tasks", "Owner", "Supplies", "Notes"]],
  ["Task Assignment and Backups", ["Task", "Primary Owner", "Backup Owner", "When Backup Takes Over", "Notes"]],
  ["Missed Chore and Exception Log", ["Date", "Missed/Exception Item", "Cause", "Fix for Next Time", "Owner"]],
  ["14-Day Review Worksheet", ["Question", "Answer / Decision"]],
  ["Ongoing Weekly Review", ["Week Of", "What Worked", "What Failed", "Updates Needed", "Next Review"]]
];

const sections = [
  ["Start Here", "This workbook helps you build, test, and refine a paper-based homestead chore routine in 14 days. You can complete the system with a binder, clipboard, pen, printed worksheets, and a consistent place to keep the routine visible."],
  ["What To Set Up Before Day 1", "Print the master chore inventory, area planner, morning checklist, evening checklist, daily tracker, weekly schedule, assignment sheet, exception log, and review sheets. Put active pages on a clipboard or in a binder. Keep blank reusable pages behind the active checklist."],
  ["How The Paper System Works", "The master chore list is the source of truth. The morning and evening checklists are the daily action pages. The daily tracker records completion, owners, notes, and exceptions. The weekly review keeps the system current after the first 14 days."],
  ["Optional Digital Alternative", "Prefer to manage animal records and farm logs digitally? Livestock Tracker can help with animal groups, production records, breeding/incubation tracking, financial records, reminders, backups, and day-to-day livestock information. The app is optional; this paper system stands on its own."],
  ["Examples To Consider", "Poultry: feed, water, egg collection, bedding, ventilation, predator check. Goats: hay, minerals, water, fence, body condition, hooves. Rabbits: feed, water bottles, nest boxes, heat/cold checks. Garden and greenhouse: watering, harvest, pests, starts, compost, tools, seed trays. Homestead systems: fences, gates, feed inventory, water lines, batteries, fuel, trash, and supply runs."],
  ["Ongoing Maintenance", "After Day 14, spend 10 minutes once a week replacing filled pages, checking missed chores, updating assignments, and moving any seasonal work onto the weekly schedule. A simple system that gets reviewed is better than a perfect binder that never gets opened."]
];

function ensureDirs() {
  [sourceDir, deliverablesDir, privateDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function writeSources() {
  const dayHtml = days.map(([day, title, copy]) => `<article class="day-card"><p class="eyebrow">Day ${day}</p><h3>${htmlEscape(title)}</h3><p>${htmlEscape(copy)}</p><div class="write-lines"><span></span><span></span><span></span></div></article>`).join("\n");
  const worksheetHtml = worksheets.map(([title, cols]) => `<section class="worksheet page-break"><h2>${htmlEscape(title)}</h2><table><thead><tr>${cols.map((col) => `<th>${htmlEscape(col)}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: 10 }, () => `<tr>${cols.map(() => "<td>&nbsp;</td>").join("")}</tr>`).join("")}</tbody></table><p class="notes-label">Notes</p><div class="notes-box"></div></section>`).join("\n");
  const sourceNote = `<section class="review-note page-break"><h2>Internal Product Review Notes</h2><ul><li>Original DOCX files and cover image were preserved unchanged.</li><li>The broad homestead blueprint was rebuilt into a complete paper-based 14-day chore routine.</li><li>Unsupported vault, Airtable, Notion, calendar sync, fake urgency, and high-anchor claims were not used.</li><li>Livestock Tracker is mentioned only as an optional digital alternative with verified capabilities.</li></ul></section>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${productName}</title><link rel="stylesheet" href="14-day-homestead-chore-tracker-system.css"></head><body><main><section class="cover"><p class="kicker">Fennington Homestead System</p><h1>${productName}</h1><p class="promise">Build, test, and refine a practical paper-based homestead chore routine in 14 days.</p><p class="meta">Screen and print master source. Support: ${supportEmail}</p></section>${sections.map(([title, copy]) => `<section><h2>${htmlEscape(title)}</h2><p>${htmlEscape(copy)}</p></section>`).join("\n")}<section class="page-break"><h2>The 14-Day Build</h2><div class="day-grid">${dayHtml}</div></section><section class="page-break"><h2>Reusable Worksheets</h2><p>Print these pages as needed. Keep active pages on a clipboard or in a binder where chores are actually done.</p></section>${worksheetHtml}${sourceNote}</main></body></html>`;
  const css = `@page{size:letter;margin:.65in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#213427;background:#f7f3e8;line-height:1.5}main{max-width:900px;margin:0 auto;background:#fff;box-shadow:0 18px 50px rgba(35,52,39,.18)}section{padding:42px 52px;border-bottom:1px solid #dfd7c4}.cover{min-height:720px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#1f5f3b,#6b8e45);color:#fff}.kicker,.eyebrow{letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-size:12px}.cover h1{font-size:58px;line-height:1;margin:18px 0}.promise{font-size:23px;max-width:720px}.meta{margin-top:60px;color:#eef6e8}h2{font-size:30px;color:#1f5f3b;margin:0 0 12px}h3{margin:0 0 8px;color:#203324}.day-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.day-card{border:1px solid #d7cbae;border-radius:14px;padding:18px;background:#fffdf7}.write-lines span{display:block;height:24px;border-bottom:1px solid #d7cbae}table{width:100%;border-collapse:collapse;page-break-inside:auto}th,td{border:1px solid #b9ad94;padding:8px;vertical-align:top}th{background:#e8f0df;color:#203324;text-align:left}td{height:44px}.notes-label{font-weight:700;margin:18px 0 8px}.notes-box{height:110px;border:1px solid #b9ad94;background:repeating-linear-gradient(#fff,#fff 27px,#e7dfcf 28px)}.page-break{break-before:page}.review-note{background:#f9fbf7}@media print{body{background:#fff}main{box-shadow:none;max-width:none}section{break-inside:avoid}.day-card{break-inside:avoid}}`;
  const worksheetsHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${productName} Worksheets</title><link rel="stylesheet" href="14-day-homestead-chore-tracker-system.css"></head><body><main><section class="cover"><p class="kicker">Reusable Printable Pack</p><h1>${productName}</h1><p class="promise">Blank worksheets for daily use after the 14-day setup.</p></section>${worksheetHtml}</main></body></html>`;
  fs.writeFileSync(path.join(sourceDir, "14-day-homestead-chore-tracker-system.html"), html);
  fs.writeFileSync(path.join(sourceDir, "14-day-homestead-chore-tracker-system.css"), css);
  fs.writeFileSync(path.join(sourceDir, "worksheets.html"), worksheetsHtml);
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function makePdf(filename, pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  for (const content of pages) {
    const streamId = add(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${streamId} 0 R >>`));
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (const id of pageIds) objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const target = path.join(deliverablesDir, filename);
  fs.writeFileSync(target, pdf, "binary");
  fs.copyFileSync(target, path.join(privateDir, filename));
}

function textPage(title, lines, options = {}) {
  let y = 736;
  const out = [];
  const titleSize = options.titleSize || 24;
  out.push(`BT /F2 ${titleSize} Tf 54 ${y} Td (${pdfEscape(title)}) Tj ET`);
  y -= titleSize + 18;
  for (const raw of lines) {
    const parts = wrapText(raw, options.maxChars || 82);
    for (const line of parts) {
      if (y < 64) break;
      out.push(`BT /F1 11 Tf 54 ${y} Td (${pdfEscape(line)}) Tj ET`);
      y -= 16;
    }
    y -= 8;
  }
  return out.join("\n");
}

function worksheetPage(title, cols) {
  const out = [`BT /F2 22 Tf 54 742 Td (${pdfEscape(title)}) Tj ET`];
  const x = 42;
  let y = 690;
  const width = 528;
  const rowH = 42;
  const colW = width / cols.length;
  out.push(`${x} ${y} ${width} 28 re S`);
  cols.forEach((col, i) => {
    out.push(`BT /F2 8 Tf ${x + i * colW + 5} ${y + 10} Td (${pdfEscape(col)}) Tj ET`);
    if (i > 0) out.push(`${x + i * colW} ${y} 0 28 m ${x + i * colW} ${y + 28} l S`);
  });
  y -= rowH;
  for (let r = 0; r < 10; r += 1) {
    out.push(`${x} ${y} ${width} ${rowH} re S`);
    cols.forEach((_col, i) => {
      if (i > 0) out.push(`${x + i * colW} ${y} 0 ${rowH} m ${x + i * colW} ${y + rowH} l S`);
      if (i === 0 && /done/i.test(cols[0])) out.push(`${x + 8} ${y + 14} 12 12 re S`);
    });
    y -= rowH;
  }
  out.push(`BT /F2 10 Tf 54 ${y - 8} Td (Notes) Tj ET`);
  for (let i = 0; i < 4; i += 1) out.push(`54 ${y - 34 - i * 22} 504 0 m 558 ${y - 34 - i * 22} l S`);
  return out.join("\n");
}

function writePdfs() {
  const introPages = [
    textPage(productName, ["Build, test, and refine a practical paper-based homestead chore routine in 14 days.", "This product is complete without an app. Use a binder or clipboard, printed checklists, daily tracker pages, and a weekly review rhythm."], { titleSize: 30, maxChars: 74 }),
    ...sections.map(([title, copy]) => textPage(title, [copy], { maxChars: 86 })),
    ...days.map(([day, title, copy]) => textPage(`Day ${day}: ${title}`, [copy, "Today's notes:", "________________________________________________________________", "________________________________________________________________", "________________________________________________________________"], { maxChars: 82 }))
  ];
  makePdf("14-Day-Homestead-Chore-Tracker-System-screen.pdf", introPages.concat(worksheets.map(([title, cols]) => worksheetPage(title, cols))));
  makePdf("14-Day-Homestead-Chore-Tracker-System-print.pdf", introPages.concat(worksheets.map(([title, cols]) => worksheetPage(title, cols))));
  makePdf("Reusable-Chore-Tracker-Worksheets.pdf", [textPage("Reusable Chore Tracker Worksheets", ["Print these blank pages as needed for ongoing daily and weekly use."], { titleSize: 28 })].concat(worksheets.map(([title, cols]) => worksheetPage(title, cols))));
}

ensureDirs();
writeSources();
writePdfs();
console.log(`Generated chore tracker source files in ${sourceDir}`);
console.log(`Generated chore tracker PDFs in ${deliverablesDir}`);
console.log(`Copied private fulfillment PDFs to ${privateDir}`);
