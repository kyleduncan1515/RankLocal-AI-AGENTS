// ═══════════════════════════════════════════════════════════════
//  RankLocal AI — Autonomous Agent Engine
//  Built by Eva (CTO) · Deployed on Railway · Runs 24/7
//  All 5 agents cycle daily. Subscriber content is tier-gated.
//  Database: Airtable
// ═══════════════════════════════════════════════════════════════

const Anthropic = require("@anthropic-ai/sdk");
const cron      = require("node-cron");
const http      = require("http");

// ─── CLIENTS ───────────────────────────────────────────────────
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_URL     = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

// ─── AIRTABLE HELPERS ──────────────────────────────────────────
async function airtableGet(table, filterFormula = "") {
  const url = `${AIRTABLE_URL}/${encodeURIComponent(table)}${filterFormula ? `?filterByFormula=${encodeURIComponent(filterFormula)}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const d   = await res.json();
  return d.records || [];
}

async function airtableCreate(table, fields) {
  const res = await fetch(`${AIRTABLE_URL}/${encodeURIComponent(table)}`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ fields }),
  });
  return await res.json();
}

async function airtableUpdate(table, recordId, fields) {
  const res = await fetch(`${AIRTABLE_URL}/${encodeURIComponent(table)}/${recordId}`, {
    method:  "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ fields }),
  });
  return await res.json();
}

// ─── TIER LIMITS ───────────────────────────────────────────────
const TIERS = {
  starter: {
    blogPosts: 4, gbpPosts: 8, servicePages: 1, cities: 1,
    socialCaptions: 0, newsUpdates: 1, trendAlerts: false,
    competitorIntel: false, weeklyReport: false, newsletter: false,
    label: "Starter", price: 297,
  },
  growth: {
    blogPosts: 8, gbpPosts: 16, servicePages: 4, cities: 3,
    socialCaptions: 5, newsUpdates: 4, trendAlerts: false,
    competitorIntel: false, weeklyReport: true, newsletter: true,
    label: "Growth", price: 497,
  },
  dominate: {
    blogPosts: 12, gbpPosts: 30, servicePages: 8, cities: 999,
    socialCaptions: 30, newsUpdates: 30, trendAlerts: true,
    competitorIntel: true, weeklyReport: true, newsletter: true,
    label: "Dominate", price: 797,
  },
};

// ─── NICHES ────────────────────────────────────────────────────
const NICHES = ["HVAC","Plumbing","Roofing","Electrical","Landscaping","Dental","Auto Repair","Real Estate","Law Firms"];

// ─── MODELS ────────────────────────────────────────────────────
const MODELS = {
  intelligence: "claude-sonnet-4-6",
  orchestrate:  "claude-sonnet-4-6",
  blog:         "claude-sonnet-4-6",
  gbp:          "claude-haiku-4-5-20251001",
  social:       "claude-haiku-4-5-20251001",
  news:         "claude-haiku-4-5-20251001",
  report:       "claude-sonnet-4-6",
  tasks:        "claude-sonnet-4-6",
};

// ─── LOGGING ───────────────────────────────────────────────────
const log   = (msg, level="INFO") => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().split("T")[0];
const clock = () => new Date().toLocaleTimeString();

// ─── CLAUDE CALL ───────────────────────────────────────────────
async function ask(system, user, model=MODELS.tasks, maxTok=1500, retries=3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await ai.messages.create({
        model, max_tokens: maxTok, system,
        messages: [{ role:"user", content:user }]
      });
      return res.content.map(b => b.text || "").join("");
    } catch(err) {
      log(`Claude error (attempt ${i+1}/${retries}): ${err.message}`, "WARN");
      if (i < retries - 1) await sleep(2000 * (i + 1));
      else throw err;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  STEP 1 — TOMMY: NICHE INTELLIGENCE SCAN
// ═══════════════════════════════════════════════════════════════
async function runTommyIntelligence() {
  log("Tommy: Starting niche intelligence scan for all 9 niches…");

  const prompt = `Today is ${new Date().toDateString()}.
Analyze all 9 active niches for RankLocal AI.
Niches: ${NICHES.join(", ")}

For each niche provide:
- activityScore (1-10)
- trendingTopic
- newsHook (⚠ VERIFY SOURCE)
- newsSource
- sweetSpotKeyword
- contentBrief (2 sentences)
- salesAngle
- socialCaption
- competitorInsight
- proofPoints (array of 3 with sources ⚠ VERIFY)
- assumptions (array)

Also provide:
- nicheRanking (array ranked by opportunity)
- topOpportunity (niche and reason)
- marketSummary (2 sentences)
- agentDirectives (arthur, john, eva, finn)

JSON only. No markdown.`;

  const raw  = await ask("You are Tommy, CEO of RankLocal AI. Generate validated niche intelligence. Never guarantee outcomes — always 'results may vary.'", prompt, MODELS.intelligence, 3000);
  const clean = raw.replace(/```json|```/g, "").trim();
  let intel;
  try { intel = JSON.parse(clean); }
  catch { const m = clean.match(/\{[\s\S]*\}/); intel = m ? JSON.parse(m[0]) : null; }
  if (!intel) throw new Error("Tommy intelligence parse failed");

  // Store in Airtable Daily Intelligence table
  await airtableCreate("Daily Intelligence", {
    "Date":             today(),
    "Top Niche":        intel.topOpportunity?.niche || "",
    "Market Summary":   intel.marketSummary || "",
    "Agent Directives": JSON.stringify(intel.agentDirectives || {}),
    "HVAC Brief":       JSON.stringify(intel.niches?.find(n=>n.id==="hvac") || intel.HVAC || ""),
    "Plumbing Brief":   JSON.stringify(intel.niches?.find(n=>n.id==="plumbing") || intel.Plumbing || ""),
    "Roofing Brief":    JSON.stringify(intel.niches?.find(n=>n.id==="roofing") || intel.Roofing || ""),
    "Electrical Brief": JSON.stringify(intel.niches?.find(n=>n.id==="electrical") || intel.Electrical || ""),
    "Landscaping Brief":JSON.stringify(intel.niches?.find(n=>n.id==="landscaping") || intel.Landscaping || ""),
    "Dental Brief":     JSON.stringify(intel.niches?.find(n=>n.id==="dental") || intel.Dental || ""),
    "Auto Repair Brief":JSON.stringify(intel.niches?.find(n=>n.id==="auto") || intel["Auto Repair"] || ""),
    "Real Estate Brief":JSON.stringify(intel.niches?.find(n=>n.id==="realestate") || intel["Real Estate"] || ""),
    "Law Firms Brief":  JSON.stringify(intel.niches?.find(n=>n.id==="legal") || intel["Law Firms"] || ""),
    "Assumptions":      JSON.stringify(intel.globalAssumptions || []),
    "Data Needed":      JSON.stringify(intel.dataNeeded || []),
  });

  log(`Tommy: Intelligence stored. Top: ${intel.topOpportunity?.niche?.toUpperCase()}`);
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  STEP 2 — EXECUTE AGENT TASKS
// ═══════════════════════════════════════════════════════════════
const AGENT_SYSTEMS = {
  tommy:  "You are Tommy, CEO of RankLocal AI. Every output drives revenue. Never guarantee rankings — always 'results may vary.'",
  arthur: `You are Arthur, CMO of RankLocal AI. You are not a content factory. You are a leader who uses communication as leverage. Our success depends on becoming the leaders we need to be. We have stopped running and started using leverage — specifically through high-value communication and offers. We focus on solving big problems for our market, creating content that serves people deeply, and building assets that produce income regardless of daily labor. We stay constant. We never chase. We attract. Every piece of content you create is a leverage asset. Results may vary.`,
  john:   "You are John, CSO of RankLocal AI. You sell AI SEO content to local businesses at $297/$497/$797/month. Never guarantee rankings — always 'results may vary.'",
  eva:    "You are Eva, CTO of RankLocal AI. You build and monitor automation pipelines. Target: <$0.01/doc, 99.99% uptime.",
  finn:   "You are Finn, CPO of RankLocal AI. You own subscriber experience. NPS>60, month-3 retention>80%, first content in 72hrs.",
};

async function executeAgentTasks(intel) {
  log("Executing agent tasks from intelligence directives…");
  const directives = intel.agentDirectives || {};

  for (const [agent, directive] of Object.entries(directives)) {
    if (!directive || agent === "tommy") continue;
    try {
      const output = await ask(
        AGENT_SYSTEMS[agent] || AGENT_SYSTEMS.arthur,
        `Execute today's directive for RankLocal AI.\n\nDIRECTIVE: ${directive}\n\nINTELLIGENCE: Top niche today: ${intel.topOpportunity?.niche}. ${intel.marketSummary}\n\nDeliver the actual output. Be specific. Max 200 words.`,
        MODELS.tasks, 800
      );

      await airtableCreate("Agent Outputs", {
        "Date":        today(),
        "Agent":       agent.charAt(0).toUpperCase() + agent.slice(1),
        "Task Title":  directive.slice(0, 80),
        "Task Output": output,
        "Wave":        1,
        "Status":      "Completed",
        "Niche":       intel.topOpportunity?.niche || "",
      });

      log(`✓ ${agent.toUpperCase()} task completed`);
      await sleep(500);
    } catch(err) {
      log(`✗ ${agent} task failed: ${err.message}`, "ERROR");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  STEP 3 — GENERATE SUBSCRIBER CONTENT (TIER-GATED)
// ═══════════════════════════════════════════════════════════════
async function generateSubscriberContent(sub, intel) {
  const tier      = TIERS[sub.plan?.toLowerCase()] || TIERS.starter;
  const nicheIntel = intel.niches?.find(n => n.name === sub.niche || n.id === sub.niche?.toLowerCase().replace(" ","")) || {};

  log(`Generating ${tier.label} content for ${sub["Business Name"]} (${sub.niche})…`);

  // Blog post
  try {
    const blogPost = await ask(
      AGENT_SYSTEMS.arthur,
      `Write a 900-word SEO blog post for ${sub["Business Name"]}, a ${sub.niche} company in ${sub.city || "their city"}.
Trending topic: ${nicheIntel.trendingTopic || "local service tips"}
Sweet spot keyword: "${nicheIntel.sweetSpotKeyword || sub.niche}"
News hook: ${nicheIntel.newsHook || "seasonal maintenance"}
Requirements: H1 title, 3 H2 headers, keyword used 3-4 times, CTA at end, "results may vary" near any stats.`,
      MODELS.blog, 1400
    );

    await airtableCreate("Content Queue", {
      "Content Title":  `Blog — ${nicheIntel.trendingTopic || sub.niche} — ${today()}`,
      "Content Type":   "Blog Post",
      "Content Niche":  sub.niche || "",
      "Content City":   sub.city || "",
      "Status":         "Pending Approval",
      "Body":           blogPost,
      "Due Date":       today(),
      "Content Plan":   tier.label,
    });
    log(`✓ Blog post created for ${sub["Business Name"]}`);
  } catch(err) { log(`Blog failed for ${sub["Business Name"]}: ${err.message}`, "ERROR"); }

  // GBP Posts
  try {
    const gbpRaw = await ask(
      AGENT_SYSTEMS.arthur,
      `Write 3 Google Business Profile posts for ${sub["Business Name"]} in ${sub.city || "their city"}.
News hook: ${nicheIntel.newsHook || "seasonal tips"}
Each post: 80-120 words, ends with CTA.
Format: POST 1: [content] POST 2: [content] POST 3: [content]`,
      MODELS.gbp, 600
    );

    await airtableCreate("Content Queue", {
      "Content Title":  `GBP Posts — ${sub.niche} — ${today()}`,
      "Content Type":   "GBP Post",
      "Content Niche":  sub.niche || "",
      "Content City":   sub.city || "",
      "Status":         "Pending Approval",
      "Body":           gbpRaw,
      "Due Date":       today(),
      "Content Plan":   tier.label,
    });
    log(`✓ GBP posts created for ${sub["Business Name"]}`);
  } catch(err) { log(`GBP failed for ${sub["Business Name"]}: ${err.message}`, "ERROR"); }

  // Social captions — Growth and Dominate only
  if (tier.socialCaptions > 0) {
    try {
      const social = await ask(
        AGENT_SYSTEMS.arthur,
        `Write 3 social media captions for ${sub["Business Name"]} based on: "${nicheIntel.newsHook || "industry news"}". Each 50-80 words with hashtags and CTA. Vary tone: educational, promotional, trust-building.`,
        MODELS.social, 400
      );

      await airtableCreate("Content Queue", {
        "Content Title":  `Social Captions — ${sub.niche} — ${today()}`,
        "Content Type":   "Social Caption",
        "Content Niche":  sub.niche || "",
        "Status":         "Pending Approval",
        "Body":           social,
        "Due Date":       today(),
        "Content Plan":   tier.label,
      });
    } catch(err) { log(`Social failed for ${sub["Business Name"]}: ${err.message}`, "ERROR"); }
  }

  // News update
  if (shouldSendNewsUpdate(sub.plan?.toLowerCase())) {
    try {
      const news = await ask(
        AGENT_SYSTEMS.arthur,
        `Write a 100-word industry news update for ${sub["Business Name"]} about: "${nicheIntel.newsHook || "industry developments"}". What it means for their business and what action to take. Add "⚠ verify this data before using" near any statistics.`,
        MODELS.news, 300
      );

      await airtableCreate("Content Queue", {
        "Content Title":  `Industry News — ${sub.niche} — ${today()}`,
        "Content Type":   "News Update",
        "Content Niche":  sub.niche || "",
        "Status":         "Pending Approval",
        "Body":           news,
        "Due Date":       today(),
        "Content Plan":   tier.label,
      });
    } catch(err) { log(`News failed for ${sub["Business Name"]}: ${err.message}`, "ERROR"); }
  }
}

function shouldSendNewsUpdate(plan) {
  const day = new Date().getDate();
  if (plan === "dominate") return true;
  if (plan === "growth")   return day % 7 === 1;
  if (plan === "starter")  return day === 1;
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  STEP 4 — TRACK METRICS
// ═══════════════════════════════════════════════════════════════
async function runMetricsTracking(results) {
  await airtableCreate("Metrics", {
    "Date":                     today(),
    "Content Pieces Generated": results.contentPieces,
    "API Cost":                 results.estimatedCost,
    "Notes":                    `Cycle complete. Top niche: ${results.topNiche}. Errors: ${results.errors.length}`,
  });
  log(`Metrics recorded. Cost: $${results.estimatedCost.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN DAILY CYCLE
// ═══════════════════════════════════════════════════════════════
async function runDailyCycle() {
  const start   = Date.now();
  const results = { contentPieces:0, estimatedCost:0, errors:[], topNiche:"" };

  log("═══════════════════════════════════════");
  log("RANKLOCAL AI — DAILY CYCLE STARTING");
  log(`Date: ${new Date().toDateString()} · Time: ${clock()}`);
  log("═══════════════════════════════════════");

  try {
    // Step 1: Tommy intelligence
    const intel      = await runTommyIntelligence();
    results.topNiche = intel.topOpportunity?.niche || "";
    results.estimatedCost += 0.054;

    // Step 2: Agent tasks
    await executeAgentTasks(intel);
    results.estimatedCost += 0.06;

    // Step 3: Subscriber content
    const records = await airtableGet("Subscribers", "{Status}='Active'");
    const subs    = records.length ? records.map(r => ({ id:r.id, ...r.fields })) : SAMPLE_SUBSCRIBERS;

    for (const sub of subs) {
      try {
        await generateSubscriberContent(sub, intel);
        results.contentPieces += 3;
        results.estimatedCost += 0.05;
        await sleep(1000);
      } catch(err) {
        log(`Subscriber failed: ${err.message}`, "ERROR");
        results.errors.push(err.message);
      }
    }

    // Step 4: Track metrics
    await runMetricsTracking(results);

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    log(`CYCLE COMPLETE in ${mins} min | Content: ${results.contentPieces} pieces | Cost: $${results.estimatedCost.toFixed(3)}`);

  } catch(err) {
    log(`CYCLE FAILED: ${err.message}`, "ERROR");
    await airtableCreate("Metrics", { "Date": today(), "Notes": `CYCLE FAILED: ${err.message}` });
  }
}

// ─── SAMPLE DATA FOR TESTING ───────────────────────────────────
const SAMPLE_SUBSCRIBERS = [
  { id:"s1", "Business Name":"Dallas HVAC Pro",     niche:"HVAC",      city:"Dallas, TX",   plan:"growth"   },
  { id:"s2", "Business Name":"Houston Plumbing Co", niche:"Plumbing",  city:"Houston, TX",  plan:"starter"  },
  { id:"s3", "Business Name":"Austin Roofing LLC",  niche:"Roofing",   city:"Austin, TX",   plan:"dominate" },
];

// ═══════════════════════════════════════════════════════════════
//  SCHEDULE — 7am daily
// ═══════════════════════════════════════════════════════════════
cron.schedule("0 7 * * *", () => {
  log("CRON: 7am trigger — starting daily cycle");
  runDailyCycle();
}, { timezone: "America/Chicago" });

log("Server starting. Test cycle runs in 10 seconds…");
setTimeout(runDailyCycle, 10000);

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ status:"RankLocal AI agents running", time:new Date().toISOString() }));
  } else if (req.url === "/run") {
    res.writeHead(200, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ status:"Cycle started", time:new Date().toISOString() }));
    runDailyCycle();
  } else if (req.url === "/status") {
    const records = await airtableGet("Metrics");
    res.writeHead(200, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ recent: records.slice(0,7) }));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(PORT, () => {
  log(`Health check running on port ${PORT}`);
  log("Endpoints: / (health) · /run (trigger) · /status (metrics)");
});
