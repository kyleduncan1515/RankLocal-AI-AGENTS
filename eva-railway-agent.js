// RankLocal AI — Agent Engine v3 (Table IDs)
const Anthropic = require("@anthropic-ai/sdk");
const cron = require("node-cron");
const http = require("http");

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AIRTABLE_KEY  = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = "appl5FS9jI72auXyM";

// ─── TABLE IDs ─────────────────────────────────────────────────
const TABLES = {
  subscribers:       "tbl2taK63llf37led",
  contentQueue:      "tblJhRGX4kQFWC45y",
  dailyIntelligence: "tblYY2zZPeAu3h1Vm",
  agentOutputs:      "tbl14ONswSCjp5EFU",
  metrics:           "tblOdvg1ARhp8pszD",
  outreachLog:       "tblojTAGY0hi3TQRl",
};

const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}`;

async function saveToAirtable(tableId, fields) {
  try {
    const res = await fetch(`${AIRTABLE_URL}/${tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: [{ fields }] })
    });
    const d = await res.json();
    if (d.error) {
      log(`Airtable error in ${tableId}: ${JSON.stringify(d.error)}`, "WARN");
    }
    return d;
  } catch(err) {
    log(`Airtable save failed: ${err.message}`, "WARN");
  }
}

async function getFromAirtable(tableId, filter) {
  try {
    const url = filter
      ? `${AIRTABLE_URL}/${tableId}?filterByFormula=${encodeURIComponent(filter)}`
      : `${AIRTABLE_URL}/${tableId}`;
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

const log   = (msg, level="INFO") => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().split("T")[0];

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

const TIERS = {
  starter:  { label:"Starter",  social:false, news:false },
  growth:   { label:"Growth",   social:true,  news:true  },
  dominate: { label:"Dominate", social:true,  news:true  },
};

const SAMPLE_SUBS = [
  { "Business Name":"Dallas HVAC Pro",     niche:"HVAC",     city:"Dallas TX",  plan:"growth"   },
  { "Business Name":"Houston Plumbing Co", niche:"Plumbing", city:"Houston TX", plan:"starter"  },
  { "Business Name":"Austin Roofing LLC",  niche:"Roofing",  city:"Austin TX",  plan:"dominate" },
];

const TOMMY  = `You are Tommy, CEO of RankLocal AI. You analyze local service business markets. Never guarantee rankings. Results may vary.`;
const ARTHUR = `You are Arthur, CMO of RankLocal AI. You build high-value content assets that produce income regardless of daily labor. Every piece solves a real problem and navigates readers toward the website. Never guarantee rankings. Results may vary.`;
const JOHN   = `You are John, CSO of RankLocal AI. You sell AI SEO content to local businesses at $297/$497/$797/month. Use compelling questions to navigate prospects toward the website. Never guarantee rankings. Results may vary.`;
const EVA    = `You are Eva, CTO of RankLocal AI. You build reliable systems and keep costs below $0.01 per document.`;
const FINN   = `You are Finn, CPO of RankLocal AI. You own subscriber experience. Target: NPS over 60, month-3 retention over 80%.`;

async function runTommy() {
  log("Tommy: Running daily intelligence scan...");
  const niches = ["HVAC","Plumbing","Roofing","Electrical","Landscaping","Dental","Auto Repair","Real Estate","Law Firms"];
  const results = {};

  for (const niche of niches) {
    try {
      const intel = await ask(TOMMY,
        `In 3 sentences for ${niche} businesses today:
1. What topic is being searched most right now
2. One specific news hook or trend (add VERIFY SOURCE)
3. The best keyword to target this week
Be specific.`, 200);
      results[niche] = intel;
      await sleep(300);
    } catch(err) {
      results[niche] = `${niche} intelligence unavailable today.`;
    }
  }

  const arthurDirective = await ask(ARTHUR,
    `Based on current HVAC market trends write one specific content directive for today. 2 sentences max.`, 150);

  const johnDirective = await ask(JOHN,
    `Which trade should John focus on today and what compelling question should he open with? 2 sentences max.`, 150);

  await saveToAirtable(TABLES.dailyIntelligence, {
    "Date":             today(),
    "Top Niche":        "HVAC",
    "Market Summary":   "Daily intelligence complete. Top opportunity: HVAC.",
    "HVAC Brief":       results["HVAC"] || "",
    "Plumbing Brief":   results["Plumbing"] || "",
    "Roofing Brief":    results["Roofing"] || "",
    "Electrical Brief": results["Electrical"] || "",
    "Landscaping Brief":results["Landscaping"] || "",
    "Dental Brief":     results["Dental"] || "",
    "Auto Repair Brief":results["Auto Repair"] || "",
    "Real Estate Brief":results["Real Estate"] || "",
    "Law Firm Brief":   results["Law Firms"] || "",
    "Agent Directives": `ARTHUR: ${arthurDirective}\n\nJOHN: ${johnDirective}`,
  });

  log("Tommy: Intelligence complete.");
  return { topNiche:"HVAC", results, arthurDirective, johnDirective };
}

async function runJohn(topNiche) {
  log("John: Writing outreach scripts...");
  const scripts = await ask(JOHN,
    `Write today's LinkedIn outreach kit for ${topNiche} company owners.
1. CONNECTION REQUEST (30 words max)
2. FIRST DM (60 words max)
3. FOLLOW UP (50 words max)
4. FREE SAMPLE OFFER (60 words max)
5. CLOSE MESSAGE (50 words max)
Each message ends with a compelling question. Never guarantee rankings. Results may vary.`, 600);

  if (scripts) {
    await saveToAirtable(TABLES.agentOutputs, {
      "Date":        today(),
      "Agent":       "John",
      "Task Title":  `${topNiche} Outreach Scripts`,
      "Task Output": scripts,
      "Status":      "Completed",
      "Niche":       topNiche,
    });
    log("John: Outreach scripts saved.");
  }
}

async function runArthur(sub, intelForNiche) {
  const tier  = TIERS[sub.plan?.toLowerCase()] || TIERS.starter;
  const biz   = sub["Business Name"] || "Local Business";
  const city  = sub.city || sub["City"] || "their city";
  const niche = sub.niche || sub["Niche"] || "Home Services";

  log(`Arthur: Writing content for ${biz}...`);

  const blog = await ask(ARTHUR,
    `Write a 600-word SEO blog post for ${biz}, a ${niche} company in ${city}.
Topic: ${intelForNiche || niche + " tips for homeowners"}
- Start with an H1 title
- Use 2 H2 subheadings
- Mention ${city} naturally 3 times
- End with a call to action to contact ${biz}
- Add "results may vary" near any statistics`, 1000);

  if (blog) {
    await saveToAirtable(TABLES.contentQueue, {
      "Content Title": `Blog Post — ${niche} — ${today()}`,
      "Content Type":  "Blog Post",
      "Content Niche": niche,
      "Content City":  city,
      "Status":        "Pending Approval",
      "Body":          blog,
      "Due Date":      today(),
      "Content Plan":  tier.label,
    });
    log(`Arthur: Blog post saved for ${biz}`);
  }

  await sleep(500);

  const gbp = await ask(ARTHUR,
    `Write 3 short Google Business Profile posts for ${biz} in ${city}.
Each post: 80 words max, friendly tone, ends with call to action.
Label them POST 1: POST 2: POST 3:`, 500);

  if (gbp) {
    await saveToAirtable(TABLES.contentQueue, {
      "Content Title": `GBP Posts — ${niche} — ${today()}`,
      "Content Type":  "GBP Post",
      "Content Niche": niche,
      "Content City":  city,
      "Status":        "Pending Approval",
      "Body":          gbp,
      "Due Date":      today(),
      "Content Plan":  tier.label,
    });
    log(`Arthur: GBP posts saved for ${biz}`);
  }

  await sleep(500);

  if (tier.social) {
    const social = await ask(ARTHUR,
      `Write 3 social media captions for ${biz}.
Each: 60 words, hook first, ends with compelling question.
Topics: educational tip, customer result, seasonal offer.`, 350);

    if (social) {
      await saveToAirtable(TABLES.contentQueue, {
        "Content Title": `Social Captions — ${niche} — ${today()}`,
        "Content Type":  "Social Caption",
        "Content Niche": niche,
        "Content City":  city,
        "Status":        "Pending Approval",
        "Body":          social,
        "Due Date":      today(),
        "Content Plan":  tier.label,
      });
      log(`Arthur: Social captions saved for ${biz}`);
    }
    await sleep(500);
  }

  if (tier.news && intelForNiche) {
    const news = await ask(ARTHUR,
      `Write a 100-word industry news update for ${biz} about recent ${niche} trends.
Based on: ${intelForNiche}
What it means for their business and one action to take.
Add "verify this data before sharing" near any statistics.`, 200);

    if (news) {
      await saveToAirtable(TABLES.contentQueue, {
        "Content Title": `Industry News — ${niche} — ${today()}`,
        "Content Type":  "News Update",
        "Content Niche": niche,
        "Content City":  city,
        "Status":        "Pending Approval",
        "Body":          news,
        "Due Date":      today(),
        "Content Plan":  tier.label,
      });
      log(`Arthur: News update saved for ${biz}`);
    }
  }
}

async function runEva(contentCount, cost) {
  log("Eva: Running system check...");
  const report = await ask(EVA,
    `Write a brief system health report.
Content pieces generated: ${contentCount}
Estimated API cost: $${cost.toFixed(3)}
3 bullet points: what worked, what to watch, one optimization.`, 150);

  if (report) {
    await saveToAirtable(TABLES.agentOutputs, {
      "Date":        today(),
      "Agent":       "Eva",
      "Task Title":  "System Health Check",
      "Task Output": report,
      "Status":      "Completed",
    });
    log("Eva: System report saved.");
  }
}

async function runFinn(subCount) {
  log("Finn: Running subscriber check...");
  const report = await ask(FINN,
    `Write a brief subscriber experience note.
Active subscribers: ${subCount}
2 bullet points: what subscribers need this week and one retention tip.`, 150);

  if (report) {
    await saveToAirtable(TABLES.agentOutputs, {
      "Date":        today(),
      "Agent":       "Finn",
      "Task Title":  "Subscriber Experience Check",
      "Task Output": report,
      "Status":      "Completed",
    });
    log("Finn: Experience report saved.");
  }
}

async function runDailyCycle() {
  const start = Date.now();
  let contentCount = 0;
  let estimatedCost = 0;

  log("=========================================");
  log("RANKLOCAL AI — DAILY CYCLE STARTING");
  log(`Date: ${new Date().toDateString()}`);
  log("=========================================");

  try {
    const intel = await runTommy();
    estimatedCost += 0.04;

    await runJohn(intel.topNiche);
    estimatedCost += 0.01;
    await sleep(1000);

    const records = await getFromAirtable(TABLES.subscribers, "{Status}='Active'");
    const subs = records.length
      ? records.map(r => ({ id:r.id, ...r.fields }))
      : SAMPLE_SUBS;

    log(`Processing ${subs.length} subscribers...`);

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

    await runEva(contentCount, estimatedCost);
    estimatedCost += 0.005;

    await runFinn(subs.length);
    estimatedCost += 0.005;

    await saveToAirtable(TABLES.metrics, {
      "Date":                     today(),
      "Content Pieces Generated": contentCount,
      "API Cost":                 estimatedCost,
      "Notes":                    `Cycle complete. ${subs.length} subscribers. Top niche: ${intel.topNiche}`,
    });

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    log("=========================================");
    log(`CYCLE COMPLETE in ${mins} minutes`);
    log(`Content: ${contentCount} pieces | Cost: $${estimatedCost.toFixed(3)}`);
    log("=========================================");

  } catch(err) {
    log(`CYCLE FAILED: ${err.message}`, "ERROR");
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `CYCLE FAILED: ${err.message}`,
    });
  }
}

cron.schedule("0 7 * * *", () => {
  log("CRON: 7am — starting daily cycle");
  runDailyCycle();
}, { timezone: "America/Chicago" });

log("RankLocal AI agents starting...");
log("Test cycle begins in 5 seconds");
setTimeout(runDailyCycle, 5000);

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type":"application/json" });
  if (req.url === "/run") {
    res.end(JSON.stringify({ status:"Cycle started", time:new Date().toISOString() }));
    runDailyCycle();
  } else {
    res.end(JSON.stringify({
      status: "RankLocal AI agents running",
      time:   new Date().toISOString(),
    }));
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout   = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`Health check running on port ${PORT}`);
});

