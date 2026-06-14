// ═══════════════════════════════════════════════════════════════
//  TAMMM — Totally Automated Money Making Machine
//  Rayburn Roofing · Houston TX · Kyle Duncan · 30% Commission
//  Railway Agent · Runs 24/7 · Storm Detection Every 6 Hours
//  16 Agents · Live NOAA Data · Airtable Integration
// ═══════════════════════════════════════════════════════════════

const Anthropic = require("@anthropic-ai/sdk");
const cron      = require("node-cron");
const http      = require("http");

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── AIRTABLE ──────────────────────────────────────────────────
const AIRTABLE_KEY  = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || "appl5FS9jI72auXyM";
const AIRTABLE_URL  = `https://api.airtable.com/v0/${AIRTABLE_BASE}`;

const TABLES = {
  dailyIntelligence: "tblYY2zZPeAu3h1Vm",
  contentQueue:      "tblJhRGX4kQFWC45y",
  agentOutputs:      "tbl14ONswSCjp5EFU",
  metrics:           "tblOdvg1ARhp8pszD",
  subscribers:       "tbl2taK63llf37led",
};

async function saveToAirtable(tableId, fields) {
  try {
    const res = await fetch(`${AIRTABLE_URL}/${tableId}`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ records: [{ fields }] }),
    });
    const d = await res.json();
    if (d.error) log(`Airtable error: ${JSON.stringify(d.error)}`, "WARN");
    return d;
  } catch(e) { log(`Airtable save failed: ${e.message}`, "WARN"); }
}

// ─── UTILITIES ─────────────────────────────────────────────────
const log   = (msg, level="INFO") => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().split("T")[0];
const clock = () => new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });

// ═══════════════════════════════════════════════════════════════
//  BRUCE — LIVE NOAA STORM DETECTION
// ═══════════════════════════════════════════════════════════════

const HOUSTON_COUNTIES = ["Harris","Fort Bend","Brazoria","Galveston","Montgomery","Waller","Liberty","Chambers"];
const HOUSTON_ZONES    = ["TXZ163","TXZ162","TXZ161","TXZ160","TXZ164","TXZ165","TXZ166","TXZ167","TXZ168","TXZ169"];
const HOUSTON_FIPS     = ["48201","48157","48039","48167","48339","48473","48291","48071"];

async function checkNOAAStormAlerts() {
  log("Bruce: Checking NOAA for Houston severe weather alerts...");
  try {
    const res = await fetch(
      "https://api.weather.gov/alerts/active?area=TX&status=actual&message_type=alert",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0 (contact@rayburnroofing.com)", "Accept": "application/geo+json" } }
    );
    if (!res.ok) { log(`NOAA API returned ${res.status}`, "WARN"); return null; }

    const data   = await res.json();
    const alerts = data.features || [];

    const severeTypes = [
      "Tornado Warning","Tornado Watch","Severe Thunderstorm Warning",
      "Severe Thunderstorm Watch","Flash Flood Warning","High Wind Warning",
      "Hurricane Warning","Hurricane Watch","Tropical Storm Warning",
    ];

    const houstonAlerts = alerts.filter(alert => {
      const props    = alert.properties;
      const event    = props.event || "";
      const areaDesc = props.areaDesc || "";
      const fips     = props.geocode?.SAME || [];
      const zones    = props.geocode?.UGC  || [];

      const isRelevant = severeTypes.some(t => event.includes(t)) ||
        event.toLowerCase().includes("hail") ||
        event.toLowerCase().includes("tornado") ||
        event.toLowerCase().includes("thunderstorm") ||
        event.toLowerCase().includes("hurricane");

      const isHouston = HOUSTON_COUNTIES.some(c => areaDesc.includes(c)) ||
        HOUSTON_FIPS.some(f => fips.some(fi => fi.includes(f))) ||
        HOUSTON_ZONES.some(z => zones.includes(z)) ||
        areaDesc.toLowerCase().includes("houston") ||
        areaDesc.toLowerCase().includes("harris");

      return isRelevant && isHouston;
    });

    if (houstonAlerts.length === 0) {
      log("Bruce: No active severe weather alerts for Houston area.");
      return { hasAlerts: false, alerts: [], summary: "No active severe weather alerts for Houston area." };
    }

    const formatted = houstonAlerts.map(alert => {
      const p = alert.properties;
      return {
        event:       p.event,
        headline:    p.headline,
        description: p.description?.slice(0, 500) || "",
        area:        p.areaDesc,
        severity:    p.severity,
        urgency:     p.urgency,
        onset:       p.onset,
        expires:     p.expires,
        instruction: p.instruction?.slice(0, 300) || "",
      };
    });

    const summary = formatted.map(a =>
      `⚠ ${a.event} — ${a.area} — Severity: ${a.severity} — ${a.headline}`
    ).join("\n");

    log(`Bruce: 🚨 ${houstonAlerts.length} ACTIVE ALERT(S) FOR HOUSTON!`);
    return { hasAlerts: true, count: houstonAlerts.length, alerts: formatted, summary };

  } catch(e) {
    log(`Bruce: NOAA check failed: ${e.message}`, "WARN");
    return null;
  }
}

async function getHoustonForecast() {
  log("Bruce: Fetching Houston 7-day forecast...");
  try {
    const pointRes = await fetch(
      "https://api.weather.gov/points/29.7604,-95.3698",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" } }
    );
    if (!pointRes.ok) return null;

    const pointData  = await pointRes.json();
    const forecastUrl = pointData.properties?.forecast;
    if (!forecastUrl) return null;

    const forecastRes  = await fetch(forecastUrl, { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" } });
    if (!forecastRes.ok) return null;

    const forecastData = await forecastRes.json();
    const periods      = forecastData.properties?.periods?.slice(0, 7) || [];

    const forecast = periods.map(p => ({
      name:            p.name,
      temperature:     p.temperature,
      temperatureUnit: p.temperatureUnit,
      windSpeed:       p.windSpeed,
      shortForecast:   p.shortForecast,
    }));

    const stormDays = forecast.filter(p =>
      p.shortForecast.toLowerCase().includes("storm") ||
      p.shortForecast.toLowerCase().includes("thunder") ||
      p.shortForecast.toLowerCase().includes("rain") ||
      p.shortForecast.toLowerCase().includes("shower")
    );

    log(`Bruce: Houston forecast retrieved. ${stormDays.length} storm/rain day(s) in next 7 days.`);
    return { forecast, stormDays, raw: periods.slice(0,3).map(p=>`${p.name}: ${p.shortForecast}`).join(" | ") };

  } catch(e) {
    log(`Bruce: Forecast fetch failed: ${e.message}`, "WARN");
    return null;
  }
}

async function runBruceStormCheck() {
  log("═══════════════════════════════════════");
  log("BRUCE — STORM DETECTION CYCLE STARTING");
  log(`Time: ${clock()}`);
  log("═══════════════════════════════════════");

  const [alertData, forecastData] = await Promise.all([
    checkNOAAStormAlerts(),
    getHoustonForecast(),
  ]);

  const isStormActive = alertData?.hasAlerts || false;

  let stormReport = "";

  if (isStormActive) {
    stormReport += "🚨 STORM PROTOCOL ACTIVE 🚨\n\n";
    stormReport += `ACTIVE NWS ALERTS (${alertData.count}):\n${alertData.summary}\n\n`;
    stormReport += "IMMEDIATE ACTIONS FOR KYLE:\n";
    stormReport += "1. Post Arthur's Storm Urgency Post in ALL Houston Facebook groups NOW\n";
    stormReport += "2. Send Kyle Duncan's emergency DM to all property managers immediately\n";
    stormReport += "3. Post on Nextdoor in ALL Houston area neighborhoods\n";
    stormReport += "4. Call uncle at Rayburn Roofing — prepare for inspection surge\n";
    if (alertData?.alerts?.length > 0) {
      const top = alertData.alerts[0];
      stormReport += `\nMOST URGENT: ${top.event} affecting ${top.area}\n`;
      if (top.instruction) stormReport += `NWS: ${top.instruction}\n`;
    }
  } else {
    stormReport += "✅ No active severe weather alerts for Houston area.\n\n";
  }

  if (forecastData?.raw) {
    stormReport += `HOUSTON 7-DAY FORECAST:\n${forecastData.raw}\n\n`;
    if (forecastData.stormDays?.length > 0) {
      stormReport += `UPCOMING STORM DAYS: ${forecastData.stormDays.map(d=>d.name).join(", ")}\n`;
      stormReport += "→ Begin pre-storm outreach in these neighborhoods NOW.\n";
    }
  }

  if (stormReport) {
    try {
      const bruceAnalysis = await callClaude(
        `You are Bruce, Storm Predictor for Rayburn Roofing in Houston Texas. Kyle Duncan earns 30% commission. Generate aggressive, specific, revenue-focused storm intelligence. Results may vary.`,
        `REAL NOAA HOUSTON WEATHER DATA:\n\n${stormReport}\n\nGenerate Bruce's storm intelligence brief:\n\nSTORM STATUS (label it): Current alert status with exact NOAA details.\n\nIMMEDIATE REVENUE OPPORTUNITY (label it): Dollar opportunity, neighborhoods to target, potential jobs, Kyle's 30% at $8K-$15K per job. Results may vary.\n\nPRE-STORM POSITIONING (label it): Which Houston neighborhoods Kyle works RIGHT NOW based on 7-day forecast. Specific suburb names.\n\nSTORM CONTENT TO POST NOW (label it): Exact Facebook post and LinkedIn message ready to copy and paste based on this real weather data. Under 80 words each.\n\nWEATHER OUTREACH ANGLE (label it): How Kyle uses today's specific Houston weather as a roofing conversation starter. Specific temperatures and conditions.`,
        800
      );
      stormReport += "\n\nBRUCE AI ANALYSIS:\n" + bruceAnalysis;
    } catch(e) { log(`Bruce AI analysis failed: ${e.message}`, "WARN"); }
  }

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Bruce",
    "Task Title":  `Storm Detection — ${isStormActive ? "🚨 ALERTS ACTIVE" : "All Clear"}`,
    "Task Output": stormReport,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  if (isStormActive) {
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `⚠ STORM ALERT: ${alertData?.count || 0} NWS alert(s) active for Houston. ACTIVATE STORM PROTOCOL NOW.`,
    });
  }

  log(`Bruce: Storm check complete. Active: ${isStormActive}.`);
  return { isStormActive, hasAlerts: alertData?.hasAlerts, stormReport, forecastData };
}

// ═══════════════════════════════════════════════════════════════
//  CLAUDE API
// ═══════════════════════════════════════════════════════════════

async function callClaude(system, user, maxTok=1000) {
  try {
    const res = await ai.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: maxTok,
      system,
      messages:   [{ role:"user", content:user }],
    });
    return res.content.map(b => b.text || "").join("");
  } catch(e) {
    log(`Claude error: ${e.message}`, "WARN");
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  TOMMY — DAILY INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

async function runTommy(stormData) {
  log("Tommy: Running daily Houston roofing intelligence...");

  const stormContext = stormData?.isStormActive
    ? `LIVE STORM DATA: ${stormData.stormReport?.slice(0, 500)}`
    : `Weather: ${stormData?.forecastData?.raw || "No active storm alerts for Houston"}`;

  const intel = await callClaude(
    `You are Tommy, Intelligence Officer for Rayburn Roofing in Houston Texas. Kyle Duncan earns 30% commission. You have live NOAA weather data. Generate aggressive, Houston-specific, revenue-focused intelligence. Never guarantee outcomes. Results may vary.`,
    `${stormContext}

Generate today's COMPLETE INTELLIGENCE BRIEFING:

STORM STATUS (label it): Based on live NOAA data — current Houston weather and roofing opportunities.

TOP COMMERCIAL OPPORTUNITY (label it): Single highest-value commercial target in Houston today. Specific property type, neighborhood. What Kyle does TODAY.

TOP RESIDENTIAL OPPORTUNITY (label it): Highest-volume residential opportunity. Specific Houston suburb. Why hot right now.

WEATHER WEAPONIZATION (label it): How Kyle uses today's real Houston weather as a roofing conversation starter. Specific and actionable.

PRIORITY ACTION — FIRST 60 MINUTES (label it): The 3 most important things Kyle does in his first 60 minutes. Revenue-focused. Specific.

AGENT DIRECTIVES (label it): Brief directive for Arthur, Kyle Duncan, Polly, Michael, Scout, Charlie, Curly, Finn, Peter, Wanda, Tony, Bruce.`, 1000
  );

  await saveToAirtable(TABLES.dailyIntelligence, {
    "Date":             today(),
    "Top Niche":        "Roofing",
    "Market Summary":   stormData?.isStormActive
      ? `🚨 STORM ACTIVE — ${stormData.stormReport?.slice(0,100)}`
      : `Daily intelligence complete. ${stormData?.forecastData?.raw?.slice(0,100) || ""}`,
    "Roofing Brief":    intel,
    "Agent Directives": intel.slice(0, 500),
  });

  log("Tommy: Intelligence saved to Airtable.");
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  ARTHUR — CONTENT GENERATION
//  All posts under 80 words. Hard limits for platform compliance.
// ═══════════════════════════════════════════════════════════════

async function runArthur(stormData, intel) {
  log("Arthur: Writing Houston roofing content...");

  const weatherHook = stormData?.isStormActive
    ? `URGENT: Active storm alerts in Houston. Create storm emergency content.`
    : `Weather: ${stormData?.forecastData?.forecast?.[0]?.shortForecast || "Houston summer heat and humidity"}`;

  const content = await callClaude(
    `You are Arthur, Content Director for Rayburn Roofing in Houston Texas. Kyle earns 30% commission. CRITICAL: Every single post must be under 80 words. This is a hard limit — never exceed 80 words on any post. Write content that generates roofing leads in Houston. Never guarantee outcomes. Results may vary.`,
    `${weatherHook}
Houston Intel: ${intel?.slice(0,200) || "Houston roofing market"}

Write today's COMPLETE CONTENT PACKAGE. EVERY POST MUST BE UNDER 80 WORDS — HARD LIMIT:

FACEBOOK POST (label it): Under 80 words MAXIMUM. Hyperlocal Houston hook — name a specific Houston suburb like Katy, Sugar Land, The Woodlands, Pearland, or Friendswood. Free Rayburn Roofing inspection. Sounds like a helpful neighbor not an ad. Houston Texas only.

LINKEDIN POST (label it): Under 80 words MAXIMUM. Targets Houston commercial property managers specifically. Professional tone. Free Rayburn Roofing commercial roof inspection offer. One compelling question at the end. Houston Texas only.

NEXTDOOR POST (label it): Under 60 words MAXIMUM. Trusted neighbor tone. Names a specific Houston suburb. Free Rayburn Roofing inspection. Warm and local.

TIKTOK HOOK (label it): Under 50 words MAXIMUM. First line stops scroll in 2 seconds. Houston-specific roofing tip or storm warning. Free inspection CTA.

STORM URGENCY POST (label it): Under 80 words MAXIMUM. ${stormData?.isStormActive ? "EMERGENCY — active storm alerts in Houston. Maximum urgency." : "Pre-storm awareness. Seasonal Houston angle."} Free same-day Rayburn Roofing inspection. Houston Texas only.`, 1000
  );

 // Parse individual posts from Arthur's output
  const extract = (label, text) => {
    const regex = new RegExp(`${label}[^:]*:([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  };

  // Parse individual posts into separate fields
  const extract = (label, text) => {
    const regex = new RegExp(label + '[^:]*:([\\s\\S]*?)(?=\\n[A-Z ]{3,}[^a-z]*:|$)', 'i');
    const match = text.match(regex);
    return match ? match[1].trim().slice(0, 500) : "";
  };

  await saveToAirtable(TABLES.contentQueue, {
    "Content Title":  `Houston Roofing Content — ${stormData?.isStormActive ? "🚨 STORM" : today()}`,
    "Content Type":   "Social Caption",
    "Content Niche":  "Roofing",
    "Content City":   "Houston TX",
    "Status":         "Pending Approval",
    "Body":           content,
    "LinkedIn Post":  extract("LINKEDIN POST", content),
    "Facebook Post":  extract("FACEBOOK POST", content),
    "Nextdoor Post":  extract("NEXTDOOR POST", content),
    "TikTok Hook":    extract("TIKTOK HOOK", content),
    "Storm Post":     extract("STORM POST", content),
    "Due Date":       today(),
    "Content Plan":   "Growth",
  });
 
  log("Arthur: Content saved to Airtable.");
  return content;
}

// ═══════════════════════════════════════════════════════════════
//  KYLE DUNCAN — OUTREACH SCRIPTS
// ═══════════════════════════════════════════════════════════════

async function runKyleDuncan(stormData, intel) {
  log("Kyle Duncan: Writing Houston outreach scripts...");

  const scripts = await callClaude(
    `You are Kyle Duncan, Lead Outreach Specialist for Rayburn Roofing in Houston Texas. 30% commission. Write outreach that starts conversations and books free inspections in Houston. Never guarantee outcomes. Results may vary.`,
    `${stormData?.isStormActive ? "STORM ACTIVE in Houston — lead with storm damage angle." : "Standard Houston outreach day."}
Intel: ${intel?.slice(0,200) || "Houston property managers"}

Write the COMPLETE OUTREACH KIT for Houston Texas:

CONNECTION REQUEST — PROPERTY MANAGER (label it): Under 200 chars. Personal. Rayburn Roofing Houston. Free commercial inspection.

CONNECTION REQUEST — FACILITIES MANAGER (label it): Under 200 chars. Facilities pain point. Rayburn Roofing Houston. Free inspection.

FIRST DM — PROPERTY MANAGER (label it): Under 75 words. References their Houston buildings. Free Rayburn Roofing commercial inspection. One compelling question.

FIRST DM — HOMEOWNER (label it): Under 60 words. ${stormData?.isStormActive ? "Storm damage angle." : "Specific Houston suburb."} Free Rayburn Roofing inspection.

FOLLOW UP — DAY 3 (label it): Under 55 words. Different angle. New hook. Still Houston-focused.

OBJECTION — ALREADY HAVE A ROOFER (label it): Under 65 words. Free Rayburn Roofing second opinion positioning.

FACEBOOK GROUP COMMENT (label it): Under 65 words. Natural helpful response when someone in a Houston group asks for a roofer recommendation.

${stormData?.isStormActive
  ? "STORM EMERGENCY DM (label it): Under 60 words. URGENT. Active storm in Houston. Send to all warm leads NOW."
  : "INSPECTION BOOKING CLOSE (label it): Under 80 words. Removes friction. Confirms appointment for Rayburn Roofing free inspection. Results may vary."}`, 1000
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Kyle Duncan",
    "Task Title":  `Houston Outreach Scripts — ${stormData?.isStormActive ? "STORM MODE" : today()}`,
    "Task Output": scripts,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Kyle Duncan: Outreach scripts saved.");
  return scripts;
}

// ═══════════════════════════════════════════════════════════════
//  PETER — INSURANCE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

async function runPeter(stormData) {
  log("Peter: Generating insurance claim intelligence...");

  const insurance = await callClaude(
    `You are Peter, Insurance Whisperer for Rayburn Roofing in Houston Texas. You help Houston homeowners and property managers navigate insurance claims to maximize payouts. You make Kyle indispensable. Results may vary by policy and insurer.`,
    `${stormData?.isStormActive ? "LIVE STORM ACTIVE in Houston — insurance claims will be filed immediately." : "Standard insurance intelligence day for Houston."}

Generate today's INSURANCE BRIEF for Houston Texas:

${stormData?.isStormActive
  ? `EMERGENCY CLAIM GUIDANCE (label it): Houston storm is ACTIVE right now. Exact step-by-step guidance Kyle gives Houston homeowners in the next 24 hours to document damage and file claims properly.

ADJUSTER TIMELINE (label it): How fast Houston insurance companies deploy adjusters after a storm. What homeowners do while waiting. How Kyle helps.`
  : `CLAIM ELIGIBILITY GUIDE (label it): How Kyle determines in 5 minutes if a Houston homeowner has a legitimate claim. Exact questions. Results may vary.

DOCUMENTATION CHECKLIST (label it): Exactly what the Houston homeowner photographs before the adjuster arrives. Specific shots and why each matters.`}

ADJUSTER PREPARATION SCRIPT (label it): Word-for-word coaching Kyle gives Houston homeowners before the adjuster arrives. What to say. What NOT to say.

SUPPLEMENT REQUEST GUIDE (label it): Most missed supplements in Houston roofing claims — ice shield, drip edge, code upgrades, permits, pipe boots. Dollar value of each.

KYLE VALUE PROPOSITION (label it): How Kyle positions himself as a Houston insurance advocate. The script that makes him irreplaceable. Under 80 words.`, 900
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Peter",
    "Task Title":  `Insurance Intelligence — ${stormData?.isStormActive ? "🚨 STORM CLAIMS" : today()}`,
    "Task Output": insurance,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Peter: Insurance intelligence saved.");
  return insurance;
}

// ═══════════════════════════════════════════════════════════════
//  WANDA — COMPETITOR MONITORING
// ═══════════════════════════════════════════════════════════════

async function runWanda() {
  log("Wanda: Running competitor monitoring...");

  const intel = await callClaude(
    `You are Wanda, Competitor Assassin for Rayburn Roofing in Houston Texas. Every Houston competitor failure is a Rayburn Roofing opportunity. Move fast. Be specific to Houston. Results may vary.`,
    `Generate today's COMPETITOR DOMINATION BRIEF for Houston Texas:

COMPETITOR VULNERABILITY TODAY (label it): The most exploitable weakness in Houston roofing competitors right now. Exact message Kyle sends to capture their dissatisfied Houston customers.

FACEBOOK GROUP MONITORING (label it): Exact keywords Kyle searches in Houston Facebook groups TODAY to find complaints about roofers. What to search. Exact response when found.

NEGATIVE REVIEW INTERCEPT (label it): When a Houston competitor gets a 1-3 star Google review — exactly what Kyle does in 24 hours. Full conversion script for Rayburn Roofing.

ANTI-COMPETITOR POSITIONING (label it): When a Houston prospect mentions a competitor — exactly what Kyle says. Under 75 words. Strategic. Not attacking.

FIRST MOVER PROTOCOL (label it): After any Houston competitor failure — exact steps Kyle takes in first 2 hours.`, 700
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Wanda",
    "Task Title":  `Competitor Intelligence Houston — ${today()}`,
    "Task Output": intel,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Wanda: Competitor intel saved.");
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  TONY — WEALTH BUILDING
// ═══════════════════════════════════════════════════════════════

async function runTony() {
  log("Tony: Generating wealth building brief...");

  const wealth = await callClaude(
    `You are Tony, Wealth Architect for Kyle Duncan's Rayburn Roofing referral operation in Houston Texas. Kyle earns 30% commission on every job. Turn commission into lasting wealth. Consult a tax professional and financial advisor for specific advice. Results may vary.`,
    `Generate today's WEALTH BUILDING BRIEF:

COMMISSION ALLOCATION FORMULA (label it): How Kyle splits every check — operating costs, reinvestment, tax reserve, emergency fund, wealth building, personal income. Show exact dollar amounts for a $2,400 residential commission and a $22,500 commercial commission.

CURRENT MILESTONE FOCUS (label it): Where Kyle likely is in his business right now — early stage, zero to first commission. Exactly what he does with money at this stage.

TAX REMINDER (label it): Most important tax action Kyle takes this week as a self-employed commission earner in Texas. Consult a tax professional for specific advice.

WEALTH ACTION THIS WEEK (label it): One specific wealth-building action Kyle takes this week. Practical. Actionable. Free or low cost.`, 600
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Tony",
    "Task Title":  `Wealth Building Brief — ${today()}`,
    "Task Output": wealth,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Tony: Wealth brief saved.");
  return wealth;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN DAILY CYCLE
// ═══════════════════════════════════════════════════════════════

async function runDailyCycle() {
  const start = Date.now();

  log("═══════════════════════════════════════════");
  log("TAMMM — RAYBURN ROOFING DAILY CYCLE");
  log(`Date: ${new Date().toDateString()} · ${clock()}`);
  log("═══════════════════════════════════════════");

  try {
    // Step 1: Bruce checks live NOAA storm data first
    const stormData = await runBruceStormCheck();
    await sleep(1000);

    // Step 2: Tommy intelligence (weather-aware)
    const intel = await runTommy(stormData);
    await sleep(800);

    // Step 3: Arthur content (storm-aware, under 80 words per post)
    await runArthur(stormData, intel);
    await sleep(800);

    // Step 4: Kyle Duncan outreach (storm-aware)
    await runKyleDuncan(stormData, intel);
    await sleep(800);

    // Step 5: Peter insurance (most valuable after storm)
    await runPeter(stormData);
    await sleep(600);

    // Step 6: Wanda competitor monitoring
    await runWanda();
    await sleep(600);

    // Step 7: Tony wealth building
    await runTony();
    await sleep(400);

    // Save metrics
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `TAMMM cycle complete in ${mins} min. Storm active: ${stormData?.isStormActive}. ${stormData?.isStormActive ? "⚠ STORM PROTOCOL — check Agent Outputs." : "All clear."} Agents: Tommy, Arthur, Kyle Duncan, Bruce, Peter, Wanda, Tony.`,
    });

    log("═══════════════════════════════════════════");
    log(`TAMMM CYCLE COMPLETE in ${mins} minutes`);
    log(`Storm Active: ${stormData?.isStormActive ? "🚨 YES — CHECK AIRTABLE NOW" : "✅ No"}`);
    log("═══════════════════════════════════════════");

  } catch(e) {
    log(`CYCLE FAILED: ${e.message}`, "ERROR");
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `CYCLE FAILED: ${e.message}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  STORM ONLY CHECK — Every 6 Hours
// ═══════════════════════════════════════════════════════════════

async function runStormOnlyCheck() {
  log("Bruce: 6-hour storm check triggered...");
  try {
    const stormData = await runBruceStormCheck();
    if (stormData?.isStormActive) {
      log("🚨 STORM DETECTED — Running emergency content cycle...");
      const intel = await runTommy(stormData);
      await runArthur(stormData, intel);
      await runKyleDuncan(stormData, intel);
      await runPeter(stormData);
      log("Storm emergency cycle complete. Check Airtable NOW.");
    }
  } catch(e) {
    log(`Storm check failed: ${e.message}`, "ERROR");
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCHEDULE
// ═══════════════════════════════════════════════════════════════

// Full daily cycle — 7am Central
cron.schedule("0 7 * * *", () => {
  log("CRON: 7am — starting full daily cycle");
  runDailyCycle();
}, { timezone: "America/Chicago" });

// Storm check — every 6 hours
cron.schedule("0 */6 * * *", () => {
  log("CRON: 6-hour storm check");
  runStormOnlyCheck();
}, { timezone: "America/Chicago" });

log("TAMMM Railway Agent starting...");
log("Full cycle: 7am daily · Storm check: every 6 hours");
log("Connecting to NOAA Weather API — no key required");
setTimeout(runDailyCycle, 5000);

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });

  if (req.url === "/run") {
    res.end(JSON.stringify({ status:"TAMMM cycle started", time:new Date().toISOString() }));
    runDailyCycle();
  } else if (req.url === "/storm") {
    res.end(JSON.stringify({ status:"Storm check started", time:new Date().toISOString() }));
    runStormOnlyCheck();
  } else if (req.url === "/check-storm") {
    const stormData = await runBruceStormCheck();
    res.end(JSON.stringify({
      stormActive: stormData?.isStormActive,
      alertCount:  stormData?.alerts?.length || 0,
      summary:     stormData?.summary,
      forecast:    stormData?.forecastData?.raw,
      time:        new Date().toISOString(),
    }));
  } else {
    res.end(JSON.stringify({
      status:     "TAMMM Online — Rayburn Roofing Houston",
      stormCheck: "Every 6 hours via NOAA API",
      dailyCycle: "7am Central daily",
      endpoints:  ["/run", "/storm", "/check-storm"],
      time:       new Date().toISOString(),
    }));
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout   = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`Health check server on port ${PORT}`);
  log("Endpoints: / · /run · /storm · /check-storm");
});

