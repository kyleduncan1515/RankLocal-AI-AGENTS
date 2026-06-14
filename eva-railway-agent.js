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
  stormAlerts:       "tblOdvg1ARhp8pszD", // logs to metrics table
};

// ─── SUBSCRIBER CONFIGURATION ──────────────────────────────────
// Single test subscriber — Rayburn Roofing Houston
const SAMPLE_SUBS = [
  { "Business Name": "Rayburn Roofing Houston", "Contact Name": "Owner", niche: "Roofing", city: "Houston TX", plan: "growth" },
];

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
//  Checks every 6 hours. Free. No API key needed.
//  Detects hail, tornadoes, severe thunderstorms near Houston.
// ═══════════════════════════════════════════════════════════════

const HOUSTON_ZONE = "TXZ163"; // Harris County (Houston)
const HOUSTON_COUNTIES = [
  "Harris",    // Houston core
  "Fort Bend", // Sugar Land, Missouri City
  "Brazoria",  // Pearland, Friendswood
  "Galveston", // Galveston, League City, Webster
  "Montgomery",// The Woodlands, Conroe, Spring
  "Waller",    // Katy area
  "Liberty",   // Humble, Baytown area
  "Chambers",  // Baytown
];

// Houston area NWS zone codes for alert filtering
const HOUSTON_ZONES = ["TXZ163","TXZ162","TXZ161","TXZ160","TXZ164","TXZ165","TXZ166","TXZ167","TXZ168","TXZ169"];
const HOUSTON_FIPS  = ["48201","48157","48039","48167","48339","48473","48291","48071"]; // Harris + surrounding counties

async function checkNOAAStormAlerts() {
  log("Bruce: Checking NOAA for Houston severe weather alerts...");

  try {
    // Check active alerts for Texas
    const res = await fetch(
      "https://api.weather.gov/alerts/active?area=TX&status=actual&message_type=alert",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0 (kyleduncan@gmail.com)", "Accept": "application/geo+json" } }
    );

    if (!res.ok) {
      log(`NOAA API returned ${res.status}`, "WARN");
      return null;
    }

    const data = await res.json();
    const alerts = data.features || [];

    // Filter for Houston area and severe weather types
    const severeTypes = [
      "Tornado Warning",
      "Tornado Watch",
      "Severe Thunderstorm Warning",
      "Severe Thunderstorm Watch",
      "Hail",
      "Flash Flood Warning",
      "High Wind Warning",
      "Hurricane Warning",
      "Hurricane Watch",
      "Tropical Storm Warning",
      "Special Weather Statement",
    ];

    const houstonAlerts = alerts.filter(alert => {
      const props = alert.properties;
      const event = props.event || "";
      const areaDesc = props.areaDesc || "";
      const geocode = props.geocode || {};
      const fips = geocode.SAME || [];
      const zones = geocode.UGC || [];

      // Check if it's a relevant event type
      const isRelevant = severeTypes.some(t => event.includes(t)) ||
        event.toLowerCase().includes("hail") ||
        event.toLowerCase().includes("tornado") ||
        event.toLowerCase().includes("thunderstorm") ||
        event.toLowerCase().includes("hurricane") ||
        event.toLowerCase().includes("tropical");

      // Check if it affects Houston area
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

    // Format alerts for use by other agents
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

    log(`Bruce: 🚨 ${houstonAlerts.length} ACTIVE ALERT(S) FOR HOUSTON AREA!`);
    formatted.forEach(a => log(`  → ${a.event}: ${a.area}`));

    return { hasAlerts: true, count: houstonAlerts.length, alerts: formatted, summary };

  } catch(e) {
    log(`Bruce: NOAA check failed: ${e.message}`, "WARN");
    return null;
  }
}

async function checkHailReports() {
  log("Bruce: Checking for recent hail reports near Houston...");

  try {
    // SPC storm reports - last 24 hours
    // Using NWS storm reports endpoint
    const res = await fetch(
      "https://api.weather.gov/alerts/active?area=TX&event=Severe+Thunderstorm+Warning&status=actual",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" } }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const alerts = data.features || [];

    // Look for hail mentions in Houston area
    const hailAlerts = alerts.filter(a => {
      const desc = (a.properties?.description || "").toLowerCase();
      const area = (a.properties?.areaDesc || "").toLowerCase();
      return (desc.includes("hail") || desc.includes("ping pong") || desc.includes("golf ball")) &&
        (area.includes("harris") || area.includes("houston") || HOUSTON_COUNTIES.some(c => area.includes(c.toLowerCase())));
    });

    if (hailAlerts.length > 0) {
      const hailDetails = hailAlerts.map(a => {
        const desc = a.properties.description || "";
        const hailMatch = desc.match(/hail(?:\s+up\s+to)?\s+([\d.]+)\s+inch/i);
        const hailSize = hailMatch ? hailMatch[1] + " inch" : "size unknown";
        return {
          area:     a.properties.areaDesc,
          hailSize,
          headline: a.properties.headline,
        };
      });

      log(`Bruce: 🧊 HAIL DETECTED! ${hailAlerts.length} alert(s) with hail near Houston`);
      return { hasHail: true, hailAlerts: hailDetails };
    }

    return { hasHail: false };

  } catch(e) {
    log(`Bruce: Hail check failed: ${e.message}`, "WARN");
    return null;
  }
}

async function getHoustonForecast() {
  log("Bruce: Fetching Houston 7-day forecast...");

  try {
    // Houston coordinates (downtown)
    const pointRes = await fetch(
      "https://api.weather.gov/points/29.7604,-95.3698",
      { headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" } }
    );

    if (!pointRes.ok) return null;

    const pointData = await pointRes.json();
    const forecastUrl = pointData.properties?.forecast;

    if (!forecastUrl) return null;

    const forecastRes = await fetch(forecastUrl, {
      headers: { "User-Agent": "TAMMM-RayburnRoofing/1.0", "Accept": "application/geo+json" }
    });

    if (!forecastRes.ok) return null;

    const forecastData = await forecastRes.json();
    const periods = forecastData.properties?.periods?.slice(0, 7) || [];

    const forecast = periods.map(p => ({
      name:           p.name,
      temperature:    p.temperature,
      temperatureUnit:p.temperatureUnit,
      windSpeed:      p.windSpeed,
      shortForecast:  p.shortForecast,
      detailedForecast:p.detailedForecast?.slice(0, 200),
    }));

    // Look for storm conditions
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

  const [alertData, hailData, forecastData] = await Promise.all([
    checkNOAAStormAlerts(),
    checkHailReports(),
    getHoustonForecast(),
  ]);

  const hasActiveAlerts = alertData?.hasAlerts || false;
  const hasHail         = hailData?.hasHail || false;
  const isStormActive   = hasActiveAlerts || hasHail;

  // Build Bruce's intelligence report
  let stormReport = "";

  if (isStormActive) {
    stormReport += "🚨 STORM PROTOCOL ACTIVE 🚨\n\n";

    if (hasActiveAlerts) {
      stormReport += `ACTIVE NWS ALERTS (${alertData.count}):\n${alertData.summary}\n\n`;
    }

    if (hasHail) {
      stormReport += `HAIL REPORTS:\n`;
      hailData.hailAlerts.forEach(h => {
        stormReport += `• ${h.area} — ${h.hailSize} hail — ${h.headline}\n`;
      });
      stormReport += "\n";
    }

    stormReport += "IMMEDIATE ACTIONS FOR KYLE:\n";
    stormReport += "1. Post Arthur's Storm Urgency Post in ALL Houston Facebook groups NOW\n";
    stormReport += "2. Send Kyle Duncan's emergency DM to all property managers immediately\n";
    stormReport += "3. Post on Nextdoor in ALL Houston area neighborhoods\n";
    stormReport += "4. Call uncle at Rayburn Roofing — prepare for inspection surge\n";
    stormReport += "5. Check affected neighborhoods and prioritize outreach there first\n";

    if (alertData?.alerts?.length > 0) {
      const topAlert = alertData.alerts[0];
      stormReport += `\nMOST URGENT: ${topAlert.event} affecting ${topAlert.area}\n`;
      if (topAlert.instruction) stormReport += `NWS INSTRUCTION: ${topAlert.instruction}\n`;
    }
  } else {
    stormReport += "✅ No active severe weather alerts for Houston area.\n\n";
  }

  if (forecastData?.raw) {
    stormReport += `HOUSTON 7-DAY FORECAST:\n${forecastData.raw}\n\n`;
    if (forecastData.stormDays?.length > 0) {
      stormReport += `UPCOMING STORM DAYS: ${forecastData.stormDays.map(d=>d.name).join(", ")}\n`;
      stormReport += "→ Kyle should begin pre-storm outreach in these neighborhoods NOW.\n";
    }
  }

  // Generate Bruce's AI analysis using real weather data
  if (stormReport) {
    try {
      const bruceAnalysis = await callClaude(
        `You are Bruce, Storm Predictor for Rayburn Roofing in Houston Texas. You have access to REAL live weather data. Kyle Duncan earns 30% commission on every roofing job. Generate aggressive, specific, revenue-focused analysis. Results may vary. Rayburn Roofing Houston is your primary subscriber.`,
        `Here is today's REAL NOAA weather data for Houston:\n\n${stormReport}\n\nBased on this LIVE data, generate Bruce's complete storm intelligence brief:\n\nSTORM STATUS (label it): Current alert status with exact details from the NOAA data above.\n\nIMMEDIATE REVENUE OPPORTUNITY (label it): If any storm activity — exact dollar opportunity. Which Houston neighborhoods to target first. How many potential jobs. Kyle's 30% at $8K-$15K per job. Results may vary.\n\nPRE-STORM POSITIONING (label it): Based on the 7-day forecast — which neighborhoods Kyle starts working RIGHT NOW before any storms hit. Specific suburb names.\n\nSTORM CONTENT TO POST IMMEDIATELY (label it): The exact Facebook post, Nextdoor post, and LinkedIn message Kyle copies and sends RIGHT NOW based on this real weather data. Ready to copy and paste.\n\nWEATHER-BASED OUTREACH ANGLE (label it): How Kyle uses today's specific Houston weather — exact temperatures, wind, rain — as a roofing conversation starter in every message today.\n\nNOAA DATA SOURCE: ${forecastData?.raw || "api.weather.gov"}`
      );

      stormReport += "\n\nBRUCE AI ANALYSIS:\n" + bruceAnalysis;
    } catch(e) {
      log(`Bruce AI analysis failed: ${e.message}`, "WARN");
    }
  }

  // Save to Airtable
  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Bruce",
    "Task Title":  `Storm Detection — ${isStormActive ? "🚨 ALERTS ACTIVE" : "All Clear"}`,
    "Task Output": stormReport,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  // If storm is active — also log as priority metric
  if (isStormActive) {
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `⚠ STORM ALERT: ${alertData?.count || 0} NWS alert(s) active for Houston. Hail detected: ${hasHail}. ACTIVATE STORM PROTOCOL NOW.`,
    });
  }

  log(`Bruce: Storm check complete. Active: ${isStormActive}. Report saved to Airtable.`);
  return { isStormActive, hasAlerts: hasActiveAlerts, hasHail, stormReport, forecastData };
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
//  TOMMY — DAILY HOUSTON INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

async function runTommy(stormData) {
  log("Tommy: Running daily Houston roofing intelligence...");

  const stormContext = stormData?.isStormActive
    ? `LIVE STORM DATA: ${stormData.stormReport?.slice(0, 500)}`
    : `Weather: ${stormData?.forecastData?.raw || "No active storm alerts for Houston"}`;

  const intel = await callClaude(
    `You are Tommy, Intelligence Officer for Rayburn Roofing in Houston Texas. Kyle Duncan earns 30% commission. You have access to live NOAA weather data today. Generate aggressive, Houston-specific, revenue-focused intelligence. Never guarantee outcomes. Results may vary. You specialize in the roofing industry and Rayburn Roofing Houston is your primary focus.`,
    `${stormContext}

Generate today's COMPLETE INTELLIGENCE BRIEFING:

STORM STATUS (label it): Based on LIVE NOAA data above — current weather situation in Houston and impact on roofing opportunities.

TOP COMMERCIAL OPPORTUNITY (label it): Single highest-value commercial target in Houston today. Specific property type, neighborhood. What Kyle does about it TODAY.

TOP RESIDENTIAL OPPORTUNITY (label it): Highest-volume residential opportunity. Specific Houston suburb. Why it's hot right now.

WEATHER WEAPONIZATION (label it): Based on REAL Houston weather today — how Kyle uses specific weather conditions as a roofing conversation starter in every message.

PRIORITY ACTION — FIRST 60 MINUTES (label it): The 3 most important things Kyle does in his first 60 minutes today. Revenue-focused. Specific.

AGENT DIRECTIVES (label it): Brief directive for Arthur, Kyle Duncan, Polly, Michael, Scout, Charlie, Curly, Finn, Peter, Bruce.`, 1200
  );

  await saveToAirtable(TABLES.dailyIntelligence, {
    "Date":           today(),
    "Top Niche":      "Roofing",
    "Market Summary": stormData?.isStormActive
      ? `🚨 STORM ACTIVE — ${stormData.stormReport?.slice(0,100)}`
      : `Daily intelligence complete. ${stormData?.forecastData?.raw?.slice(0,100) || ""}`,
    "Roofing Brief":  intel,
    "Agent Directives": intel.slice(0, 500),
  });

  log("Tommy: Intelligence saved to Airtable.");
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  ARTHUR — CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════

async function runArthur(stormData, intel) {
  log("Arthur: Writing Houston roofing content...");

  const weatherHook = stormData?.isStormActive
    ? `URGENT: Active storm alerts in Houston. Create storm emergency content.`
    : `Weather: ${stormData?.forecastData?.forecast?.[0]?.shortForecast || "Houston summer heat"}`;

  const content = await callClaude(
    `You are Arthur, Content Director for Rayburn Roofing in Houston Texas. Kyle earns 30% commission. Write content that generates leads. Never guarantee outcomes. Results may vary. Your primary client is Rayburn Roofing Houston in Houston, TX.`,
    `${weatherHook}
Intel: ${intel?.slice(0,300) || "Houston roofing market"}

Write today's COMPLETE CONTENT PACKAGE:

FACEBOOK POST (label it): Under 120 words. ${stormData?.isStormActive ? "URGENT storm damage post." : "Hyperlocal Houston hook."} Free Rayburn Roofing inspection. Sounds like a helpful neighbor.

LINKEDIN POST (label it): Under 150 words. Targets Houston property managers. Free commercial inspection.

NEXTDOOR POST (label it): Under 80 words. ${stormData?.isStormActive ? "Storm damage warning for Houston neighborhoods." : "Trusted neighbor tone. Specific Houston suburb."}

TIKTOK HOOK (label it): First line stops scroll in 2 seconds. Under 60 words. Houston-specific.

STORM URGENCY POST (label it): ${stormData?.isStormActive ? "EMERGENCY post based on ACTIVE alerts. Maximum urgency." : "Pre-storm awareness post. Seasonal angle."}`, 1200
  );

  await saveToAirtable(TABLES.contentQueue, {
    "Content Title": `Daily Content — ${stormData?.isStormActive ? "🚨 STORM ACTIVE" : today()}`,
    "Content Type":  "Social Caption",
    "Content Niche": "Roofing",
    "Content City":  "Houston TX",
    "Status":        "Pending Approval",
    "Body":          content,
    "Due Date":      today(),
    "Content Plan":  "Growth",
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
    `You are Kyle Duncan, Lead Outreach Specialist for Rayburn Roofing in Houston Texas. 30% commission. Write outreach that starts conversations and books free inspections. Never guarantee outcomes. Results may vary. Your primary prospect is Rayburn Roofing Houston. You sell to roofing company owners.`,
    `${stormData?.isStormActive ? "STORM ACTIVE in Houston — lead with storm damage angle." : "Standard Houston outreach day."}
Intel: ${intel?.slice(0,200) || "Houston property managers"}

Write the COMPLETE OUTREACH KIT:

CONNECTION REQUEST — PROPERTY MANAGER (label it): Under 200 chars. Personal. Rayburn Roofing. Free inspection.
FIRST DM — PROPERTY MANAGER (label it): Under 75 words. References Houston buildings. Free commercial inspection.
FIRST DM — HOMEOWNER (label it): Under 60 words. ${stormData?.isStormActive ? "Storm damage angle." : "Specific Houston suburb."} Free inspection.
FOLLOW UP — DAY 3 (label it): Under 55 words. Different angle. New hook.
OBJECTION — ALREADY HAVE A ROOFER (label it): Under 65 words. Free second opinion.
FACEBOOK GROUP COMMENT (label it): Under 65 words. Natural. Helpful.
${stormData?.isStormActive ? "STORM EMERGENCY DM (label it): Under 60 words. URGENT. For active storm situation in Houston. Send to all warm leads NOW." : "INSPECTION BOOKING CLOSE (label it): Under 80 words. Removes friction. Confirms appointment."}`, 1000
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Kyle Duncan",
    "Task Title":  `Houston Outreach Scripts — ${stormData?.isStormActive ? "STORM MODE" : today()}`,
    "Task Output": scripts,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Kyle Duncan: Outreach scripts saved to Airtable.");
  return scripts;
}

// ═══════════════════════════════════════════════════════════════
//  PETER — INSURANCE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

async function runPeter(stormData) {
  log("Peter: Generating insurance claim intelligence...");

  const isStorm = stormData?.isStormActive;

  const insurance = await callClaude(
    `You are Peter, Insurance Whisperer for Rayburn Roofing in Houston Texas. You help homeowners and property managers navigate insurance claims to maximize payouts. You make Kyle indispensable. Results may vary by policy and insurer. You support Rayburn Roofing Houston's operations.`,
    `${isStorm ? "LIVE STORM ACTIVE in Houston — insurance claims will be filed immediately." : "Standard insurance intelligence day."}

Generate today's INSURANCE BRIEF:

${isStorm ? `EMERGENCY CLAIM GUIDANCE (label it): Houston storm is ACTIVE right now. Exact guidance Kyle gives homeowners in the next 24 hours to document damage and file claims properly. Step by step. Time-sensitive.

ADJUSTER TIMELINE (label it): How fast insurance companies typically deploy adjusters after a Houston storm. What homeowners should do while waiting. How Kyle helps in the meantime.` : `CLAIM ELIGIBILITY GUIDE (label it): How Kyle determines in 5 minutes if a homeowner has a legitimate claim. Exact questions. Signs of strong vs weak claim. Results may vary.

DOCUMENTATION CHECKLIST (label it): Exactly what the homeowner photographs before the adjuster arrives. Specific shots and why each matters.`}

ADJUSTER PREPARATION SCRIPT (label it): Word-for-word coaching Kyle gives homeowners before the adjuster arrives. What to say. What NOT to say. How to avoid getting lowballed.

SUPPLEMENT REQUEST GUIDE (label it): Most missed supplements in Houston claims — ice shield, drip edge, code upgrades, permits, pipe boots. Dollar value of each.

KYLE VALUE PROPOSITION (label it): How Kyle positions himself as an insurance advocate. The script that makes him irreplaceable. Under 80 words.`, 1000
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Peter",
    "Task Title":  `Insurance Intelligence — ${isStorm ? "🚨 STORM CLAIMS ACTIVE" : today()}`,
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
    `You are Wanda, Competitor Assassin for Rayburn Roofing in Houston Texas. Every competitor failure is a Rayburn Roofing opportunity. Move fast. Be specific. Results may vary. Rayburn Roofing Houston is your primary subscriber.`,
    `Generate today's COMPETITOR DOMINATION BRIEF:

COMPETITOR VULNERABILITY TODAY (label it): The most exploitable weakness in Houston roofing competitors right now. Exact message Kyle sends to capture their dissatisfied customers.

FACEBOOK GROUP MONITORING (label it): Exact keywords Kyle searches in Houston Facebook groups TODAY to find complaints about roofers. What to search. Exact response when found.

NEGATIVE REVIEW INTERCEPT (label it): When a Houston competitor gets a 1-3 star Google review — exactly what Kyle does in 24 hours. Full response script.

ANTI-COMPETITOR POSITIONING (label it): When a prospect mentions a competitor — exactly what Kyle says. Under 75 words. Strategic. Not attacking.

FIRST MOVER PROTOCOL (label it): After any competitor failure — exact steps in first 2 hours. Maximum speed.`, 800
  );

  await saveToAirtable(TABLES.agentOutputs, {
    "Date":        today(),
    "Agent":       "Wanda",
    "Task Title":  `Competitor Intelligence — ${today()}`,
    "Task Output": intel,
    "Status":      "Completed",
    "Niche":       "Roofing",
  });

  log("Wanda: Competitor intel saved.");
  return intel;
}

// ═══════════════════════════════════════════════════════════════
//  TONY — WEALTH TRACKING
// ═══════════════════════════════════════════════════════════════

async function runTony() {
  log("Tony: Generating wealth building brief...");

  const wealth = await callClaude(
    `You are Tony, Wealth Architect for Rayburn Roofing referral operation. Kyle Duncan earns 30% commission on every job. You turn commission into lasting wealth. Consult a tax professional and financial advisor for specific advice. Results may vary.`,
    `Generate today's WEALTH BUILDING BRIEF:

COMMISSION ALLOCATION FORMULA (label it): How Kyle splits every check — operating costs, reinvestment, tax reserve, emergency fund, wealth building, personal. Show dollar amounts for $2,400 residential and $22,500 commercial commissions.

MILESTONE TRACKER (label it): Where Kyle likely is in his business journey today and exactly what he does with money at this stage. What the next milestone looks like.

TAX REMINDER (label it): Most important tax action Kyle takes this week as a self-employed commission earner. Consult a tax professional for specific advice.

WEALTH ACTION THIS WEEK (label it): One specific wealth-building action Kyle takes this week based on where he is in his business. Specific. Actionable.`, 700
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
    // Step 1: Bruce checks live storm data first — everything else adapts
    const stormData = await runBruceStormCheck();
    await sleep(1000);

    // Step 2: Tommy intelligence (weather-aware)
    const intel = await runTommy(stormData);
    await sleep(800);

    // Step 3: Arthur content (storm-aware)
    await runArthur(stormData, intel);
    await sleep(800);

    // Step 4: Kyle Duncan outreach (storm-aware)
    await runKyleDuncan(stormData, intel);
    await sleep(800);

    // Step 5: Peter insurance (storm-aware — most valuable after storm)
    await runPeter(stormData);
    await sleep(600);

    // Step 6: Wanda competitor monitoring
    await runWanda();
    await sleep(600);

    // Step 7: Tony wealth building
    await runTony();
    await sleep(400);

    // Save daily metrics
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    await saveToAirtable(TABLES.metrics, {
      "Date":  today(),
      "Notes": `TAMMM cycle complete in ${mins} min. Storm active: ${stormData?.isStormActive}. ${stormData?.isStormActive ? "⚠ STORM PROTOCOL — check Agent Outputs for Bruce emergency brief." : "All clear."} Agents run: Tommy, Arthur, Kyle Duncan, Bruce, Peter, Wanda, Tony.`,
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
//  BRUCE STORM CHECK — Every 6 Hours
//  Separate from daily cycle — runs around the clock
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

// Storm check only — every 6 hours
cron.schedule("0 */6 * * *", () => {
  log("CRON: 6-hour storm check");
  runStormOnlyCheck();
}, { timezone: "America/Chicago" });

// Start
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
    // Instant storm status check — no AI generation
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
      status:      "TAMMM Online — Rayburn Roofing Houston",
      stormCheck:  "Every 6 hours via NOAA API",
      dailyCycle:  "7am Central daily",
      endpoints:   ["/run", "/storm", "/check-storm"],
      time:        new Date().toISOString(),
    }));
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout   = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`Health check server on port ${PORT}`);
  log("Endpoints: / · /run · /storm · /check-storm");
});
