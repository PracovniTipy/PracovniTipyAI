const { chromium } = require("playwright");
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
      const box = await btn.boundingBox();

      logStep(`Button #${i}: text="${text}" aria="${ariaLabel}" class="${className}" box=${JSON.stringify(box)}`);

      if (await identifierPredicate({ btn, text, ariaLabel, className, index: i })) {
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
    return value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
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

  const emailInput = page.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
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
    await emailInput.click();
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
  const nextBtn = page.getByRole("dialog").locator("button").last();
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
    await nextBtn.click({ timeout: 10000 });
    logStep("Kliknuto na pokračovací tlačítko po emailu.");
  } catch (error) {
    logStep(`Kliknutí na pokračovací tlačítko po emailu selhalo: ${error?.message || error}`);
    throw error;
  }

  const passwordInput = page.locator('input[type="password"]');
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
    await passwordInput.click();
    logStep("Vyplňuji heslo.");
    await passwordInput.fill(password);
    logStep("Heslo vyplněno.");
  } catch (error) {
    logStep(`Práce s password inputem selhala: ${error?.message || error}`);
    throw error;
  }

  const submitBtn = page.locator('button[aria-label*="přihl" i], button[aria-label*="log in" i], button[aria-label*="sign in" i], button[title*="přihl" i], button:has-text("Pokračovat"), button:has-text("Přihlásit"), button:has-text("Log in"), button:has-text("Sign in")').first();
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
    await submitBtn.click({ timeout: 10000 });
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

function formatJobPost(job) {
  const title = job.title || "Pracovní nabídka";
  const salary = job.salary ? `💰 cca ${job.salary} Kč / měsíc` : null;
  const location = job.location ? `📍 ${job.location}` : null;
  const startDate = job.startDate ? `⏰ Nástup ${job.startDate}` : null;
  const contractType = job.contractType ? `🕒 ${job.contractType}` : null;
  const language = job.language ? `🌍 Jazyk: ${job.language}` : null;
  const link = job.link ? `🔗 Odkaz: ${job.link}` : null;

  let output = `${title}\n\n`;
  if (salary) output += `${salary}\n\n`;
  if (location) output += `${location}\n`;
  if (startDate) output += `${startDate}\n`;
  if (contractType) output += `${contractType}\n`;
  if (language) output += `${language}\n`;
  if (link) output += `${link}\n`;

  const descriptionLines = extractJobBodyLines(job);
  if (descriptionLines.length > 0) {
    output += `\n🔧 Náplň práce\n\n`;
    for (const point of descriptionLines) output += `• ${point}\n`;
  }

  const accommodationLines = normalizeTextLines(job.accommodation);
  if (accommodationLines.length > 0) {
    output += `\n🏠 Ubytování\n\n`;
    for (const point of accommodationLines) output += `• ${point}\n`;
  }

  const requirementLines = normalizeTextLines(job.requirements);
  if (requirementLines.length > 0) {
    output += `\n📋 Požadavky\n\n`;
    for (const point of requirementLines) output += `• ${point}\n`;
  }

  const advantageLines = normalizeTextLines(job.advantages);
  if (advantageLines.length > 0) {
    output += `\n⭐ Výhody\n\n`;
    for (const point of advantageLines) output += `• ${point}\n`;
  }

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

  let filePath = job.imagePath || job.image;
  let tempFilePath = null;

  if (!filePath && job.imageUrl) {
    tempFilePath = await downloadImageToTempFile(job.imageUrl);
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

  const titleInput = await verifyCreateEditor(page, createUrl);

  await uploadImageIfPresent(page, job);

  logStep("Vyplňuji nadpis.");
  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  await page.keyboard.type(job.title || "Nová pracovní nabídka", { delay: 35 });
  await logPageState(page, "Po vyplnění nadpisu");

  await page.waitForTimeout(10000);

  logStep("Vkládám formátovaný popisek nabídky.");
  const formattedText = formatJobPost(job);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  const lines = formattedText.split("\n");
  for (const line of lines) {
    await page.keyboard.type(line, { delay: 10 });
    await page.keyboard.press("Enter");
  }
  await logPageState(page, "Po vyplnění popisku");

  await page.waitForTimeout(10000);
  await findAndClickButton(page, "První šipka (Editor -> Možnosti příspěvku)", async ({ btn, text }) => {
    const box = await btn.boundingBox();
    return box && box.y < 100 && box.x > 800 && text === "";
  });
  await page.waitForTimeout(10000);

  await findAndClickButton(page, "Druhá šipka (Možnosti příspěvku -> Náhled)", async ({ btn, text }) => {
    const box = await btn.boundingBox();
    return box && box.y < 100 && box.x > 800 && text === "";
  });
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
let publishQueue = Promise.resolve();

module.exports = function queuedPublishHeroHero(inputJob) {
  const run = publishQueue.then(() => publishHeroHero(inputJob));
  publishQueue = run.catch(() => {});
  return run;
};
