// Rayburn Roofing — Houston Lead Generation Engine
// Built by Eva · Deployed on Railway · Runs 24/7

const Anthropic = require("@anthropic-ai/sdk");
const cron = require("node-cron");
const http = require("http");

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AIRTABLE_KEY  = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = "appl5FS9jI72auXyM";

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

// ─── AGENT SYSTEM PROMPTS ──────────────────────────────────────

const TOMMY = `You are Tommy, lead intelligence officer 
for Rayburn Roofing in Houston Texas. Your job is 
to scan the Houston roofing market every morning and 
identify the highest opportunity targets for the day.

Scan for:
- Recent hail storms or severe weather in Houston area
- Neighborhoods with older roofs due for replacement
- Commercial property sales and new ownership
- HOA communities needing roof inspections
- Insurance claim activity in Houston zip codes
- Competitor gaps and weaknesses

Output every morning:
- Top opportunity for today (commercial or residential)
- Target neighborhood or property type
- News hook or weather event to use in content
- Directive for Arthur, John, Eva, and Finn

Never guarantee outcomes. Results may vary.`;

const ARTHUR = `You are Arthur, content writer for 
Rayburn Roofing in Houston Texas. You write 
social media content that generates roofing leads.

You write for these platforms daily:
- Facebook neighborhood groups in Houston
- LinkedIn targeting property managers
- Nextdoor in Houston suburbs
- Instagram and TikTok short captions

Every piece of content:
- Offers a free inspection with no obligation
- Mentions Rayburn Roofing by name
- Targets either homeowners or property managers
- Uses the weather or news hook Tommy identified
- Ends with a clear call to action to DM or comment

Never guarantee specific outcomes. Results may vary.`;

const JOHN = `You are John, lead outreach specialist 
for Rayburn Roofing in Houston Texas. You write 
LinkedIn outreach messages targeting commercial 
roofing leads.

Your targets in order of priority:
1. Commercial property managers in Houston
2. Facilities managers at Houston companies
3. HOA managers in Houston suburbs
4. Building owners and real estate investors
5. Residential homeowners in storm affected areas

Every message you write:
- References Rayburn Roofing
- Offers a free commercial or residential inspection
- Asks one compelling question
- Never guarantees outcomes
- Always says results may vary`;

const EVA = `You are Eva, systems manager for 
Rayburn Roofing lead generation operation. 
You track which platforms and content types 
generate the most roofing leads in Houston 
and report what is working and what is not 
so the team can double down on winners.`;

const FINN = `You are Finn, lead follow up manager 
for Rayburn Roofing in Houston Texas. 
You make sure every lead gets followed up 
within 24 hours. You track which leads 
converted to inspections and which 
inspections converted to closed roofing jobs. 
You flag any lead that has not been 
contacted within 24 hours.`;

// ─── SAMPLE DATA ───────────────────────────────────────────────

const SAMPLE_TARGETS = [
  { "Business Name":"Houston Commercial Properties", niche:"Roofing", city:"Houston TX", plan:"growth" },
  { "Business Name":"Gulf Coast Property Management", niche:"Roofing", city:"Houston TX", plan:"growth" },
  { "Business Name":"Bayou City Building Owners",    niche:"Roofing", city:"Houston TX", plan:"starter" },
];

// ─── TOMMY: HOUSTON ROOFING INTELLIGENCE ───────────────────────

async function runTommy() {
  log("Tommy: Scanning Houston roofing market...");

  const intel = await ask(TOMMY,
    `Scan the Houston Texas roofing market for today.

Provide:
1. TOP OPPORTUNITY: What is the single highest opportunity 
   for Rayburn Roofing today — commercial or residential? 
   Which neighborhood or property type?

2. WEATHER HOOK: Any recent or upcoming storms, hail, 
   or severe weather in Houston area worth mentioning? 
   (Add VERIFY SOURCE)

3. ARTHUR DIRECTIVE: Exactly what content should Arthur 
   write today and for which platform?

4. JOHN DIRECTIVE: Which type of prospect should John 
   target today and what angle should he use?

5. MARKET INSIGHT: One specific insight about the Houston 
   roofing market right now that Rayburn Roofing can 
   use to their advantage.

Be specific to Houston. No generic advice.`, 600);

  const arthurTask = await ask(ARTHUR,
    `Based on current Houston roofing market conditions 
write one specific Facebook post for a Houston 
neighborhood group offering a free roof inspection 
from Rayburn Roofing. 
Use a weather or seasonal hook. Under 100 words.`, 200);

  const johnTask = await ask(JOHN,
    `Write a LinkedIn connection request message 
targeting commercial property managers in Houston 
for Rayburn Roofing free commercial roof inspections. 
Under 200 characters.`, 100);

  await saveToAirtable(TABLES.dailyIntelligence, {
    "Date":             today(),
    "Top Niche":        "Roofing",
    "Market Summary":   intel || "Houston roofing market scan complete.",
    "HVAC Brief":       "",
    "Plumbing Brief":   "",
    "Roofing Brief":    intel || "",
    "Electrical Brief": "",
    "Landscaping Brief":"",
    "Dental Brief":     "",
    "Auto Repair Brief":"",
    "Real Estate Brief":"",
    "Law Firm Brief":   "",
    "Agent Directives": `ARTHUR: ${arthurTask}\n\nJOHN: ${johnTask}`,
  });

  log("Tommy: Houston intelligence complete.");
  return { intel, arthurTask, johnTask };
}

// ─── JOHN: OUTREACH SCRIPTS ────────────────────────────────────

async function runJohn(intel) {
  log("John: Writing Houston roofing outreach scripts...");

  const scripts = await ask(JOHN,
    `Write today's complete LinkedIn outreach kit 
for Rayburn Roofing targeting Houston property managers.

Based on today's intelligence: ${intel?.intel || "Houston roofing market"}

1. CONNECTION REQUEST (under 200 characters)
2. FIRST DM after connecting (60 words max)
3. FOLLOW UP if no reply after 3 days (50 words max)
4. FREE INSPECTION OFFER (60 words max)
5. CLOSE MESSAGE to book inspection (50 words max)

Every message mentions Rayburn Roofing and offers 
a free inspection. Ends with a compelling question. 
Never guarantee outcomes. Results may vary.`, 800);

  if (scripts) {
    await saveToAirtable(TABLES.agentOutputs, {
      "Date":        today(),
      "Agent":       "John",
      "Task Title":  "Houston Roofing Outreach Scripts",
      "Task Output": scripts,
      "Status":      "Completed",
      "Niche":       "Roofing",
    });
    log("John: Outreach scripts saved.");
  }
  return scripts;
}

// ─── ARTHUR: CONTENT GENERATION ────────────────────────────────

async function runArthur(intel) {
  log("Arthur: Writing Houston roofing content...");

  const fbPost = await ask(ARTHUR,
    `Write a Facebook neighborhood group post for Houston 
offering a free roof inspection from Rayburn Roofing.
Hook: ${intel?.intel?.slice(0,100) || "storm season is here"}
Under 100 words. Ends with call to action to DM or comment.`, 200);

  const linkedinPost = await ask(ARTHUR,
    `Write a LinkedIn post targeting Houston commercial 
property managers for Rayburn Roofing free commercial 
roof inspections. Professional tone. Under 150 words. 
Ends with compelling question.`, 250);

  const nextdoorPost = await ask(ARTHUR,
    `Write a Nextdoor post for a Houston neighborhood 
offering free roof inspections from Rayburn Roofing. 
Friendly neighbor tone. Under 80 words.`, 150);

  const tiktokCaption = await ask(ARTHUR,
    `Write a TikTok/Instagram caption for Rayburn Roofing 
Houston. Short, punchy, under 50 words. 
Offers free inspection. Ends with DM us today.`, 100);

  const content = `FACEBOOK POST:\n${fbPost}\n\nLINKEDIN POST:\n${linkedinPost}\n\nNEXTDOOR POST:\n${nextdoorPost}\n\nTIKTOK/INSTAGRAM:\n${tiktokCaption}`;

  await saveToAirtable(TABLES.contentQueue, {
    "Content Title": `Houston Roofing Content — ${today()}`,
    "Content Type":  "Social Caption",
    "Content Niche": "Roofing",
    "Content City":  "Houston TX",
    "Status":        "Pending Approval",
    "Body":          content,
    "Due Date":      today(),
    "Content Plan":  "Growth",
  });

  log("Arthur: Houston roofing content saved.");
  return content;
}

// ─── EVA: SYSTEM CHECK ─────────────────────────────────────────

async function runEva(contentCount, cost) {
  log("Eva: Running system check...");

  const report = await ask(EVA,
    `Write a brief system report for Rayburn Roofing 
lead generation operation.
Content pieces generated today: ${contentCount}
Estimated cost: $${cost.toFixed(3)}
3 bullet points: what worked, what to watch, 
one optimization for tomorrow.`, 150);

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

// ─── FINN: LEAD FOLLOW UP CHECK ────────────────────────────────

async function runFinn() {
  log("Finn: Running lead follow up check...");

  const report = await ask(FINN,
    `Write a brief lead follow up reminder for 
Rayburn Roofing Houston operation.
Remind Kyle to follow up on all leads within 24 hours.
Include one tip for converting a roofing inspection 
into a closed job. Under 100 words.`, 150);

  if (report) {
    await saveToAirtable(TABLES.agentOutputs, {
      "Date":        today(),
      "Agent":       "Finn",
      "Task Title":  "Lead Follow Up Check",
      "Task Output": report,
      "Status":      "Completed",
    });
    log("Finn: Follow up report saved.");
  }
}

// ─── MAIN DAILY CYCLE ──────────────────────────────────────────

async function runDailyCycle() {
  const start = Date.now();
  let contentCount = 0;
  let estimatedCost = 0;

  log("=======================================");
  log("RAYBURN ROOFING — DAILY CYCLE STARTING");
  log(`Date: ${new Date().toDateString()}`);
  log("=======================================");

  try {
    const intel = await runTommy();
    estimatedCost += 0.03;
    await sleep(1000);

    await runJohn(intel);
    estimatedCost += 0.01;
    await sleep(1000);

    await runArthur(intel);
    contentCount += 4;
    estimatedCost += 0.03;
    await sleep(1000);

    await runEva(contentCount, estimatedCost);
    estimatedCost += 0.005;
    await sleep(500);

    await runFinn();
    estimatedCost += 0.005;

    await saveToAirtable(TABLES.metrics, {
      "Date":                     today(),
      "Content Pieces Generated": contentCount,
      "API Cost":                 estimatedCost,
      "Notes":                    `Rayburn Roofing cycle complete. Houston roofing content generated.`,
    });

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    log("=======================================");
    log(`CYCLE COMPLETE in ${mins} minutes`);
    log(`Content: ${contentCount} pieces | Cost: $${estimatedCost.toFixed(3)}`);
    log("=======================================");

  } catch(err) {
    log(`CYCLE FAILED: ${err.message}`, "ERROR");
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `CYCLE FAILED: ${err.message}`,
    });
  }
}

// ─── SCHEDULE: 7AM DAILY ───────────────────────────────────────

cron.schedule("0 7 * * *", () => {
  log("CRON: 7am — starting Rayburn Roofing daily cycle");
  runDailyCycle();
}, { timezone: "America/Chicago" });

log("Rayburn Roofing agents starting...");
log("Test cycle begins in 5 seconds");
setTimeout(runDailyCycle, 5000);

// ─── HEALTH CHECK SERVER ───────────────────────────────────────

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type":"application/json" });
  if (req.url === "/run") {
    res.end(JSON.stringify({ status:"Rayburn Roofing cycle started", time:new Date().toISOString() }));
    runDailyCycle();
  } else {
    res.end(JSON.stringify({
      status: "Rayburn Roofing agents running",
      time:   new Date().toISOString(),
      next_cycle: "Daily at 7am Central"
    }));
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout   = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`Health check running on port ${PORT}`);
});
