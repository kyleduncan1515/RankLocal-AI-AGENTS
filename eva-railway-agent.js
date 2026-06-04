// RankLocal AI — Agent Engine v2 (Stable)
const Anthropic = require("@anthropic-ai/sdk");
const cron = require("node-cron");
const http = require("http");

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}`;

// ─── AIRTABLE ──────────────────────────────────────────────────
async function saveToAirtable(table, fields) {
  try {
    const res = await fetch(`${AIRTABLE_URL}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });
    const d = await res.json();
    if (d.error) {
      log(`Airtable error in ${table}: ${JSON.stringify(d.error)}`, "WARN");
      log(`Fields attempted: ${JSON.stringify(Object.keys(fields))}`, "WARN");
    }
    return d;
  } catch(err) {
    log(`Airtable save failed in ${table}: ${err.message}`, "WARN");
  }
}

async function getFromAirtable(table, filter) {
  try {
    const url = filter
      ? `${AIRTABLE_URL}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(filter)}`
      : `${AIRTABLE_URL}/${encodeURIComponent(table)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` }
    });
    const d = await res.json();
    return d.records || [];
  } catch(err) {
    log(`Airtable get failed: ${err.message}`, "WARN");
    return [];
  }
}

// ─── HELPERS ───────────────────────────────────────────────────
const log   = (msg, level="INFO") => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().split("T")[0];

// ─── CLAUDE ────────────────────────────────────────────────────
async function ask(system, user, maxTok=800) {
  try {
    const res = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTok,
      system,
      messages: [{ role:"user", content:user }]
    });
    return res.content.map(b => b.text || "").join("");
  } catch(err) {
    log(`Claude error: ${err.message}`, "ERROR");
    return "";
  }
}

// ─── TIERS ─────────────────────────────────────────────────────
const TIERS = {
  starter:  { label:"Starter",  blogPosts:4,  gbpPosts:8,  social:false, news:false },
  growth:   { label:"Growth",   blogPosts:8,  gbpPosts:16, social:true,  news:true  },
  dominate: { label:"Dominate", blogPosts:12, gbpPosts:30, social:true,  news:true  },
};

const SAMPLE_SUBS = [
  { "Business Name":"Dallas HVAC Pro",     niche:"HVAC",     city:"Dallas TX",  plan:"growth"   },
  { "Business Name":"Houston Plumbing Co", niche:"Plumbing", city:"Houston TX", plan:"starter"  },
  { "Business Name":"Austin Roofing LLC",  niche:"Roofing",  city:"Austin TX",  plan:"dominate" },
];

// ─── AGENTS ────────────────────────────────────────────────────
const TOMMY = `You are Tommy, CEO of RankLocal AI. You analyze local service business markets and assign tasks. Never guarantee rankings. Results may vary.`;

const ARTHUR = `You are Arthur, CMO of RankLocal AI. You use communication as leverage. You stop running and start building high-value content assets that produce income regardless of daily labor. Every piece you write solves a real problem and navigates readers toward the website. Never guarantee rankings. Results may vary.`;

const JOHN = `You are John, CSO of RankLocal AI. You sell AI SEO content to local businesses at $297/$497/$797/month. You use compelling questions to navigate prospects toward the website. Never guarantee rankings. Results may vary.`;

const EVA = `You are Eva, CTO of RankLocal AI. You build reliable systems and keep costs below $0.01 per document.`;

const FINN = `You are Finn, CPO of RankLocal AI. You own subscriber experience. Target: NPS over 60, month-3 retention over 80%.`;

// ═══════════════════════════════════════════════════════════════
//  TOMMY — DAILY INTELLIGENCE (simple text, no JSON)
// ═══════════════════════════════════════════════════════════════
async function runTommy() {
  log("Tommy: Running daily intelligence scan…");

  const niches = ["HVAC","Plumbing","Roofing","Electrical","Landscaping","Dental","Auto Repair","Real Estate","Law Firms"];
  const results = {};

  for (const niche of niches) {
    try {
      const intel = await ask(TOMMY,
        `In 3 sentences for ${niche} businesses today:
1. What topic is being searched most right now
2. One specific news hook or trend (add VERIFY SOURCE)
3. The best keyword to target this week

Be specific. No generic advice.`, 300);

      results[niche] = intel;
      await sleep(300);
    } catch(err) {
      log(`Tommy intel failed for ${niche}: ${err.message}`, "WARN");
      results[niche] = `${niche} intelligence unavailable today.`;
    }
  }

  // Pick top niche
  const topNiche = "HVAC";

  // Arthur's directive
  const arthurDirective = await ask(ARTHUR,
    `Based on current HVAC market trends, write one specific content directive for today. What should we write about and why? 2 sentences max.`, 200);

  // John's directive
  const johnDirective = await ask(JOHN,
    `Which trade should John focus outreach on today and what compelling question should he open with? 2 sentences max.`, 200);

  // Save to Airtable
  await saveToAirtable("Daily Intelligence", {
    "Date":             today(),
    "Top Niche":        topNiche,
    "Market Summary":   `Daily intelligence scan complete. Top opportunity: ${topNiche}.`,
    "HVAC Brief":       results["HVAC"] || "",
    "Plumbing Brief":   results["Plumbing"] || "",
    "Roofing Brief":    results["Roofing"] || "",
    "Electrical Brief": results["Electrical"] || "",
    "Landscaping Brief":results["Landscaping"] || "",
    "Dental Brief":     results["Dental"] || "",
    "Auto Repair Brief":results["Auto Repair"] || "",
    "Real Estate Brief":results["Real Estate"] || "",
    "Law Firms Brief":  results["Law Firms"] || "",
    "Agent Directives": `ARTHUR: ${arthurDirective}\n\nJOHN: ${johnDirective}`,
  });

  log(`Tommy: Intelligence complete. Top niche: ${topNiche}`);
  return { topNiche, results, arthurDirective, johnDirective };
}

// ═══════════════════════════════════════════════════════════════
//  ARTHUR — CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════
async function runArthur(sub, intelForNiche) {
  const tier = TIERS[sub.plan?.toLowerCase()] || TIERS.starter;
  const biz  = sub["Business Name"] || "Local Business";
  const city = sub.city || "their city";
  const niche = sub.niche || "Home Services";

  log(`Arthur: Writing content for ${biz}…`);

  // Blog post
  const blog = await ask(ARTHUR,
    `Write a 600-word SEO blog post for ${biz}, a ${niche} company in ${city}.
Topic based on current trends: ${intelForNiche || niche + " tips for homeowners"}
Requirements:
- Start with an H1 title
- Use 2 H2 subheadings  
- Mention ${city} naturally 3 times
- End with a call to action to contact ${biz}
- Add "results may vary" near any statistics
Write it now.`, 1200);

  if (blog) {
    await saveToAirtable("Content Queue", {
      "Content Title":  `Blog Post — ${niche} — ${today()}`,
      "Content Type":   "Blog Post",
      "Content Niche":  niche,
      "Content City":   city,
      "Status":         "Pending Approval",
      "Body":           blog,
      "Due Date":       today(),
      "Content Plan":   tier.label,
    });
    log(`✓ Blog post saved for ${biz}`);
  }

  await sleep(500);

  // GBP Posts
  const gbp = await ask(ARTHUR,
    `Write 3 short Google Business Profile posts for ${biz} in ${city}.
Each post: 80 words max, friendly tone, ends with call to action.
Vary topics: seasonal tip, trust builder, free estimate offer.
Label them POST 1: POST 2: POST 3:`, 600);

  if (gbp) {
    await saveToAirtable("Content Queue", {
      "Content Title":  `GBP Posts — ${niche} — ${today()}`,
      "Content Type":   "GBP Post",
      "Content Niche":  niche,
      "Content City":   city,
      "Status":         "Pending Approval",
      "Body":           gbp,
      "Due Date":       today(),
      "Content Plan":   tier.label,
    });
    log(`✓ GBP posts saved for ${biz}`);
  }

  await sleep(500);

  // Social captions — Growth and Dominate only
  if (tier.social) {
    const social = await ask(ARTHUR,
      `Write 3 social media captions for ${biz}.
Each caption: 60 words, hook first, ends with a compelling question that navigates readers to their website.
Topics: educational tip, customer result, seasonal offer.`, 400);

    if (social) {
      await saveToAirtable("Content Queue", {
        "Content Title":  `Social Captions — ${niche} — ${today()}`,
        "Content Type":   "Social Caption",
        "Content Niche":  niche,
        "Status":         "Pending Approval",
        "Body":           social,
        "Due Date":       today(),
        "Content Plan":   tier.label,
      });
      log(`✓ Social captions saved for ${biz}`);
    }
    await sleep(500);
  }

  // News update — Growth and Dominate only
  if (tier.news && intelForNiche) {
    const news = await ask(ARTHUR,
      `Write a 100-word industry news update for ${biz} about recent ${niche} trends.
Based on: ${intelForNiche}
Explain what it means for their business and one action they should take.
Add "verify this data before sharing" near any statistics.`, 250);

    if (news) {
      await saveToAirtable("Content Queue", {
        "Content Title":  `Industry News — ${niche} — ${today()}`,
        "Content Type":   "News Update",
        "Content Niche":  niche,
        "Status":         "Pending Approval",
        "Body":           news,
        "Due Date":       today(),
        "Content Plan":   tier.label,
      });
      log(`✓ News update saved for ${biz}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  JOHN — DAILY OUTREACH SCRIPTS
// ═══════════════════════════════════════════════════════════════
async function runJohn(topNiche) {
  log("John: Writing today's outreach scripts…");

  const scripts = await ask(JOHN,
    `Write today's LinkedIn outreach kit for ${topNiche} company owners.

1. CONNECTION REQUEST (30 words max)
2. FIRST DM after connecting (60 words max)  
3. FOLLOW UP if no reply after 3 days (50 words max)
4. FREE SAMPLE OFFER (60 words max)
5. CLOSE MESSAGE with payment link placeholder (50 words max)

Each message ends with a compelling question. Never guarantee rankings. Results may vary.`, 800);

  if (scripts) {
    await saveToAirtable("Agent Outputs", {
      "Date":        today(),
      "Agent":       "John",
      "Task Title":  `${topNiche} Outreach Scripts — ${today()}`,
      "Task Output": scripts,
      "Status":      "Completed",
      "Niche":       topNiche,
    });
    log("✓ John's outreach scripts saved");
  }
}

// ═══════════════════════════════════════════════════════════════
//  EVA — SYSTEM CHECK
// ═══════════════════════════════════════════════════════════════
async function runEva(contentCount, cost) {
  log("Eva: Running system check…");

  const report = await ask(EVA,
    `Write a brief system health report for today.
Content pieces generated: ${contentCount}
Estimated API cost: $${cost.toFixed(3)}
Write 3 bullet points: what worked, what to watch, one optimization suggestion.`, 200);

  if (report) {
    await saveToAirtable("Agent Outputs", {
      "Date":        today(),
      "Agent":       "Eva",
      "Task Title":  `System Health Check — ${today()}`,
      "Task Output": report,
      "Status":      "Completed",
    });
    log("✓ Eva's system report saved");
  }
}

// ═══════════════════════════════════════════════════════════════
//  FINN — SUBSCRIBER EXPERIENCE CHECK
// ═══════════════════════════════════════════════════════════════
async function runFinn(subCount) {
  log("Finn: Running subscriber experience check…");

  const report = await ask(FINN,
    `Write a brief subscriber experience note for today.
Active subscribers: ${subCount}
Content delivered today: yes
Write 2 bullet points: what subscribers need this week and one retention tip.`, 200);

  if (report) {
    await saveToAirtable("Agent Outputs", {
      "Date":        today(),
      "Agent":       "Finn",
      "Task Title":  `Subscriber Experience Check — ${today()}`,
      "Task Output": report,
      "Status":      "Completed",
    });
    log("✓ Finn's experience report saved");
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN DAILY CYCLE
// ═══════════════════════════════════════════════════════════════
async function runDailyCycle() {
  const start = Date.now();
  let contentCount = 0;
  let estimatedCost = 0;

  log("═══════════════════════════════════════");
  log("RANKLOCAL AI — DAILY CYCLE STARTING");
  log(`Date: ${new Date().toDateString()}`);
  log("═══════════════════════════════════════");

  try {
    // Step 1: Tommy intelligence
    const intel = await runTommy();
    estimatedCost += 0.04;

    // Step 2: John outreach scripts
    await runJohn(intel.topNiche);
    estimatedCost += 0.01;
    await sleep(1000);

    // Step 3: Arthur content for each subscriber
    const records = await getFromAirtable("Subscribers", "{Status}='Active'");
    const subs = records.length
      ? records.map(r => ({ id:r.id, ...r.fields }))
      : SAMPLE_SUBS;

    log(`Processing ${subs.length} subscribers…`);

    for (const sub of subs) {
      try {
        const niche = sub.niche || sub["Niche"] || "HVAC";
        const intelForNiche = intel.results[niche] || "";
        await runArthur(sub, intelForNiche);
        contentCount += 2;
        estimatedCost += 0.04;
        await sleep(1500);
      } catch(err) {
        log(`Subscriber failed: ${err.message}`, "ERROR");
      }
    }

    // Step 4: Eva system check
    await runEva(contentCount, estimatedCost);
    estimatedCost += 0.005;

    // Step 5: Finn experience check
    await runFinn(subs.length);
    estimatedCost += 0.005;

    // Step 6: Save metrics
    await saveToAirtable("Metrics", {
      "Date":                     today(),
      "Content Pieces Generated": contentCount,
      "API Cost":                 estimatedCost,
      "Notes":                    `Cycle complete. ${subs.length} subscribers served. Top niche: ${intel.topNiche}`,
    });

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    log("═══════════════════════════════════════");
    log(`CYCLE COMPLETE in ${mins} minutes`);
    log(`Content: ${contentCount} pieces | Cost: $${estimatedCost.toFixed(3)}`);
    log("═══════════════════════════════════════");

  } catch(err) {
    log(`CYCLE FAILED: ${err.message}`, "ERROR");
    await saveToAirtable("Metrics", {
      "Date":  today(),
      "Notes": `CYCLE FAILED: ${err.message}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCHEDULE — 7am daily Central Time
// ═══════════════════════════════════════════════════════════════
cron.schedule("0 7 * * *", () => {
  log("CRON: 7am — starting daily cycle");
  runDailyCycle();
}, { timezone: "America/Chicago" });

log("RankLocal AI agents starting…");
log("Test cycle begins in 15 seconds");
setTimeout(runDailyCycle, 15000);

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type":"application/json" });
  if (req.url === "/run") {
    res.end(JSON.stringify({ status:"Cycle started", time:new Date().toISOString() }));
    runDailyCycle();
  } else {
    res.end(JSON.stringify({
      status:     "RankLocal AI agents running",
      time:       new Date().toISOString(),
      next_cycle: "Daily at 7am Central"
    }));
  }
}).listen(PORT, () => {
  log(`Health check server on port ${PORT}`);
});
