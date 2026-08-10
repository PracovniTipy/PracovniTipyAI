const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER");
console.log("==========================================");

const CONFIG = {
  DEBUG_DIR: path.resolve(process.env.HEROHERO_DEBUG_DIR || path.join(__dirname, "herohero-debug")),
  PROFILE_DIR: path.resolve(process.env.HEROHERO_PROFILE_DIR || path.join(__dirname, "herohero-profile")),
  HEADLESS: process.env.HEADLESS !== "false",
  TIMEOUTS: {
    PAGE_NAVIGATION: 60000,
    ELEMENT_WAIT: 30000,
    EDITOR_WAIT: 30000,
  },
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  LOCALE: "cs-CZ",
};

const DEFAULT_TEST_JOB = {
  title: "Skladový operátor (Testovací pozice)",
  salary: "35 000 - 42 000",
  location: "Praha - Hostivař",
  startDate: "Ihned / Dle domluvy",
  contractType: "HPP na dobu neurčitou",
  language: "Čeština na komunikativní úrovni",
  link: "https://pracovnitipy.cz",
  description: [
    "Příjem a výdej zboží ve skladovém hospodářství",
    "Práce se čtečkou čárových kódů (skenerem)",
    "Kontrola dodacích listů a stavu zásob"
  ],
  accommodation: [
    "Možnost zajištění ubytování v blízkosti depa",
    "Příspěvek na ubytování ze strany zaměstnavatele"
  ],
  requirements: [
    "Fyzická zdatnost a spolehlivost",
    "Trestní bezúhonnost",
    "Ochota pracovat na dvousměnný provoz"
  ],
  advantages: [
    "Týden dovolené navíc (celkem 5 týdnů)",
    "Dotované závodní stravování",
    "Možnost záloh na mzdu"
  ],
  imageUrl: ""
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeVerifiedDiagnosticFile(filePath, data, label, encoding = "utf8") {
  try {
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      fs.writeFileSync(filePath, data, encoding);
    }
  } catch (error) {
    console.error(`[HEROHERO] Failed to write ${label}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return null;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`[HEROHERO] Failed to verify ${label}: file does not exist after write.`);
    return null;
  }

  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch (error) {
    console.error(`[HEROHERO] Failed to stat ${label}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return null;
  }

  console.error(`[HEROHERO] ${label} written successfully (${size} bytes): ${filePath}`);
  return { filePath, size };
}

function createDiagnostics() {
  return {
    consoleLogs: [],
    networkErrors: [],
    responseIssues: [],
    pageErrors: [],
    requests: [],
  };
}

function logStep(message) {
  console.log(`[HEROHERO] ${message}`);
}

async function pageSummary(page) {
  const url = page.url();
  const title = await page.title().catch(() => "N/A");
  return { url, title };
}

async function logPageState(page, label) {
  const state = await pageSummary(page);
  logStep(`${label} | URL=${state.url} | TITLE=${state.title}`);
  return state;
}

function isHeroHeroTrackedUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "herohero.co" ||
      hostname.endsWith(".herohero.co") ||
      hostname === "api.herohero.co" ||
      hostname.endsWith(".api.herohero.co") ||
      hostname === "l.herohero.co" ||
      hostname.endsWith(".l.herohero.co")
    );
  } catch (e) {
    return false;
  }
}

function attachDiagnostics(page, diagnostics) {
  page.on("console", msg => {
    const line = `[${msg.type()}] ${msg.text()}`;
    diagnostics.consoleLogs.push(line);
    console.log(`[BROWSER CONSOLE] ${line}`);
  });

  page.on("pageerror", err => {
    diagnostics.pageErrors.push(err.message);
    console.log(`[BROWSER ERROR] ${err.message}`);
  });

  page.on("request", req => {
    const url = req.url();
    const tracked = isHeroHeroTrackedUrl(url);
    const entry = {
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      tracked,
    };
    diagnostics.requests.push(entry);

    if (tracked) {
      const xhrFetchNote = entry.resourceType === "xhr" || entry.resourceType === "fetch" ? " [XHR/FETCH]" : "";
      console.log(`[REQUEST] ${entry.method} ${entry.url} | type=${entry.resourceType}${xhrFetchNote}`);
    }
  });

  page.on("requestfailed", req => {
    const failure = req.failure();
    const item = {
      method: req.method(),
      url: req.url(),
      errorText: failure ? failure.errorText : "Unknown",
    };
    diagnostics.networkErrors.push(item);
    console.log(`[NETWORK FAILED] ${item.method} ${item.url} | ${item.errorText}`);
  });

  page.on("response", async response => {
    const status = response.status();
    if (![401, 403, 500].includes(status)) {
      return;
    }

    const request = response.request();
    const url = response.url();
    let headers = {};
    let body = "";

    try {
      headers = response.headers();
    } catch (e) {
      headers = { error: e.message };
    }

    try {
      body = await response.text();
    } catch (e) {
      body = `[unreadable body: ${e.message}]`;
    }

    const record = {
      url,
      method: request.method(),
      status,
      headers,
      body,
      resourceType: request.resourceType(),
    };
    diagnostics.responseIssues.push(record);

    console.log(`[RESPONSE ${status}] ${record.method} ${record.url} | type=${record.resourceType}`);
    console.log(`[RESPONSE ${status}] headers=${JSON.stringify(headers)}`);
    console.log(`[RESPONSE ${status}] body=${body}`);
  });
}

async function collectEditorDiagnostics(page, initialUrl) {
  const state = await pageSummary(page);
  const html = await page.content().catch(() => "");
  const lowerHtml = html.toLowerCase();
  const currentUrl = state.url;

  const visibleEditables = await page
    .locator('div[contenteditable="true"], textarea, input[type="text"]')
    .evaluateAll(elements =>
      elements.map(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName.toLowerCase(),
          contentEditable: el.getAttribute("contenteditable"),
          type: el.getAttribute("type"),
          placeholder: el.getAttribute("placeholder"),
          ariaLabel: el.getAttribute("aria-label"),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          width: rect.width,
          height: rect.height,
        };
      })
    )
    .catch(() => []);

  const visibleEditorCount = visibleEditables.filter(el => el.visible).length;
  const loginIndicators = [
    "přihlásit",
    "prihlasit",
    "log in",
    "login",
    "sign in",
    "email",
    "heslo",
    "password",
  ];
  const errorIndicators = [
    "404",
    "not found",
    "error",
    "something went wrong",
    "došlo k chybě",
    "access denied",
    "forbidden",
  ];

  return {
    initialUrl,
    currentUrl,
    title: state.title,
    redirected: initialUrl !== currentUrl,
    reactEditorLoaded: visibleEditorCount > 0,
    visibleEditorCount,
    visibleEditables,
    heroHeroErrorPage: errorIndicators.some(token => lowerHtml.includes(token)),
    loginPageLikely:
      loginIndicators.some(token => lowerHtml.includes(token)) ||
      currentUrl.includes("/login") ||
      currentUrl.includes("mode=signIn"),
    htmlLength: html.length,
  };
}

async function saveFailureArtifacts(page, diagnostics, err, extra = {}) {
  ensureDir(CONFIG.DEBUG_DIR);
  const id = timestamp();
  const screenshotPath = path.join(CONFIG.DEBUG_DIR, `herohero-error-${id}.png`);
  const htmlPath = path.join(CONFIG.DEBUG_DIR, `herohero-error-${id}.html`);
  const consolePath = path.join(CONFIG.DEBUG_DIR, `herohero-console-${id}.log`);
  const networkPath = path.join(CONFIG.DEBUG_DIR, `herohero-network-errors-${id}.json`);
  const responseIssuesPath = path.join(CONFIG.DEBUG_DIR, `herohero-response-issues-${id}.json`);
  const statePath = path.join(CONFIG.DEBUG_DIR, `herohero-state-${id}.json`);

  let state = {};
  if (page && !page.isClosed()) {
    state = await pageSummary(page);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (error) {
      console.error(`[HEROHERO] Failed to write screenshot: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  const confirmedArtifacts = {};

  if (page && !page.isClosed()) {
    const htmlArtifact = writeVerifiedDiagnosticFile(htmlPath, await page.content().catch(() => ""), "html");
    if (htmlArtifact) {
      confirmedArtifacts.htmlPath = htmlArtifact.filePath;
    }

    if (fs.existsSync(screenshotPath)) {
      const screenshotSize = fs.statSync(screenshotPath).size;
      console.error(`[HEROHERO] screenshot written successfully (${screenshotSize} bytes): ${screenshotPath}`);
      confirmedArtifacts.screenshotPath = screenshotPath;
    } else {
      console.error("[HEROHERO] Failed to verify screenshot: file does not exist after write.");
    }
  }

  const consoleArtifact = writeVerifiedDiagnosticFile(consolePath, diagnostics.consoleLogs.join("\n"), "console");
  if (consoleArtifact) {
    confirmedArtifacts.consolePath = consoleArtifact.filePath;
  }

  const networkArtifact = writeVerifiedDiagnosticFile(networkPath, JSON.stringify(diagnostics.networkErrors, null, 2), "network");
  if (networkArtifact) {
    confirmedArtifacts.networkPath = networkArtifact.filePath;
  }

  const responseIssuesArtifact = writeVerifiedDiagnosticFile(
    responseIssuesPath,
    JSON.stringify(diagnostics.responseIssues, null, 2),
    "responseIssues"
  );
  if (responseIssuesArtifact) {
    confirmedArtifacts.responseIssuesPath = responseIssuesArtifact.filePath;
  }

  const statePayload = JSON.stringify(
    {
      error: err.message,
      page: state,
      extra,
      pageErrors: diagnostics.pageErrors,
      responseIssues: diagnostics.responseIssues,
      artifacts: confirmedArtifacts,
    },
    null,
    2
  );
  const stateArtifact = writeVerifiedDiagnosticFile(statePath, statePayload, "state");
  if (stateArtifact) {
    confirmedArtifacts.statePath = stateArtifact.filePath;
  }

  if (Object.keys(confirmedArtifacts).length > 0) {
    console.error(`[HEROHERO] Artefakty chyby uloženy:`);
    for (const [key, value] of Object.entries(confirmedArtifacts)) {
      console.error(`  ${key}: ${value}`);
    }
  }

  return confirmedArtifacts;
}

async function findAndClickButton(page, stepDescription, identifierPredicate) {
  logStep(`Hledám tlačítko pro: ${stepDescription}`);
  await logPageState(page, `Před hledáním tlačítka: ${stepDescription}`);

  const buttons = page.locator("button:visible");
  const count = await buttons.count();
  logStep(`Selector button:visible našel ${count} tlačítek.`);

  let targetButton = null;

  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    try {
      const text = (await btn.innerText()).trim();
      const ariaLabel = await btn.getAttribute("aria-label") || "";
      const className = await btn.getAttribute("class") || "";
      const type = await btn.getAttribute("type") || "";
      const form = await btn.getAttribute("form") || "";
      const title = await btn.getAttribute("title") || "";
      const isEnabled = await btn.isEnabled();
      const box = await btn.boundingBox();

      logStep(`Button #${i}: text="${text}" aria="${ariaLabel}" title="${title}" type="${type}" form="${form}" enabled=${isEnabled} class="${className}" box=${JSON.stringify(box)}`);

      if (isEnabled && await identifierPredicate({ btn, text, ariaLabel, title, type, form, className, index: i })) {
        targetButton = btn;
        logStep(`Vybrán button #${i} pro "${stepDescription}".`);
        break;
      }
    } catch (e) {
      logStep(`Button #${i} přeskočen: ${e.message}`);
    }
  }

  if (!targetButton) {
    throw new Error(`Nepodařilo se nalézt odpovídající tlačítko pro krok: ${stepDescription}`);
  }

  logStep(`Čekám na scroll tlačítka: ${stepDescription}`);
  await targetButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  logStep(`Klikám: ${stepDescription}`);
  await targetButton.click({ timeout: 10000 });
  await logPageState(page, `Po kliknutí: ${stepDescription}`);
}

async function handleCookieBannerIfPresent(page) {
  const candidateSelectors = [
    'button[data-testid="cookie-modal-agree"]',
    '[data-testid="cookie-modal-agree"]',
    'button:has-text("Povolit vše")',
    'button:has-text("Accept")',
  ];

  for (const selector of candidateSelectors) {
    if (page.isClosed()) return;
    logStep(`Kontroluji cookie selector: ${selector}`);
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);
    if (count > 0 && (await loc.first().isVisible().catch(() => false))) {
      logStep(`Klikám cookie banner přes selector: ${selector}`);
      await loc.first().click({ timeout: 5000 }).catch(err => {
        logStep(`Cookie klik selhal: ${err.message}`);
      });
      break;
    }
  }
}

async function nukeOverlays(page) {
  try {
    logStep("nukeOverlays: zavírám překryvy pouze přes Escape, bez zásahu do DOM.");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } catch (e) {
    logStep(`nukeOverlays přeskočeno: ${e.message}`);
  }
}

function normalizeTextLines(value) {
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  if (typeof value === "string") {
    const lines = value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    // Make někdy převede pole na jeden řetězec oddělený čárkami. Krátké
    // seznamy bezpečně rozbalíme, aby na HeroHero nevznikla jedna obří odrážka.
    if (lines.length === 1 && (lines[0].match(/,/g) || []).length >= 2) {
      return lines[0].split(/,\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/).map(line => line.trim()).filter(Boolean);
    }
    return lines;
  }

  return [];
}

function extractJobBodyLines(job) {
  const descriptionLines = normalizeTextLines(job.description);
  if (descriptionLines.length > 0) {
    return descriptionLines;
  }

  if (typeof job.text === "string" && job.text.trim()) {
    return normalizeTextLines(job.text);
  }

  if (typeof job.textHtml === "string" && job.textHtml.trim()) {
    return normalizeTextLines(
      job.textHtml
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );
  }

  return [];
}

async function isLoginScreen(page) {
  const emailInput = page.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
  if (await emailInput.isVisible().catch(() => false)) {
    return true;
  }

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible().catch(() => false)) {
    return true;
  }

  return false;
}

async function executeModalLogin(page, email, password) {
  logStep("Zahajuji proces přihlášení.");

  // HeroHero někdy ponechá více dialogů/overlayů v DOM. Vždy pracujeme s
  // posledním (horním) dialogem, jinak locator vybere pole pod overlayem.
  const emailDialog = page.getByRole("dialog").last();
  await emailDialog.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  const emailInput = emailDialog.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
  logStep("Čekám na nalezení email inputu.");
  try {
    await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
    logStep("Email input nalezen.");
  } catch (error) {
    logStep(`Email input se nepodařilo najít: ${error?.message || error}`);
    throw error;
  }

  try {
    logStep("Klikám do email inputu.");
    await emailInput.click({ force: true });
    logStep("Vyplňuji email.");
    await emailInput.fill(email);
    logStep("E-mail vyplněn.");
  } catch (error) {
    logStep(`Práce s email inputem selhala: ${error?.message || error}`);
    throw error;
  }

  // V login dialogu jsou před e-mailem také tlačítka "Pokračovat Googlem",
  // Facebookem a Applem. Textový selector proto omylem spouštěl Google OAuth.
  // Poslední tlačítko dialogu je šipka přímo u e-mailového pole.
  const nextBtn = emailDialog.locator("button").last();
  logStep("Čekám na pokračovací tlačítko po emailu.");
  try {
    await nextBtn.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
    logStep("Pokračovací tlačítko po emailu nalezeno.");
  } catch (error) {
    logStep(`Pokračovací tlačítko po emailu se nepodařilo najít: ${error?.message || error}`);
    throw error;
  }

  try {
    logStep("Klikám na pokračovací tlačítko po emailu.");
    await nextBtn.click({ timeout: 10000, force: true });
    logStep("Kliknuto na pokračovací tlačítko po emailu.");
  } catch (error) {
    logStep(`Kliknutí na pokračovací tlačítko po emailu selhalo: ${error?.message || error}`);
    throw error;
  }

  const passwordDialog = page.getByRole("dialog").last();
  const passwordInput = passwordDialog.locator('input[type="password"]').first();
  logStep("Čekám na nalezení password inputu.");
  try {
    await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
    logStep("Password input nalezen.");
  } catch (error) {
    logStep(`Password input se nepodařilo najít: ${error?.message || error}`);
    throw error;
  }

  try {
    logStep("Klikám do password inputu.");
    await passwordInput.click({ force: true });
    logStep("Vyplňuji heslo.");
    await passwordInput.fill(password);
    logStep("Heslo vyplněno.");
  } catch (error) {
    logStep(`Práce s password inputem selhala: ${error?.message || error}`);
    throw error;
  }

  const submitBtn = passwordDialog.locator('button[aria-label*="přihl" i], button[aria-label*="log in" i], button[aria-label*="sign in" i], button[title*="přihl" i], button:has-text("Pokračovat"), button:has-text("Přihlásit"), button:has-text("Log in"), button:has-text("Sign in")').first();
  logStep("Čekám na finální přihlašovací tlačítko.");
  try {
    await submitBtn.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
    logStep("Finální přihlašovací tlačítko nalezeno.");
  } catch (error) {
    logStep(`Finální přihlašovací tlačítko se nepodařilo najít: ${error?.message || error}`);
    throw error;
  }

  try {
    logStep("Klikám na finální přihlašovací tlačítko.");
    await submitBtn.click({ timeout: 10000, force: true });
    logStep("Kliknuto na finální přihlašovací tlačítko.");
  } catch (error) {
    logStep(`Kliknutí na finální přihlašovací tlačítko selhalo: ${error?.message || error}`);
    throw error;
  }

  logStep("Čekám na dokončení přihlášení.");
  try {
    // URL je /create už před odesláním formuláře, takže waitForURL by skončil
    // okamžitě. Autoritativní signál je až zmizení password inputu po odpovědi
    // /auth/v1/firebase/verify.
    await passwordInput.waitFor({ state: "hidden", timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION });
    logStep(`Přihlašovací formulář zmizel. Aktuální URL: ${page.url()}`);
  } catch (error) {
    logStep(`Dokončení loginu selhalo: ${error?.message || error}`);
    throw error;
  }

  const passwordStillVisible = await passwordInput.isVisible().catch(() => false);
  if (passwordStillVisible) {
    logStep("Password input po loginu je stále viditelný.");
    logStep("HeroHero login failed.");
    throw new Error("HeroHero login failed.");
  }
  logStep("Login potvrzen, login formulář zmizel.");
  await page.waitForTimeout(12000);
  logStep("HeroHero login úspěšně dokončen.");
}

function hasUsefulJobValue(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized) && !["neuvedeno", "neuvedena", "neuveden", "není uvedeno", "n/a", "unknown"].includes(normalized);
}

function formatSalaryLine(job) {
  const czk = hasUsefulJobValue(job.salary_czk_month) ? String(job.salary_czk_month).trim() : "";
  // HeroHero vždy zobrazuje jen přepočtenou měsíční částku v Kč. Neuvádíme
  // původní eura ani náhradní text, pokud mzda v nabídce chybí.
  if (!czk || !/(kč|czk)/i.test(czk)) return null;
  const monthly = /měs/i.test(czk) ? czk : `${czk} / měsíc`;
  return `💰 ${monthly}`;
}

function relevantJobEmoji(title) {
  const value = String(title || "").toLowerCase();
  if (/kuch|dish|nádob/.test(value)) return "🍴";
  if (/mas|řez|uzen/.test(value)) return "🥩";
  if (/květ|flower/.test(value)) return "🌷";
  if (/ovoce|zelenin|fruit|farm|skliz/.test(value)) return "🍎";
  if (/sklad|vychyst|picker|balen|logisti/.test(value)) return "📦";
  if (/hotel|resort|pokoj|housekeep|úklid/.test(value)) return "🏨";
  if (/výrob|potrav/.test(value)) return "🏭";
  return "💼";
}

function stripLeadingEmoji(value) {
  return String(value || "Pracovní nabídka").replace(/^\s*[\p{Extended_Pictographic}️]+\s*/u, "").trim();
}

function formatJobPost(job) {
  const title = stripLeadingEmoji(job.title || job.job_title);
  const titleEmoji = relevantJobEmoji(title);
  const salary = formatSalaryLine(job);
  const locationValue = job.location || job.country;
  const rawStartDate = job.startDate || job.start_date;
  const rawContractType = job.contractType || job.contract_type;
  const rawLanguage = hasUsefulJobValue(job.language) ? String(job.language).trim() : "";
  const directLink = hasUsefulJobValue(job.link) ? String(job.link).trim() : "";
  const lines = [`${titleEmoji} ${title}`];

  if (salary) lines.push(salary);
  if (hasUsefulJobValue(locationValue)) lines.push(`📍 ${locationValue}`);
  if (hasUsefulJobValue(rawStartDate)) lines.push(`⏰ Nástup ${rawStartDate}`);
  if (hasUsefulJobValue(rawContractType)) lines.push(`🕒 ${rawContractType}`);
  if (rawLanguage && !/^jazyk\s+neuveden$/i.test(rawLanguage)) {
    lines.push(`🌍 Jazyk ${rawLanguage.replace(/^jazyk\s*:?\s*/i, "")}`);
  }
  if (directLink) lines.push(`🔗 Odkaz: ${directLink}`);

  let output = lines.join("\n");

  const descriptionLines = extractJobBodyLines(job);
  if (descriptionLines.length > 0) {
    output += `\n\n🔧 Náplň práce\n`;
    for (const point of descriptionLines) output += `• ${point}\n`;
  }

  if (hasUsefulJobValue(job.accommodation)) {
    output += `\n🏠 Ubytování\n• ${job.accommodation}\n`;
  }

  if (hasUsefulJobValue(job.meals)) {
    output += `\n🍽️ Strava\n• ${job.meals}\n`;
  }

  const requirementLines = normalizeTextLines(job.requirements);
  if (requirementLines.length > 0) {
    output += `\n📋 Požadavky\n`;
    for (const point of requirementLines) output += `• ${point}\n`;
  }

  const advantageLines = normalizeTextLines(job.advantages);
  if (advantageLines.length > 0) {
    output += `\n⭐ Výhody\n`;
    for (const point of advantageLines) output += `• ${point}\n`;
  }

  output += `\nℹ️ Práci nezprostředkovávám, sdílím ověřené nabídky.`;

  return output.trim();
}

async function verifyCreateEditor(page, initialUrl) {
  logStep("Čekám na dostupný editor.");
  const editorLocator = page.locator('div[contenteditable="true"], textarea, input[type="text"]');

  for (let attempt = 1; attempt <= 6; attempt++) {
    await logPageState(page, `Kontrola editoru pokus ${attempt}`);
    await nukeOverlays(page);
    const count = await editorLocator.count().catch(() => 0);
    logStep(`Editor selector našel ${count} prvků.`);

    for (let i = 0; i < count; i++) {
      const el = editorLocator.nth(i);
      if (await el.isVisible().catch(() => false)) {
        logStep(`React/editor vstup nalezen na indexu ${i}.`);
        return el;
      }
    }

    await page.waitForTimeout(5000);
  }

  const details = await collectEditorDiagnostics(page, initialUrl);
  const reason = [
    "Editor se neotevřel.",
    `URL: ${details.currentUrl}`,
    `Title: ${details.title}`,
    `Redirect: ${details.redirected}`,
    `React editor loaded: ${details.reactEditorLoaded}`,
    `HeroHero error page: ${details.heroHeroErrorPage}`,
    `Login page likely: ${details.loginPageLikely}`,
    `Visible editor count: ${details.visibleEditorCount}`,
  ].join(" | ");

  const err = new Error(reason);
  err.heroHeroDetails = details;
  throw err;
}

async function uploadImageIfPresent(page, job) {
  if (!job.imagePath && !job.imageUrl && !job.image) {
    logStep("Obrázek není v jobu dostupný, krok nahrání obrázku přeskakuji.");
    return;
  }

  // Make může URL obrázku poslat nejen v imageUrl, ale také v poli image.
  // URL se nesmí ověřovat přes fs.existsSync; nejdřív ji stáhneme do /tmp.
  const imageSource = job.imagePath || job.imageUrl || job.image;
  let filePath = imageSource;
  let tempFilePath = null;

  if (typeof imageSource === "string" && /^https?:\/\//i.test(imageSource)) {
    tempFilePath = await downloadImageToTempFile(imageSource);
    filePath = tempFilePath;
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Soubor obrázku neexistuje: ${filePath}`);
  }

  logStep(`Hledám file input pro nahrání obrázku: ${filePath}`);
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count().catch(() => 0)) {
    await fileInput.setInputFiles(filePath);
    logStep("Obrázek nahrán přes input[type=file].");
    await page.waitForTimeout(3000);
  } else {
    logStep("File input nenalezen; zachovávám workflow bez vynuceného uploadu.");
  }

  if (tempFilePath) {
    fs.unlink(tempFilePath, () => {});
  }
}

async function downloadImageToTempFile(imageUrl) {
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error(`imageUrl není platná HTTP URL: ${imageUrl}`);
  }

  ensureDir(CONFIG.DEBUG_DIR);
  const url = new URL(imageUrl);
  const extension = path.extname(url.pathname) || ".png";
  const filePath = path.join(os.tmpdir(), `herohero-upload-${Date.now()}${extension}`);
  const client = url.protocol === "https:" ? https : http;
  let resolvedFilePath = filePath;

  logStep(`Stahuji obrázek pro upload: ${imageUrl}`);

  await new Promise((resolve, reject) => {
    const request = client.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectedUrl = new URL(response.headers.location, url).toString();
        logStep(`Obrázek přesměrován na: ${redirectedUrl}`);
        downloadImageToTempFile(redirectedUrl)
          .then(redirectedFilePath => {
            resolvedFilePath = redirectedFilePath;
            resolve();
          })
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Stažení obrázku selhalo: HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(filePath);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
  });

  logStep(`Obrázek stažen do: ${resolvedFilePath}`);
  return resolvedFilePath;
}

const HEROHERO_COUNTRY_CATEGORIES = {
  Austria: ["Rakousko"], Belgium: ["Belgie"], Denmark: ["Dánsko"], Estonia: ["Estonsko"],
  Finland: ["Finsko"], France: ["Francie"], Netherlands: ["Nizozemsko"], Ireland: ["Irsko"],
  Italy: ["Itálie"], Cyprus: ["Kypr"], Malta: ["Malta"], Germany: ["Německo"],
  Norway: ["Norsko"], Greece: ["Řecko"], Spain: ["Španělsko"], Sweden: ["Švédsko"]
};

function inferWorkCategory(job) {
  const value = `${job.job_title || ""} ${job.title || ""} ${job.description || ""}`.toLowerCase();
  if (/ovoce|zelenin|skliz|sběr|sber|jahod|fruit|vegetable|farm/.test(value)) return "Práce s ovocem/zeleninou";
  if (/farm|farma|zeměděl|zemedel|agricultur/.test(value)) return "Práce na farmách";
  if (/hotel|housekeep|pokoj|recep|resort|úklid|uklid/.test(value)) return "Hotelové práce";
  if (/kuch|číšník|cisnik|servír|servir|gastronom|dishwasher|nádob/.test(value)) return "Gastronomie";
  if (/sklad|logistik|picker|vychyst|balen|warehouse|order/.test(value)) return "Sklady";
  if (/výrob|vyrob|production|potravin|maso|řez|rez|factory/.test(value)) return "Továrny";
  return "";
}

async function selectCountryCategory(page, job) {
  const countryKey = String(job.country_code || job.country || "").trim();
  const labels = HEROHERO_COUNTRY_CATEGORIES[countryKey] || (countryKey ? [countryKey] : []);
  if (labels.length === 0) {
    logStep("Země chybí, výběr kategorie přeskakuji.");
    return false;
  }

  logStep(`Vybírám kategorii země, podporované názvy: ${labels.join(" / ")}`);

  // HeroHero seznam kategorií nenačte, dokud uživatel neotevře pole
  // „Přidat kategorii“. Přímé čekání na název země proto končilo timeoutem.
  const categoryOpeners = ["Přidat kategorii", "Add category"];
  for (const openerText of categoryOpeners) {
    const openers = page.getByText(openerText, { exact: true });
    for (let index = 0; index < await openers.count(); index++) {
      const opener = openers.nth(index);
      if (await opener.isVisible().catch(() => false)) {
        await opener.click({ timeout: 10000 }).catch(error => {
          logStep(`Otevření seznamu kategorií přes „${openerText}“ selhalo: ${error.message}`);
        });
        await page.waitForTimeout(800);
        break;
      }
    }
  }

  // Krátce prohledáváme všechny povolené názvy a klikáme jen na viditelnou
  // kategorii.
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const matches = page.getByText(label, { exact: true });
      for (let index = 0; index < await matches.count(); index++) {
        const candidate = matches.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click({ timeout: 10000 });
          await page.waitForTimeout(1000);
          logStep(`Kategorie země vybrána: ${label}`);
          return true;
        }
      }
    }
    await page.waitForTimeout(400);
  }

  // Kategorie je užitečná, ale její dočasná nedostupnost nesmí zablokovat
  // zveřejnění celé dávky pracovních nabídek.
  logStep(`Kategorie země nebyla dostupná (${labels.join(" / ")}); pokračuji bez kategorie.`);
  return false;
}

async function selectWorkCategory(page, job) {
  const label = job.work_category || job.job_category || inferWorkCategory(job);
  if (!label) { logStep("Typ práce se nepodařilo určit, kategorii nepřidávám."); return false; }
  const opener = page.getByText("Přidat kategorii", { exact: true }).or(page.getByText("Add category", { exact: true })).first();
  if (await opener.isVisible().catch(() => false)) await opener.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  const matches = page.getByText(label, { exact: true });
  for (let i = 0; i < await matches.count(); i++) {
    const match = matches.nth(i);
    if (await match.isVisible().catch(() => false)) { await match.click({ timeout: 10000 }); logStep(`Kategorie práce vybrána: ${label}`); return true; }
  }
  logStep(`Kategorie práce nebyla dostupná: ${label}`);
  return false;
}

async function createHeroHeroPost(page, job) {
  logStep(`Vytvářím příspěvek pro pozici: ${job.title}`);
  const createUrl = "https://herohero.co/create";

  // Nejdřív vždy zkus existující session. Otevření mode=signIn při každém
  // requestu zahazovalo výhodu persistentního profilu a nutilo nový login.
  logStep(`Otevírám stránku s existující session: ${createUrl}`);
  await page.goto(createUrl, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
  });
  await logPageState(page, "Po otevření /create s existující session");

  await handleCookieBannerIfPresent(page);

  logStep("Čekám na stabilizaci SPA rozhraní.");
  await page.waitForTimeout(3000);

  // Na odhlášené stránce /create je login zobrazen jako modal nad hláškou
  // "K této stránce nemáš přístup". Escape modal zavře, proto se login musí
  // detekovat ještě před jakýmkoli zavíráním překryvů.
  const loginScreenDetected = await isLoginScreen(page);
  logStep(`isLoginScreen(page) = ${loginScreenDetected}`);
  let loginPerformed = false;
  if (page.url().includes("mode=signIn") || page.url().includes("/login") || loginScreenDetected) {
    const email = process.env.HEROHERO_EMAIL;
    const password = process.env.HEROHERO_PASSWORD;

    if (!email || !password) {
      throw new Error("HeroHero přesměroval na přihlášení, ale chybí HEROHERO_EMAIL a HEROHERO_PASSWORD.");
    }

    logStep("Používám HeroHero přihlašovací údaje.");
    logStep("Starting executeModalLogin");
    await executeModalLogin(page, email, password);
    loginPerformed = true;
  }

  // HeroHero po přihlášení často ponechá původní access-denied komponentu na
  // stejné URL. Nová navigace načte stránku už s čerstvou autorizací.
  if (loginPerformed || !page.url().includes("/create")) {
    logStep(`Otevírám stránku: ${createUrl}`);
    await page.goto(createUrl, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });
  }
  await logPageState(page, "Po otevření /create");

  await handleCookieBannerIfPresent(page);
  await page.waitForTimeout(3000);
  await nukeOverlays(page);

  let titleInput;
  try {
    titleInput = await verifyCreateEditor(page, createUrl);
  } catch (error) {
    // Persistentní profil může po předchozím publikování obsahovat relaci,
    // která je sice přihlášená, ale /create vrátí „K této stránce nemáš
    // přístup“. V takovém případě login modal není vidět, takže běžná
    // detekce přihlášení nestačí. Bezpečně obnovíme relaci ještě před tím,
    // než se začne vyplňovat formulář; žádný příspěvek tedy nemůže vzniknout
    // dvakrát.
    if (!error?.heroHeroDetails?.heroHeroErrorPage) {
      throw error;
    }

    const email = process.env.HEROHERO_EMAIL;
    const password = process.env.HEROHERO_PASSWORD;
    if (!email || !password) {
      throw error;
    }

    logStep("/create vrátil stránku bez oprávnění. Obnovuji relaci autora.");
    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto(`${createUrl}?mode=signIn`, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });
    // Cookie dialog se po čisté navigaci vykreslí až s krátkým zpožděním.
    // Bez tohoto čekání ho handler mine a executeModalLogin pak omylem vezme
    // cookie dialog jako přihlašovací dialog.
    await page.waitForTimeout(3000);
    await handleCookieBannerIfPresent(page);

    // HeroHero ukládá část přihlášení mimo cookies/localStorage. Po jejich
    // vyčištění proto může být editor znovu dostupný rovnou a žádný login
    // dialog se neotevře. Login provádíme jen tehdy, když je formulář opravdu
    // viditelný; jinak pokračujeme s obnoveným editorem.
    const recoveryLoginVisible = await isLoginScreen(page);
    logStep(`Recovery isLoginScreen(page) = ${recoveryLoginVisible}`);
    if (recoveryLoginVisible) {
      await executeModalLogin(page, email, password);
      await page.goto(createUrl, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
      });
    } else {
      logStep("Přihlašovací dialog se neotevřel; ověřuji obnovený editor bez dalšího loginu.");
      if (!page.url().includes("/create")) {
        await page.goto(createUrl, {
          waitUntil: "domcontentloaded",
          timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
        });
      }
    }
    await handleCookieBannerIfPresent(page);
    await page.waitForTimeout(3000);
    await nukeOverlays(page);
    titleInput = await verifyCreateEditor(page, createUrl);
  }

  await uploadImageIfPresent(page, job);

  logStep("Vyplňuji nadpis.");
  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  const cleanTitle = stripLeadingEmoji(job.title || job.job_title || "Nová pracovní nabídka");
  await page.keyboard.type(`${relevantJobEmoji(cleanTitle)} ${cleanTitle}`, { delay: 35 });
  await logPageState(page, "Po vyplnění nadpisu");

  await page.waitForTimeout(10000);

  logStep("Vkládám formátovaný popisek nabídky.");
  const formattedText = formatJobPost(job);
  // Globální keyboard.type se v dynamickém editoru po jeho překreslení může
  // zaseknout nebo psát do titulku. Tělo příspěvku má vlastní contenteditable
  // pole; Playwright ho vyplní přímo a atomicky.
  // Titulek je na HeroHero také textarea a je v DOM dříve než rich-text tělo.
  // Smíšený selector s .first() proto omylem přepisoval titulek popiskem a
  // formulář zůstal neplatný. Tělo příspěvku je samostatný contenteditable.
  let bodyEditor = page.locator('div[contenteditable="true"]:visible').first();
  if ((await bodyEditor.count()) === 0) {
    // Záložní varianta pro případ změny HeroHero editoru: poslední textarea je
    // tělo, zatímco první patří titulku.
    bodyEditor = page.locator('textarea:visible').last();
  }
  await bodyEditor.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.EDITOR_WAIT });
  // HeroHero používá reaktivní rich-text editor. Samotné locator.fill() sice
  // změnilo DOM, ale aplikace změnu nezaregistrovala a tlačítko Další zůstalo
  // disabled. Vložení přes aktivní editor vyvolá skutečný input event bez
  // pomalého psaní znak po znaku.
  await bodyEditor.click({ force: true });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(formattedText);

  const insertedBody = (await bodyEditor.getAttribute("contenteditable")) === "true"
    ? (await bodyEditor.innerText()).trim()
    : (await bodyEditor.inputValue()).trim();
  if (!insertedBody) {
    throw new Error("HeroHero editor po vložení neobsahuje žádný text.");
  }
  logStep(`Popisek vložen do editoru (${insertedBody.length} znaků).`);
  await logPageState(page, "Po vyplnění popisku");

  await page.waitForTimeout(10000);
  await findAndClickButton(page, "První šipka (Editor -> Možnosti příspěvku)", async ({ text, type, form }) => {
    return type === "submit" && form === "create-post-form" && text === "";
  });
  await page.waitForTimeout(10000);

  await selectCountryCategory(page, job);
  await selectWorkCategory(page, job);

  // Na obrazovce Možnosti příspěvku je šipka router-link (<a>), ne <button>.
  // Geometrické hledání mezi buttony ji proto nikdy nemohlo najít.
  const previewLink = page.locator('a[href="/create/post/preview"]:visible').first();
  await previewLink.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.EDITOR_WAIT });
  logStep("Klikám: Druhá šipka (Možnosti příspěvku -> Náhled)");
  await previewLink.click({ timeout: 10000 });
  await logPageState(page, "Po kliknutí: Druhá šipka (Možnosti příspěvku -> Náhled)");
  await page.waitForTimeout(10000);

  await findAndClickButton(page, "Finální tlačítko Sdílet", async ({ text }) => {
    return text.toLowerCase().includes("sdílet") || text.toLowerCase().includes("share");
  });

  await page.waitForTimeout(40000);
  await logPageState(page, "Po odeslání příspěvku");
  logStep(`Příspěvek "${job.title}" úspěšně odeslán.`);
}

async function publishHeroHero(inputJob) {
  const job = (!inputJob || Object.keys(inputJob).length === 0 || !inputJob.title)
    ? DEFAULT_TEST_JOB
    : inputJob;

  logStep(`Používám data pro pozici: ${job.title}`);
  logStep(`Debug dir: ${CONFIG.DEBUG_DIR}`);
  logStep(`Persistent profile: ${CONFIG.PROFILE_DIR}`);

  ensureDir(CONFIG.DEBUG_DIR);
  ensureDir(CONFIG.PROFILE_DIR);

  const diagnostics = createDiagnostics();
  let context;
  let page;

  try {
    context = await chromium.launchPersistentContext(CONFIG.PROFILE_DIR, {
      headless: CONFIG.HEADLESS,
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    page = context.pages()[0] || await context.newPage();
    attachDiagnostics(page, diagnostics);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await createHeroHeroPost(page, job);
    return { success: true, job };
  } catch (err) {
    const extra = err.heroHeroDetails || {};
    const artifacts = await saveFailureArtifacts(page, diagnostics, err, extra).catch(saveErr => {
      console.error(`[HEROHERO] Nepodařilo se uložit diagnostiku: ${saveErr.message}`);
      return null;
    });
    err.message = `${err.message}${artifacts ? ` | Diagnostika: ${JSON.stringify(artifacts)}` : ""}`;
    throw err;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// Make může poslat několik položek téměř současně. Chromium nedovolí dvěma
// procesům používat stejný persistentní profil; lokální fronta je serializuje.
// HTTP modul ale může dlouho čekající požadavek zopakovat. Bez idempotence by
// se retry zařadil znovu a publikoval totožný příspěvek podruhé.
let publishQueue = Promise.resolve();
const inFlightPublishes = new Map();
const recentPublishes = new Map();
const PUBLISH_DEDUPE_TTL_MS = 30 * 60 * 1000;

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function publishKey(inputJob) {
  const job = inputJob || {};
  // Stejná nabídka může při opakovaném běhu dostat lehce jiný text od AI.
  // Zdrojový odkaz je proto stabilnější idempotency klíč než celý JSON.
  const identity = hasUsefulJobValue(job.link)
    ? `link:${String(job.link).trim().toLowerCase()}`
    : stableSerialize({
        title: job.job_title || job.title || "",
        country: job.country_code || job.country || "",
        salary: job.salary || "",
        location: job.location || "",
      });
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function pruneRecentPublishes(now = Date.now()) {
  for (const [key, item] of recentPublishes) {
    if (item.expiresAt <= now) recentPublishes.delete(key);
  }
}

module.exports = function queuedPublishHeroHero(inputJob) {
  const key = publishKey(inputJob);
  const now = Date.now();
  pruneRecentPublishes(now);

  const recent = recentPublishes.get(key);
  if (recent) {
    logStep(`Duplicitní požadavek ${key.slice(0, 10)} vrací nedávný úspěšný výsledek.`);
    return Promise.resolve(recent.result);
  }

  const existing = inFlightPublishes.get(key);
  if (existing) {
    logStep(`Duplicitní požadavek ${key.slice(0, 10)} se připojuje k probíhající publikaci.`);
    return existing;
  }

  const run = publishQueue
    .then(() => publishHeroHero(inputJob))
    .then(result => {
      recentPublishes.set(key, {
        result,
        expiresAt: Date.now() + PUBLISH_DEDUPE_TTL_MS,
      });
      return result;
    })
    .finally(() => {
      inFlightPublishes.delete(key);
    });

  inFlightPublishes.set(key, run);
  publishQueue = run.catch(() => {});
  return run;
};
