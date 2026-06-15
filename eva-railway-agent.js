// ═══════════════════════════════════════════════════════════════
//  TAMMM — Totally Automated Money Making Machine
//  Rayburn Roofing · Houston TX · Kyle Duncan · 30% Commission
//  Railway Agent · Runs 24/7 · Storm Detection Every 6 Hours
//  UPGRADES: Run Lock · Dupe Prevention · Hunter Agent ·
//  Storm History · ZIP Ranking · Daily Report · Context Sharing ·
//  Peter Insurance Upgrade · Houston Market Pulse · Response Learning
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

// ─── UTILITIES ─────────────────────────────────────────────────
const log   = (msg, level="INFO") => console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().split("T")[0];
const clock = () => new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 1 — AGENT RUN LOCK
//  Prevents duplicate cycles from cron + manual /run overlap.
//  One cycle at a time. Period.
// ═══════════════════════════════════════════════════════════════

let cycleRunning  = false;
let cycleType     = "";
let cycleStart    = null;

function acquireLock(type) {
  if (cycleRunning) {
    log(`LOCK: ${type} blocked — ${cycleType} already running since ${cycleStart}`, "WARN");
    return false;
  }
  cycleRunning = true;
  cycleType    = type;
  cycleStart   = clock();
  log(`LOCK: ${type} acquired at ${cycleStart}`);
  return true;
}

function releaseLock() {
  log(`LOCK: ${cycleType} released at ${clock()}`);
  cycleRunning = false;
  cycleType    = "";
  cycleStart   = null;
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 2 — DUPLICATE ALERT PREVENTION
//  Tracks processed NOAA alert IDs so Bruce doesn't fire
//  emergency content 4 times on the same storm.
// ═══════════════════════════════════════════════════════════════

const processedAlerts = new Set();
const alertHistory    = []; // {id, event, area, processedAt}

function isAlertProcessed(alertId) {
  return processedAlerts.has(alertId);
}

function markAlertProcessed(alertId, event, area) {
  processedAlerts.add(alertId);
  alertHistory.push({ id:alertId, event, area, processedAt:new Date().toISOString() });
  // Keep only last 100 alerts in memory
  if (alertHistory.length > 100) alertHistory.shift();
  log(`Bruce: Alert ${alertId} marked as processed — ${event} · ${area}`);
}

// Clean processed alerts older than 48 hours (alerts expire)
function cleanOldAlerts() {
  const cutoff = Date.now() - (48 * 60 * 60 * 1000);
  const toRemove = alertHistory.filter(a => new Date(a.processedAt).getTime() < cutoff);
  toRemove.forEach(a => processedAlerts.delete(a.id));
  if (toRemove.length > 0) log(`Bruce: Cleaned ${toRemove.length} expired alert IDs`);
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 4 — STORM HISTORY DATABASE
//  Every storm gets logged to Airtable.
//  After 6 months TAMMM knows which storms generate revenue.
// ═══════════════════════════════════════════════════════════════

async function logStormHistory(alerts, forecastData) {
  for (const alert of alerts) {
    try {
      await saveToAirtable(TABLES.agentOutputs, {
        "Date":        today(),
        "Agent":       "Bruce",
        "Task Title":  `STORM LOG: ${alert.event} — ${alert.area}`,
        "Task Output": `Event: ${alert.event}\nArea: ${alert.area}\nSeverity: ${alert.severity}\nUrgency: ${alert.urgency}\nHeadline: ${alert.headline}\nOnset: ${alert.onset}\nExpires: ${alert.expires}\nForecast: ${forecastData?.raw || "N/A"}\nLogged: ${new Date().toISOString()}`,
        "Status":      "Storm Log",
        "Niche":       "Roofing",
      });
    } catch(e) { log(`Storm history log failed: ${e.message}`, "WARN"); }
  }
}

// ═══════════════════════════════════════════════════════════════
//  AIRTABLE HELPERS
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  CLAUDE API — Haiku for agents, Sonnet for intel
// ═══════════════════════════════════════════════════════════════

async function callClaude(system, user, maxTok=800, useSonnet=false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const model = useSonnet ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
    const res = await ai.messages.create({
      model,
      max_tokens: maxTok,
      system,
      messages: [{ role:"user", content:user }],
    });
    clearTimeout(timeout);
    return res.content.map(b => b.text || "").join("");
  } catch(e) {
    clearTimeout(timeout);
    log(`Claude error: ${e.message}`, "WARN");
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════
//  HOUSTON CONSTANTS
// ═══════════════════════════════════════════════════════════════

const HOUSTON_COUNTIES = ["Harris","Fort Bend","Brazoria","Galveston","Montgomery","Waller","Liberty","Chambers"];
const HOUSTON_ZONES    = ["TXZ163","TXZ162","TXZ161","TXZ160","TXZ164","TXZ165","TXZ166","TXZ167","TXZ168","TXZ169"];
const HOUSTON_FIPS     = ["48201","48157","48039","48167","48339","48473","48291","48071"];

const HOUSTON_ZIPS = {
  "Katy":          ["77449","77450","77494"],
  "Sugar Land":    ["77478","77479","77498"],
  "The Woodlands": ["77380","77381","77382","77384","77385","77386","77389"],
  "Pearland":      ["77581","77584","77588"],
  "Friendswood":   ["77546","77549"],
  "Cypress":       ["77429","77433","77447"],
  "League City":   ["77573","77574"],
  "Humble":        ["77338","77347","77396"],
  "Baytown":       ["77520","77521","77522","77523"],
  "Spring":        ["77373","77379","77388"],
  "Katy Lakes":    ["77494"],
  "Kingwood":      ["77339","77345","77346","77365"],
  "Pasadena":      ["77501","77502","77503","77504","77505","77506","77507","77508"],
  "Conroe":        ["77301","77302","77303","77304","77305","77306"],
};

// ═══════════════════════════════════════════════════════════════
//  BRUCE — LIVE NOAA STORM DETECTION + ZIP RANKING
// ═══════════════════════════════════════════════════════════════

async function checkNOAAStormAlerts() {
  log("Bruce: Checking NOAA for Houston severe weather alerts...");
  try {
    const res = await fetch(
      "https://api.weather.gov/alerts/active?area=TX&status=actual&message_type=alert",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" } }
    );
    if (!res.ok) { log(`NOAA API ${res.status}`, "WARN"); return null; }

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
      return { hasAlerts:false, alerts:[], summary:"No active severe weather alerts for Houston area." };
    }

    const formatted = houstonAlerts.map(alert => {
      const p = alert.properties;
      return {
        id:          alert.id || p.id || `${p.event}-${p.onset}`,
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

    // UPGRADE 2: Filter out already-processed alerts
    const newAlerts = formatted.filter(a => !isAlertProcessed(a.id));
    const dupCount  = formatted.length - newAlerts.length;
    if (dupCount > 0) log(`Bruce: Skipping ${dupCount} already-processed alert(s) — saving API calls`);

    const summary = formatted.map(a =>
      `⚠ ${a.event} — ${a.area} — ${a.severity} — ${a.headline}`
    ).join("\n");

    log(`Bruce: ${houstonAlerts.length} alert(s) found. ${newAlerts.length} new.`);
    return {
      hasAlerts:   true,
      hasNewAlerts: newAlerts.length > 0,
      count:       houstonAlerts.length,
      newCount:    newAlerts.length,
      alerts:      formatted,
      newAlerts,
      summary,
    };

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
      { headers: { "User-Agent":"TAMMM-RayburnRoofing/1.0", "Accept":"application/geo+json" } }
    );
    if (!pointRes.ok) return null;

    const pointData   = await pointRes.json();
    const forecastUrl = pointData.properties?.forecast;
    if (!forecastUrl) return null;

    const forecastRes  = await fetch(forecastUrl, { headers: { "User-Agent":"TAMMM-RayburnRoofing/1.0" } });
    if (!forecastRes.ok) return null;

    const forecastData = await forecastRes.json();
    const periods      = forecastData.properties?.periods?.slice(0, 7) || [];

    const forecast = periods.map(p => ({
      name:          p.name,
      temperature:   p.temperature,
      windSpeed:     p.windSpeed,
      shortForecast: p.shortForecast,
    }));

    const stormDays = forecast.filter(p =>
      p.shortForecast.toLowerCase().includes("storm") ||
      p.shortForecast.toLowerCase().includes("thunder") ||
      p.shortForecast.toLowerCase().includes("rain")
    );

    log(`Bruce: Forecast retrieved. ${stormDays.length} storm/rain day(s) ahead.`);
    return { forecast, stormDays, raw: periods.slice(0,3).map(p=>`${p.name}: ${p.shortForecast}`).join(" | ") };

  } catch(e) {
    log(`Bruce: Forecast failed: ${e.message}`, "WARN");
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 5 — ZIP CODE TARGET RANKING
//  Converts "Houston got a storm" into a ranked target list.
//  Every agent focuses on these ZIPs in priority order.
// ═══════════════════════════════════════════════════════════════

function rankHoustonZIPs(alertData, forecastData) {
  const scores = {};

  // Score based on alert mentions
  if (alertData?.alerts) {
    for (const alert of alertData.alerts) {
      const area = (alert.area + " " + alert.description).toLowerCase();
      for (const [suburb, zips] of Object.entries(HOUSTON_ZIPS)) {
        if (area.includes(suburb.toLowerCase())) {
          scores[suburb] = (scores[suburb] || 0) + 40;
          if (alert.event?.toLowerCase().includes("hail"))     scores[suburb] += 30;
          if (alert.severity === "Extreme")                    scores[suburb] += 20;
          if (alert.severity === "Severe")                     scores[suburb] += 10;
        }
      }
    }
  }

  // Score based on storm forecast days
  if (forecastData?.stormDays?.length > 0) {
    for (const [suburb] of Object.entries(HOUSTON_ZIPS)) {
      scores[suburb] = (scores[suburb] || 0) + (forecastData.stormDays.length * 5);
    }
  }

  // Sort by score descending
  const ranked = Object.entries(scores)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)
    .map(([suburb, score], idx) => ({
      rank: idx + 1,
      suburb,
      score,
      zips: HOUSTON_ZIPS[suburb] || [],
    }));

  if (ranked.length === 0) {
    // Default ranking when no storm — based on commercial density
    return [
      { rank:1, suburb:"The Woodlands", score:50, zips:HOUSTON_ZIPS["The Woodlands"] },
      { rank:2, suburb:"Katy",          score:45, zips:HOUSTON_ZIPS["Katy"] },
      { rank:3, suburb:"Sugar Land",    score:40, zips:HOUSTON_ZIPS["Sugar Land"] },
      { rank:4, suburb:"Pearland",      score:35, zips:HOUSTON_ZIPS["Pearland"] },
      { rank:5, suburb:"Cypress",       score:30, zips:HOUSTON_ZIPS["Cypress"] },
    ];
  }

  return ranked;
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 3 — HUNTER AGENT
//  Builds actual prospect lists from storm-affected ZIP codes.
//  The missing piece between detecting opportunity and revenue.
// ═══════════════════════════════════════════════════════════════

async function runHunter(rankedZIPs, stormData) {
  log("Hunter: Building prospect lists for top ZIP codes...");

  const topZIPs = rankedZIPs.slice(0, 3);
  const isStorm = stormData?.isStormActive;

  const prospectLists = await callClaude(
    `You are Hunter, Lead Prospector for Rayburn Roofing in Houston Texas. Kyle Duncan earns 30% commission. Your job is to build actual prospect lists — real business types with real contact strategies. Be specific to Houston Texas. Results may vary.`,
    `TOP TARGET ZONES TODAY (ranked by opportunity):
${topZIPs.map(z => `${z.rank}. ${z.suburb} — ZIPs: ${z.zips.join(", ")} — Score: ${z.score}`).join("\n")}

Storm active: ${isStorm ? "YES — emergency outreach mode" : "No — standard outreach"}

Generate COMPLETE PROSPECT HUNTING BRIEF:

APARTMENT COMPLEXES TO TARGET (label it): In ${topZIPs[0]?.suburb} and ${topZIPs[1]?.suburb} — types of apartment complexes to search for on Google Maps. Search strings to use. What to look for on their websites to find property manager contact info. Expected response rate for roofing inspections.

HOA COMMUNITIES TO TARGET (label it): HOA communities in ${topZIPs.map(z=>z.suburb).join(", ")} — how to find HOA managers. What databases are free. What to say in first contact. Why HOA managers are worth 50+ roofs in one relationship.

COMMERCIAL STRIP CENTERS (label it): Strip malls and commercial centers in these ZIP codes: ${topZIPs.flatMap(z=>z.zips).join(", ")}. Google Maps search terms. How to find the property owner vs the tenant. Who makes the roofing decision.

CHURCHES AND INSTITUTIONS (label it): Large churches, schools, and community centers in ${topZIPs[0]?.suburb} and ${topZIPs[1]?.suburb}. Why they are underserved by roofing companies. How to approach facilities managers. Free inspection angle.

GOOGLE MAPS SEARCH STRINGS (label it): Copy-paste ready search strings Kyle uses RIGHT NOW to find prospects in these ZIP codes. One per line. Minimum 10 search strings.

IMMEDIATE OUTREACH PRIORITY (label it): Based on storm status — which prospect TYPE Kyle contacts first today and exactly what he says in the first message. Under 60 words. Ready to copy.`,
    900
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Hunter",
    "Task Title":  `Prospect Lists — ${topZIPs.map(z=>z.suburb).join(", ")} — ${isStorm ? "STORM MODE" : today()}`,
    "Task Output": `ZIP RANKINGS:\n${rankedZIPs.map(z=>`${z.rank}. ${z.suburb} (Score: ${z.score})`).join("\n")}\n\n${prospectLists}`,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Hunter: Prospect lists saved to Airtable.");
  return prospectLists;
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 7 (IDEA 2) — HOUSTON MARKET PULSE
//  Scans free public RSS feeds every Monday morning.
//  Tommy reads real Houston news before generating intel.
// ═══════════════════════════════════════════════════════════════

async function fetchHoustonMarketPulse() {
  log("Market Pulse: Scanning Houston RSS feeds...");
  const feeds = [
    "https://www.chron.com/news/houston-texas/rss/",
    "https://www.bizjournals.com/houston/stories.rss",
    "https://www.houstonchronicle.com/local/news/feed/",
  ];

  const results = [];

  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0" },
        signal:  AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();

      // Extract headlines from RSS
      const titles   = [...text.matchAll(/<title>(.*?)<\/title>/g)].slice(1, 8).map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g,"").trim());
      const keywords = ["storm","roof","hail","construction","commercial","property","building","HOA","flood","hurricane"];
      const relevant = titles.filter(t => keywords.some(k => t.toLowerCase().includes(k)));

      if (relevant.length > 0) results.push(...relevant);
    } catch(e) {
      log(`Market Pulse: Feed failed — ${url} — ${e.message}`, "WARN");
    }
  }

  if (results.length === 0) {
    log("Market Pulse: No relevant headlines found from RSS feeds.");
    return null;
  }

  log(`Market Pulse: ${results.length} relevant Houston headlines found.`);
  return results.slice(0, 10).join("\n");
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 5 — DOWNSTREAM CONTEXT SHARING
//  Tommy runs first and builds a shared context object.
//  All other agents read from it — no overlapping questions.
// ═══════════════════════════════════════════════════════════════

async function runBruceStormCheck() {
  log("═══════════════════════════════════════");
  log("BRUCE — STORM DETECTION CYCLE");
  log(`Time: ${clock()}`);
  log("═══════════════════════════════════════");

  cleanOldAlerts();

  const [alertData, forecastData] = await Promise.all([
    checkNOAAStormAlerts(),
    getHoustonForecast(),
  ]);

  const isStormActive  = alertData?.hasAlerts || false;
  const hasNewAlerts   = alertData?.hasNewAlerts || false;

  // UPGRADE 4: Log storm history for every new alert
  if (isStormActive && alertData.newAlerts?.length > 0) {
    await logStormHistory(alertData.newAlerts, forecastData);
    // Mark alerts as processed
    alertData.newAlerts.forEach(a => markAlertProcessed(a.id, a.event, a.area));
  }

  // UPGRADE 5: ZIP Code Target Ranking
  const rankedZIPs = rankHoustonZIPs(alertData, forecastData);
  log(`Bruce: Top ZIP targets: ${rankedZIPs.slice(0,3).map(z=>z.suburb).join(", ")}`);

  let stormReport = "";

  if (isStormActive) {
    stormReport += "🚨 STORM PROTOCOL ACTIVE 🚨\n\n";
    stormReport += `ACTIVE NWS ALERTS (${alertData.count}):\n${alertData.summary}\n\n`;
    if (!hasNewAlerts) stormReport += "NOTE: All active alerts already processed — no duplicate content generated.\n\n";
    stormReport += "IMMEDIATE ACTIONS FOR KYLE:\n";
    stormReport += "1. Post Arthur's Storm Post in ALL Houston Facebook groups NOW\n";
    stormReport += "2. Send Kyle Duncan's emergency DM to all warm leads immediately\n";
    stormReport += "3. Post on Nextdoor in ALL Houston area neighborhoods\n";
    stormReport += "4. Call Rayburn Roofing — prepare for inspection surge\n";
  } else {
    stormReport += "✅ No active severe weather alerts for Houston area.\n\n";
  }

  stormReport += `ZIP CODE TARGET RANKING:\n${rankedZIPs.map(z=>`${z.rank}. ${z.suburb} — ZIPs: ${z.zips.join(", ")} — Score: ${z.score}`).join("\n")}\n\n`;

  if (forecastData?.raw) {
    stormReport += `HOUSTON 7-DAY FORECAST:\n${forecastData.raw}\n`;
    if (forecastData.stormDays?.length > 0) {
      stormReport += `STORM DAYS AHEAD: ${forecastData.stormDays.map(d=>d.name).join(", ")}\n`;
    }
  }

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Bruce",
    "Task Title":  `Storm Check — ${isStormActive ? "🚨 ACTIVE" : "Clear"} — ${clock()}`,
    "Task Output": stormReport,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log(`Bruce: Complete. Storm active: ${isStormActive}. New alerts: ${hasNewAlerts}.`);
  return { isStormActive, hasNewAlerts, hasAlerts:isStormActive, stormReport, forecastData, rankedZIPs, alertData };
}

// ═══════════════════════════════════════════════════════════════
//  TOMMY — INTELLIGENCE WITH SHARED CONTEXT + MARKET PULSE
// ═══════════════════════════════════════════════════════════════

async function runTommy(sharedContext) {
  log("Tommy: Running daily Houston roofing intelligence...");

  const { stormReport, forecastData, rankedZIPs, marketPulse } = sharedContext;

  const topZIPNames = rankedZIPs?.slice(0,5).map(z=>z.suburb).join(", ") || "Katy, Sugar Land, The Woodlands, Pearland, Cypress";

  const intel = await callClaude(
    `You are Tommy, Intelligence Officer for Rayburn Roofing in Houston Texas. Kyle Duncan earns 30% commission. You have live NOAA weather data AND real Houston market news. Generate aggressive, specific, revenue-focused intelligence. Never guarantee outcomes. Results may vary.`,
    `LIVE NOAA DATA:
${stormReport?.slice(0, 400) || "No active storm alerts."}

TOP TARGET ZONES TODAY (ranked by opportunity):
${rankedZIPs?.slice(0,5).map(z=>`${z.rank}. ${z.suburb}`).join("\n") || topZIPNames}

${marketPulse ? `REAL HOUSTON MARKET NEWS THIS WEEK:\n${marketPulse}\n` : ""}

Generate TODAY'S COMPLETE INTELLIGENCE BRIEFING:

STORM STATUS (label it): Current Houston weather impact on roofing opportunities.

TOP COMMERCIAL OPPORTUNITY (label it): Highest-value commercial target TODAY. Specific property type and one of these suburbs: ${topZIPNames}. Why now. What Kyle does today.

TOP RESIDENTIAL OPPORTUNITY (label it): Highest-volume residential target. Specific suburb from top zones. Why it's hot.

WEATHER WEAPONIZATION (label it): How Kyle uses today's real Houston weather as a roofing conversation starter. Specific and actionable.

ZIP CODE FOCUS (label it): Top 3 ZIP codes Kyle targets today and why. Specific outreach approach for each.

PRIORITY ACTION — FIRST 60 MINUTES (label it): The 3 most important revenue actions. Specific. No fluff.

MARKET INTELLIGENCE (label it): One real insight from Houston news today that Kyle uses as a conversation starter with property managers.`,
    900, true // use Sonnet for Tommy — he's the brain
  );

  await saveToAirtable(TABLES.dailyIntelligence, {
    "Date":             today(),
    "Top Niche":        "Roofing",
    "Market Summary":   sharedContext.isStormActive
      ? `🚨 STORM ACTIVE — ${stormReport?.slice(0,100)}`
      : `Clear. Top zones: ${topZIPNames}`,
    "Roofing Brief":    intel,
    "Agent Directives": intel.slice(0, 500),
  });

  log("Tommy: Intelligence saved.");
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  ARTHUR — CONTENT GENERATION (ZIP-AWARE)
// ═══════════════════════════════════════════════════════════════

async function runArthur(sharedContext, intel) {
  log("Arthur: Writing Houston roofing content...");

  const { isStormActive, rankedZIPs, forecastData } = sharedContext;
  const topSuburb  = rankedZIPs?.[0]?.suburb || "Katy";
  const secondSuburb = rankedZIPs?.[1]?.suburb || "Sugar Land";
  const weatherHook = isStormActive
    ? "URGENT: Active storm alerts in Houston. Create storm emergency content."
    : `Weather: ${forecastData?.forecast?.[0]?.shortForecast || "Houston summer heat"}`;

  const content = await callClaude(
    `You are Arthur, Content Director for Rayburn Roofing in Houston Texas. Kyle earns 30% commission. HARD RULE: Every post MUST be under 80 words. Focus on ${topSuburb} and ${secondSuburb} today — these are the highest-opportunity zones. Never guarantee outcomes. Results may vary.`,
    `${weatherHook}
TOP ZONES TODAY: ${topSuburb} (#1), ${secondSuburb} (#2)
Intel: ${intel?.slice(0,200) || "Houston roofing opportunities"}

Write COMPLETE CONTENT PACKAGE — ALL POSTS UNDER 80 WORDS:

FACEBOOK POST (label it): Under 80 words. Mention ${topSuburb} specifically. Free Rayburn Roofing inspection. Neighbor tone not ad.

LINKEDIN POST (label it): Under 80 words. Houston commercial property managers. Professional. Free commercial inspection. One question at end.

NEXTDOOR POST (label it): Under 60 words. Neighbor tone. Mention ${secondSuburb}. Free Rayburn Roofing inspection.

TIKTOK HOOK (label it): Under 50 words. First line stops scroll. Houston roofing tip. Free inspection CTA.

STORM POST (label it): Under 80 words. ${isStormActive ? `EMERGENCY — active storm in ${topSuburb}. Maximum urgency.` : `Pre-storm awareness for ${topSuburb}. Seasonal angle.`} Same-day Rayburn Roofing inspection.

PROPERTY MANAGER EMAIL (label it): Subject line + body. Under 100 words total. Contractor reliability pain point. Free commercial inspection in ${topSuburb}.

GOOGLE BUSINESS POST (label it): Under 80 words. Trust-building. Houston service area. Free inspection.`,
    900
  );

  // Extract each post type into its own field
  const extractPost = (label, text) => {
    try {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(label.toLowerCase())) {
          const parts = [];
          let j = i + 1;
          while (j < lines.length && parts.length < 8) {
            const line = lines[j].trim();
            j++;
            if (!line) continue;
            if (/^[A-Z][A-Z\s]{3,}:/.test(line) || line.includes("(label it)")) break;
            parts.push(line);
          }
          const result = parts.join(" ").trim();
          if (result.length > 10) return result.slice(0, 500);
        }
      }
      return "";
    } catch(e) { return ""; }
  };

  await saveToAirtable(TABLES.contentQueue, {
    "Content Title":  `Rayburn Roofing — ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}`,
    "Content Type":   "Social Caption",
    "Content Niche":  "Roofing",
    "Content City":   `Houston TX — ${topSuburb}`,
    "Status":         "Pending Approval",
    "Body":           content,
    "LinkedIn Post":  extractPost("LINKEDIN POST", content),
    "Facebook Post":  extractPost("FACEBOOK POST", content),
    "Nextdoor Post":  extractPost("NEXTDOOR POST", content),
    "TikTok Hook":    extractPost("TIKTOK HOOK", content),
    "Storm Post":     extractPost("STORM POST", content),
    "Due Date":       today(),
    "Content Plan":   "Growth",
  });

  log(`Arthur: Content saved. Top zone: ${topSuburb}.`);
  return content;
}

// ═══════════════════════════════════════════════════════════════
//  KYLE DUNCAN — OUTREACH (ZIP-AWARE)
// ═══════════════════════════════════════════════════════════════

async function runKyleDuncan(sharedContext, intel) {
  log("Kyle Duncan: Writing Houston outreach scripts...");

  const { isStormActive, rankedZIPs } = sharedContext;
  const topZones = rankedZIPs?.slice(0,3).map(z=>z.suburb).join(", ") || "Katy, Sugar Land, The Woodlands";

  const scripts = await callClaude(
    `You are Kyle Duncan, Lead Outreach Specialist for Rayburn Roofing in Houston Texas. 30% commission. Write outreach that starts conversations and books free inspections. Focus today on: ${topZones}. Never guarantee outcomes. Results may vary.`,
    `${isStormActive ? `STORM ACTIVE — lead with storm damage angle. Focus on ${topZones}.` : `Standard outreach. Focus zones: ${topZones}.`}
Intel: ${intel?.slice(0,200) || "Houston property managers"}

Write COMPLETE OUTREACH KIT for Houston Texas — focus on ${topZones}:

CONNECTION REQUEST — PROPERTY MANAGER (label it): Under 200 chars. References ${rankedZIPs?.[0]?.suburb || "Houston"}. Rayburn Roofing. Free commercial inspection.

FIRST DM — PROPERTY MANAGER (label it): Under 75 words. References their ${rankedZIPs?.[0]?.suburb || "Houston"} buildings specifically. Free Rayburn Roofing commercial inspection.

FIRST DM — HOMEOWNER (label it): Under 60 words. Mentions ${rankedZIPs?.[1]?.suburb || "Sugar Land"} specifically. ${isStormActive ? "Storm damage angle." : "Weather angle."} Free inspection.

FOLLOW UP — DAY 3 (label it): Under 55 words. Different angle. References ${topZones}.

OBJECTION — ALREADY HAVE A ROOFER (label it): Under 65 words. Free second opinion positioning.

FACEBOOK GROUP COMMENT (label it): Under 65 words. Natural. Helpful. For Houston neighborhood groups.

${isStormActive ? `STORM EMERGENCY DM (label it): Under 60 words. URGENT. Storm active in ${rankedZIPs?.[0]?.suburb || "Houston"}. Send to all warm leads NOW.` : `INSPECTION BOOKING CLOSE (label it): Under 80 words. Removes friction. Confirms appointment. Results may vary.`}`,
    800
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Kyle Duncan",
    "Task Title":  `Outreach Scripts — ${topZones} — ${isStormActive ? "STORM" : today()}`,
    "Task Output": scripts,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Kyle Duncan: Scripts saved.");
  return scripts;
}

// ═══════════════════════════════════════════════════════════════
//  PETER — INSURANCE WHISPERER (UPGRADED)
//  Now includes carrier intelligence — State Farm, Allstate,
//  Farmers, USAA specific documentation and supplement patterns.
// ═══════════════════════════════════════════════════════════════

async function runPeter(sharedContext) {
  log("Peter: Generating insurance intelligence...");

  const { isStormActive, stormReport, rankedZIPs } = sharedContext;
  const topZone = rankedZIPs?.[0]?.suburb || "Houston";

  const insurance = await callClaude(
    `You are Peter, Insurance Whisperer for Rayburn Roofing in Houston Texas. You help Houston homeowners navigate insurance claims to maximize payouts. You know how each major carrier operates in Texas. Results may vary by policy and insurer.`,
    `${isStormActive ? `LIVE STORM ACTIVE in ${topZone} — insurance claims will be filed immediately.` : `Standard insurance day in ${topZone}.`}

Generate COMPLETE INSURANCE BRIEF:

${isStormActive ? `EMERGENCY CLAIM GUIDANCE (label it): Storm active in ${topZone}. Step-by-step guidance Kyle gives homeowners in the next 24 hours. Time-sensitive.

ADJUSTER TIMELINE (label it): How fast major Texas insurers deploy adjusters after a Houston storm — State Farm, Allstate, Farmers, USAA typical timelines. What homeowners do while waiting.` : `CLAIM ELIGIBILITY GUIDE (label it): How Kyle determines in 5 minutes if a ${topZone} homeowner has a legitimate claim. Exact questions. Results may vary.

DOCUMENTATION CHECKLIST (label it): Exactly what the homeowner photographs before adjuster arrives. Specific shots and why each matters.`}

CARRIER INTELLIGENCE (label it): How the top 4 Houston insurance carriers handle roofing claims differently:
STATE FARM: typical documentation requests, supplement stance, timeline
ALLSTATE: what they commonly dispute, how to counter
FARMERS: supplement opportunities they commonly miss
USAA: their process for military homeowners in Houston — typically faster

ADJUSTER PREPARATION SCRIPT (label it): Word-for-word coaching Kyle gives homeowners before the adjuster arrives. What to say. What NOT to say.

SUPPLEMENT REQUEST GUIDE (label it): Most missed supplements in Houston claims — ice shield, drip edge, code upgrades, permits, pipe boots. Dollar value of each.

KYLE VALUE PROPOSITION (label it): The exact script Kyle uses to position himself as a Houston insurance advocate. Under 80 words. Makes him irreplaceable.`,
    900
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Peter",
    "Task Title":  `Insurance Intel — ${isStormActive ? "🚨 STORM CLAIMS" : today()} — ${topZone}`,
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

async function runWanda(sharedContext) {
  log("Wanda: Running competitor monitoring...");

  const topZones = sharedContext.rankedZIPs?.slice(0,3).map(z=>z.suburb).join(", ") || "Katy, Sugar Land, The Woodlands";

  const intel = await callClaude(
    `You are Wanda, Competitor Intelligence for Rayburn Roofing in Houston Texas. Every competitor failure is a Rayburn Roofing opportunity. Focus today on: ${topZones}. Results may vary.`,
    `Top opportunity zones today: ${topZones}

Generate COMPETITOR DOMINATION BRIEF:

TOP COMPETITOR WEAKNESS TODAY (label it): Most exploitable weakness in Houston roofing competitors right now. Exact message Kyle sends to capture their customers in ${topZones}.

FACEBOOK GROUP MONITORING (label it): Keywords Kyle searches in ${topZones} Facebook groups today. What to look for. Exact response when found.

NEGATIVE REVIEW INTERCEPT (label it): Houston competitor gets 1-3 star Google review. What Kyle does in 24 hours. Full script.

ANTI-COMPETITOR SCRIPT (label it): Prospect mentions a competitor. Under 75 words. Strategic. Not attacking.

FIRST MOVER PROTOCOL (label it): After any competitor failure in ${topZones} — exact steps in first 2 hours.`,
    700
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Wanda",
    "Task Title":  `Competitor Intel — ${topZones} — ${today()}`,
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
  log("Tony: Generating wealth brief...");

  const wealth = await callClaude(
    `You are Tony, Wealth Architect for Rayburn Roofing referral operation. Kyle Duncan earns 30% commission on every job. Consult a tax professional and financial advisor for specific advice. Results may vary.`,
    `Generate WEALTH BUILDING BRIEF:

COMMISSION ALLOCATION (label it): How Kyle splits every check. Show amounts for $2,400 residential and $22,500 commercial.

MILESTONE THIS WEEK (label it): Where Kyle likely is right now and exactly what he does with money at this stage.

TAX REMINDER (label it): Most important tax action for a self-employed commission earner in Texas this week. Consult a tax professional.

WEALTH ACTION (label it): One specific free or low-cost wealth-building step Kyle takes this week.`,
    500
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Tony",
    "Task Title":  `Wealth Brief — ${today()}`,
    "Task Output": wealth,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Tony: Wealth brief saved.");
  return wealth;
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE 6 — DAILY SUCCESS REPORT
//  One clean Airtable record per cycle.
//  Makes troubleshooting a 30-second job.
// ═══════════════════════════════════════════════════════════════

async function saveDailyReport(results, startTime) {
  const mins     = ((Date.now() - startTime) / 60000).toFixed(1);
  const successes = Object.entries(results).filter(([,v]) => v === "ok").map(([k]) => k);
  const failures  = Object.entries(results).filter(([,v]) => v !== "ok").map(([k,v]) => `${k}: ${v}`);

  const report = `TAMMM DAILY REPORT — ${today()} — ${clock()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RUNTIME: ${mins} minutes
AGENTS COMPLETED: ${successes.join(", ")}
FAILURES: ${failures.length > 0 ? failures.join(", ") : "None"}
STORM ACTIVE: ${results.storm === "active" ? "🚨 YES" : "✅ No"}
DUPLICATE ALERTS SKIPPED: ${results.dupesSkipped || 0}
PROSPECTS SAVED: ${results.prospectsFound || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATUS: ${failures.length === 0 ? "✅ ALL SYSTEMS GREEN" : `⚠ ${failures.length} issue(s) — check logs`}`;

  await saveToAirtable(TABLES.metrics, {
    "Date":  today(),
    "Notes": report,
  });

  log(report);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN DAILY CYCLE — WITH ALL UPGRADES
// ═══════════════════════════════════════════════════════════════

async function runDailyCycle() {
  // UPGRADE 1: Run Lock — refuse if already running
  if (!acquireLock("Daily Cycle")) {
    log("Daily cycle skipped — already running. Try again after current cycle completes.", "WARN");
    return;
  }

  const startTime = Date.now();
  const results   = {};

  log("═══════════════════════════════════════════");
  log("TAMMM — RAYBURN ROOFING DAILY CYCLE");
  log(`Date: ${new Date().toDateString()} · ${clock()}`);
  log("═══════════════════════════════════════════");

  try {
    // UPGRADE 7 (IDEA 2): Fetch Houston Market Pulse on Mondays
    let marketPulse = null;
    if (new Date().getDay() === 1) {
      try {
        marketPulse = await fetchHoustonMarketPulse();
        results.marketPulse = "ok";
      } catch(e) { results.marketPulse = e.message; }
    }

    // Step 1: Bruce — storm detection + ZIP ranking (shared context builder)
    let sharedContext = { isStormActive:false, stormReport:"", rankedZIPs:[], forecastData:null, marketPulse };
    try {
      const bruceData = await runBruceStormCheck();
      sharedContext = { ...bruceData, marketPulse };
      results.bruce  = "ok";
      results.storm  = bruceData?.isStormActive ? "active" : "clear";
      results.dupesSkipped = (bruceData?.alertData?.count || 0) - (bruceData?.alertData?.newCount || 0);
    } catch(e) { results.bruce = e.message; }
    await sleep(800);

    // Step 2: Tommy — intelligence using shared context
    let intel = "";
    try {
      intel = await runTommy(sharedContext);
      results.tommy = "ok";
    } catch(e) { results.tommy = e.message; }
    await sleep(600);

    // Step 3: Hunter — prospect lists for top ZIP codes
    try {
      await runHunter(sharedContext.rankedZIPs || [], sharedContext);
      results.hunter = "ok";
    } catch(e) { results.hunter = e.message; }
    await sleep(600);

    // Step 4: Arthur — content (ZIP-aware)
    try {
      await runArthur(sharedContext, intel);
      results.arthur = "ok";
    } catch(e) { results.arthur = e.message; }
    await sleep(600);

    // Step 5: Kyle Duncan — outreach (ZIP-aware)
    try {
      await runKyleDuncan(sharedContext, intel);
      results.kyleDuncan = "ok";
    } catch(e) { results.kyleDuncan = e.message; }
    await sleep(600);

    // Step 6: Peter — insurance (carrier-aware)
    try {
      await runPeter(sharedContext);
      results.peter = "ok";
    } catch(e) { results.peter = e.message; }
    await sleep(500);

    // Step 7: Wanda — competitor monitoring
    try {
      await runWanda(sharedContext);
      results.wanda = "ok";
    } catch(e) { results.wanda = e.message; }
    await sleep(500);

    // Step 8: Tony — wealth building
    try {
      await runTony();
      results.tony = "ok";
    } catch(e) { results.tony = e.message; }

    // UPGRADE 6: Daily Success Report
    await saveDailyReport(results, startTime);

  } catch(e) {
    log(`CYCLE FAILED: ${e.message}`, "ERROR");
    results.cycleFailed = e.message;
    await saveDailyReport(results, startTime);
  } finally {
    releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
//  STORM ONLY CHECK — Every 6 Hours
// ═══════════════════════════════════════════════════════════════

async function runStormOnlyCheck() {
  // UPGRADE 1: Lock prevents storm check overlapping with daily cycle
  if (cycleRunning) {
    log(`Storm check skipped — ${cycleType} already running`, "WARN");
    return;
  }
  if (!acquireLock("Storm Check")) return;

  log("Bruce: 6-hour storm check triggered...");
  try {
    const bruceData = await runBruceStormCheck();

    // Only fire emergency cycle if there are NEW alerts (not duplicates)
    if (bruceData?.isStormActive && bruceData?.hasNewAlerts) {
      log("🚨 NEW STORM DETECTED — Running emergency content cycle...");
      const sharedContext = { ...bruceData, marketPulse:null };
      const intel = await runTommy(sharedContext);
      await runArthur(sharedContext, intel);
      await runKyleDuncan(sharedContext, intel);
      await runPeter(sharedContext);
      await runHunter(bruceData.rankedZIPs || [], bruceData);
      log("Storm emergency cycle complete. Check Airtable NOW.");
    } else if (bruceData?.isStormActive && !bruceData?.hasNewAlerts) {
      log("Storm still active but all alerts already processed — skipping duplicate content generation.");
    }
  } catch(e) {
    log(`Storm check failed: ${e.message}`, "ERROR");
  } finally {
    releaseLock();
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
log("Upgrades: Run Lock · Dupe Prevention · Hunter · ZIP Ranking · Storm History · Market Pulse · Daily Report");
log("Full cycle: 7am daily · Storm check: every 6 hours");
setTimeout(runDailyCycle, 5000);

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });

  if (req.url === "/run") {
    if (cycleRunning) {
      res.end(JSON.stringify({ status:"BLOCKED", reason:`${cycleType} already running since ${cycleStart}`, time:new Date().toISOString() }));
      return;
    }
    res.end(JSON.stringify({ status:"TAMMM cycle started", time:new Date().toISOString() }));
    runDailyCycle();

  } else if (req.url === "/storm") {
    res.end(JSON.stringify({ status:"Storm check started", time:new Date().toISOString() }));
    runStormOnlyCheck();

  } else if (req.url === "/check-storm") {
    const stormData = await runBruceStormCheck();
    res.end(JSON.stringify({
      stormActive:   stormData?.isStormActive,
      hasNewAlerts:  stormData?.hasNewAlerts,
      alertCount:    stormData?.alertData?.count || 0,
      newAlertCount: stormData?.alertData?.newCount || 0,
      summary:       stormData?.summary,
      rankedZIPs:    stormData?.rankedZIPs?.slice(0,5),
      forecast:      stormData?.forecastData?.raw,
      cycleRunning,
      time:          new Date().toISOString(),
    }));

  } else if (req.url === "/status") {
    res.end(JSON.stringify({
      status:         "TAMMM Online — Rayburn Roofing Houston",
      cycleRunning,
      cycleType,
      cycleStart,
      processedAlerts: processedAlerts.size,
      alertHistory:   alertHistory.slice(-5),
      time:           new Date().toISOString(),
    }));

  } else {
    res.end(JSON.stringify({
      status:     "TAMMM Online — Rayburn Roofing Houston",
      stormCheck: "Every 6 hours via NOAA API",
      dailyCycle: "7am Central daily",
      endpoints:  ["/", "/run", "/storm", "/check-storm", "/status"],
      upgrades:   ["Run Lock","Dupe Prevention","Hunter Agent","ZIP Ranking","Storm History","Market Pulse","Daily Report","Carrier Intelligence"],
      time:       new Date().toISOString(),
    }));
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout   = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`Health check server on port ${PORT}`);
  log("Endpoints: / · /run · /storm · /check-storm · /status");
});
  
