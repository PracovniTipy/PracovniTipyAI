const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - FULL DIAGNOSTIC RUNNER");
console.log("==========================================");

const DEBUG_DIR = path.join(__dirname, "debug");
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

const CONFIG = {
  STORAGE_STATE_PATH: path.join(__dirname, "storageState.json"),
  HEADLESS: process.env.HEADLESS !== "false",
  DEBUG: true,
  TIMEOUTS: {
    PAGE_NAVIGATION: 35000,
    SPA_HYDRATION: 2000,
    ELEMENT_WAIT: 10000,
    LOGIN_WAIT: 15000,
  },
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  LOCALE: "cs-CZ",
};

// Globální diagnostický stav
const DIAG = {
  startTime: Date.now(),
  steps: [],
  urlHistory: [],
  networkLogs: [],
  consoleLogs: [],
  cookiesHistory: [],
  domSnapshots: [],
  timings: [],
  oauthDetected: false,
  oauthDetails: null,
  errors: [],
  lastSuccessfulStep: "INIT",
  firstFailedStep: null,
  cookieStatus: {
    foundBanner: false,
    usedSelector: "N/A",
    matchedCount: 0,
    clicked: false,
    disappeared: false,
    cookiesBefore: 0,
    cookiesAfter: 0,
  },
  safeClickStatus: [],
};

function writeJsonDebug(filename, data) {
  try {
    fs.writeFileSync(
      path.join(DEBUG_DIR, filename),
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error(`[DIAG ERROR] Nelze zapsat ${filename}:`, e.message);
  }
}

function appendConsoleLog(type, msg) {
  const logLine = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}\n`;
  DIAG.consoleLogs.push({ time: new Date().toISOString(), type, msg });
  try {
    fs.appendFileSync(path.join(DEBUG_DIR, "console.log"), logLine, "utf8");
  } catch (e) {}
}

function logDiag(msg, data = null) {
  console.log(`🔍 [DIAG] ${msg}`);
  appendConsoleLog("info", msg + (data ? ` | ${JSON.stringify(data)}` : ""));
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.warn(`[WARN] Nelze smazat dočasný soubor ${filePath}:`, e.message);
  }
}

function isValidJson(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

async function saveStorageStateAtomically(context, targetPath) {
  if (!context) return;
  const tempPath = `${targetPath}.tmp`;
  try {
    await context.storageState({ path: tempPath });
    if (fs.existsSync(tempPath)) {
      fs.renameSync(tempPath, targetPath);
      console.log(`💾 Relace úspěšně uložena do: ${targetPath}`);
    }
  } catch (err) {
    safeUnlink(tempPath);
    console.error(`❌ Selhal zápis relace: ${err.message}`);
  }
}

// 1. STORAGE STATE DIAGNOSTIKA
function diagnoseStorageState() {
  logDiag("--- DIAGNOSTIKA STORAGE STATE ---");
  const exists = fs.existsSync(CONFIG.STORAGE_STATE_PATH);
  const info = {
    exists,
    absolutePath: CONFIG.STORAGE_STATE_PATH,
    sizeBytes: exists ? fs.statSync(CONFIG.STORAGE_STATE_PATH).size : 0,
    mtime: exists ? fs.statSync(CONFIG.STORAGE_STATE_PATH).mtime : null,
    isValidJson: isValidJson(CONFIG.STORAGE_STATE_PATH),
    cookiesCount: 0,
    originsCount: 0,
    localStorageKeys: [],
    sessionStorageKeys: [],
  };

  if (info.isValidJson) {
    try {
      const content = JSON.parse(
        fs.readFileSync(CONFIG.STORAGE_STATE_PATH, "utf8")
      );
      info.cookiesCount = content.cookies ? content.cookies.length : 0;
      info.originsCount = content.origins ? content.origins.length : 0;
      if (content.origins) {
        content.origins.forEach((o) => {
          if (o.localStorage) {
            info.localStorageKeys.push(
              ...o.localStorage.map((l) => `${o.origin}:${l.name}`)
            );
          }
        });
      }
    } catch (e) {
      logDiag("Chyba při čtení obsahu storageState:", e.message);
    }
  }

  writeJsonDebug("storage-state-info.json", info);
  logDiag("Storage state info:", info);
  return info;
}

// 2. BROWSER ENVIRONMENT DIAGNOSTIKA
async function diagnoseEnvironment(browser) {
  logDiag("--- DIAGNOSTIKA PROSTŘEDÍ ---");
  let playwrightVer = "N/A";
  try {
    playwrightVer = require("playwright/package.json").version;
  } catch (e) {}

  const envInfo = {
    playwrightVersion: playwrightVer,
    chromiumVersion: browser ? browser.version() : "N/A",
    nodeVersion: process.version,
    osPlatform: os.platform(),
    osRelease: os.release(),
    userAgent: CONFIG.USER_AGENT,
    viewport: CONFIG.VIEWPORT,
    locale: CONFIG.LOCALE,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    headless: CONFIG.HEADLESS,
  };

  writeJsonDebug("browser-info.json", envInfo);
  logDiag("Environment Info:", envInfo);
}

// SPOLEČNÝ DIAGNOSTICKÝ SNÍMEK STAVU
async function captureStateSnapshot(page, stepName) {
  if (!page || page.isClosed()) {
    logDiag(
      `⚠️ Nelze provést captureStateSnapshot (${stepName}) – stránka je zavřená.`
    );
    return null;
  }

  const startTime = Date.now();
  logDiag(`📸 Zahajuji diagnostický snímek kroku: ${stepName}`);

  const url = page.url();
  const title = await page.title().catch(() => "N/A");
  DIAG.urlHistory.push({
    time: new Date().toISOString(),
    step: stepName,
    url,
    title,
  });

  const pageState = await page
    .evaluate(() => ({
      readyState: document.readyState,
      visibilityState: document.visibilityState,
    }))
    .catch(() => ({ readyState: "error", visibilityState: "error" }));

  if (page.isClosed()) return null;

  const cookies = await page.context().cookies().catch(() => []);
  const cookieDomains = Array.from(new Set(cookies.map((c) => c.domain)));
  const hasHeroHeroAuth = cookies.some(
    (c) =>
      c.domain.includes("herohero") &&
      (c.name.includes("auth") ||
        c.name.includes("session") ||
        c.name.includes("token"))
  );
  const hasFirebaseAuth = cookies.some(
    (c) => c.name.includes("firebase") || c.domain.includes("firebase")
  );

  const storageKeys = await page
    .evaluate(() => {
      try {
        return {
          localKeys: Object.keys(localStorage),
          sessionKeys: Object.keys(sessionStorage),
        };
      } catch (e) {
        return { localKeys: [], sessionKeys: [] };
      }
    })
    .catch(() => ({ localKeys: [], sessionKeys: [] }));

  if (page.isClosed()) return null;

  const frames = page.frames();
  const iframeInfo = frames.map((f) => ({ name: f.name(), url: f.url() }));

  const lowerUrl = url.toLowerCase();
  const isOAuth = [
    "appleid.apple.com",
    "accounts.google.com",
    "facebook.com",
    "oauth",
    "firebase",
    "identity",
  ].some((domain) => lowerUrl.includes(domain));

  const screenshotPath = path.join(DEBUG_DIR, `${stepName}.png`);
  await page
    .screenshot({ path: screenshotPath, fullPage: true })
    .catch((err) => logDiag(`Screenshot failed: ${err.message}`));

  const htmlPath = path.join(DEBUG_DIR, `${stepName}.html`);
  const htmlContent = await page.content().catch(() => "N/A");
  try {
    fs.writeFileSync(htmlPath, htmlContent, "utf8");
  } catch (e) {}

  const snapshotData = {
    stepName,
    timestamp: new Date().toISOString(),
    url,
    title,
    pageState,
    cookiesCount: cookies.length,
    cookieDomains,
    hasHeroHeroAuth,
    hasFirebaseAuth,
    storageKeys,
    iframeCount: frames.length,
    iframes: iframeInfo,
    isOAuth,
  };

  DIAG.steps.push(snapshotData);

  if (isOAuth) {
    DIAG.oauthDetected = true;
    DIAG.oauthDetails = snapshotData;
    logDiag(`🚨 [CRITICAL OAUTH DETECTED] Stránka přešla na OAuth URL: ${url}`);
    writeJsonDebug("oauth-capture.json", {
      snapshotData,
      cookies,
      htmlSnippet: htmlContent.slice(0, 2000),
    });
  }

  const duration = Date.now() - startTime;
  DIAG.timings.push({
    stepName,
    durationMs: duration,
    timestamp: new Date().toISOString(),
  });
  logDiag(
    `✅ Snímek kroku ${stepName} dokončen (${duration}ms). URL: ${url}`
  );

  return snapshotData;
}

// DOM ANALÝZA MODALU
async function analyzeModalDOM(page) {
  if (!page || page.isClosed()) return [];
  logDiag("--- PROVÁDÍM KOMPLETNÍ ANALÝZU DOM (LOGIN MODAL) ---");

  const domData = await page
    .evaluate(() => {
      try {
        const elements = Array.from(
          document.querySelectorAll(
            "button, input, textarea, form, a, iframe"
          )
        );
        return elements.map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            tagName: el.tagName.toLowerCase(),
            innerText: (el.innerText || el.value || "").trim().slice(0, 100),
            id: el.id || "",
            className: el.className || "",
            name: el.getAttribute("name") || "",
            type: el.getAttribute("type") || "",
            placeholder: el.getAttribute("placeholder") || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            role: el.getAttribute("role") || "",
            dataTestId: el.getAttribute("data-testid") || "",
            disabled: el.disabled || false,
            hidden:
              el.hidden ||
              style.display === "none" ||
              style.visibility === "hidden",
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden",
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            outerHTML: el.outerHTML.slice(0, 250),
          };
        });
      } catch (e) {
        return [];
      }
    })
    .catch((err) => {
      logDiag("Chyba při analýze DOMu:", err.message);
      return [];
    });

  writeJsonDebug("dom.json", domData);
  logDiag(`Nalezeno ${domData.length} klíčových prvků v DOMu.`);
  return domData;
}

// EVENT LISTENERS
function attachEventListeners(page) {
  if (!page || page.isClosed()) return;

  page.on("request", (req) => {
    DIAG.networkLogs.push({
      type: "request",
      url: req.url(),
      method: req.method(),
      time: new Date().toISOString(),
    });
  });

  page.on("response", (res) => {
    const status = res.status();
    const headers = res.headers();
    const item = {
      type: "response",
      url: res.url(),
      status,
      location: headers["location"] || null,
      time: new Date().toISOString(),
    };
    DIAG.networkLogs.push(item);

    if ([301, 302, 307, 308, 401, 403, 404, 429, 500].includes(status)) {
      logDiag(
        `🌐 [NETWORK ALERT ${status}] ${res.url()} -> Location: ${
          headers["location"] || "N/A"
        }`
      );
    }
  });

  page.on("requestfailed", (req) => {
    const failure = req.failure();
    DIAG.networkLogs.push({
      type: "requestfailed",
      url: req.url(),
      errorText: failure ? failure.errorText : "Unknown",
      time: new Date().toISOString(),
    });
    logDiag(
      `❌ [NETWORK FAIL] ${req.url()} (${
        failure ? failure.errorText : "N/A"
      })`
    );
  });

  page.on("console", (msg) =>
    appendConsoleLog(`browser-${msg.type()}`, msg.text())
  );

  page.on("pageerror", (err) => {
    appendConsoleLog("pageerror", err.message);
    logDiag(`🔥 [PAGE ERROR] ${err.message}`);
  });

  page.on("dialog", async (dialog) => {
    logDiag(`💬 [DIALOG] ${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });

  page.on("popup", (popup) =>
    logDiag(`🪟 [POPUP DETECTED] Nové okno/popup: ${popup.url()}`)
  );

  if (page.context()) {
    page
      .context()
      .on("page", (newPage) =>
        logDiag(`📄 [NEW PAGE/TARGET CREATED] ${newPage.url()}`)
      );
  }
}

/**
 * Pomocná diagnostika pro podrobné logování elementu před a po kliknutí
 */
async function logElementDetails(locator, stageDescription) {
  try {
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      console.log(`📝 [LOG ${stageDescription}] Element nebyl v DOMu nalezen.`);
      return null;
    }

    const info = await locator
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          url: window.location.href,
          outerHTML: el.outerHTML.slice(0, 300),
          dataTestId: el.getAttribute("data-testid") || "N/A",
          id: el.id || "N/A",
          className: el.className || "N/A",
          text: (el.innerText || el.value || "").trim(),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          enabled: !el.disabled,
          attached: document.body.contains(el),
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      })
      .catch(() => null);

    if (!info) return null;

    console.log(`📌 [LOG ${stageDescription}]`);
    console.log(`   ├─ Match count: ${count}`);
    console.log(`   ├─ URL: ${info.url}`);
    console.log(`   ├─ Text/Value: "${info.text}"`);
    console.log(`   ├─ Selector/Tag HTML: ${info.outerHTML}`);
    console.log(
      `   ├─ Visible: ${info.visible} | Enabled: ${info.enabled} | Attached: ${info.attached}`
    );
    console.log(
      `   ├─ data-testid: ${info.dataTestId} | id: ${info.id} | class: ${info.className}`
    );
    console.log(`   └─ BoundingBox: ${JSON.stringify(info.boundingBox)}`);

    return info;
  } catch (e) {
    console.warn(
      `⚠️ Logování elementu selhalo (${stageDescription}):`,
      e.message
    );
    return null;
  }
}

/**
 * Univerzální safeClick funkce.
 */
async function safeClick(
  page,
  locator,
  description,
  options = { expectDisappear: false }
) {
  if (!page || page.isClosed()) return false;

  logDiag(`👉 [CLICK DIAG] Připravuji kliknutí na: "${description}"`);

  const count = await locator.count().catch(() => 0);
  if (count === 0) {
    logDiag(
      `⚠️ [CLICK DIAG] Element nebyl v DOMu nalezen (count == 0): "${description}"`
    );
    DIAG.safeClickStatus.push({
      description,
      locatorValid: false,
      clickSuccess: false,
      reason: "Count is 0",
    });
    return false;
  }

  if (count > 1) {
    const elementsDetails = await locator
      .evaluateAll((els) =>
        els.map((el) => ({
          tagName: el.tagName.toLowerCase(),
          dataTestId: el.getAttribute("data-testid") || "N/A",
          className: el.className || "N/A",
          text: (el.innerText || el.value || "").trim(),
        }))
      )
      .catch(() => []);

    console.error(
      `❌ [STRICT MODE VIOLATION] Locator vrací ${count} elementů:`,
      JSON.stringify(elementsDetails, null, 2)
    );
    DIAG.safeClickStatus.push({
      description,
      locatorValid: false,
      clickSuccess: false,
      reason: `Count is ${count}`,
    });
    throw new Error(
      `[STRICT MODE VIOLATION] Locator vrací ${count} elementů pro "${description}". Očekáván přesně 1.`
    );
  }

  const isVisible = await locator.isVisible().catch(() => false);
  const isEnabled = await locator.isEnabled().catch(() => false);
  const boundingBox = await locator.boundingBox().catch(() => null);

  console.log(
    `🔍 [SAFECLICK CHECK] "${description}": isVisible=${isVisible}, isEnabled=${isEnabled}, boundingBox=${JSON.stringify(
      boundingBox
    )}`
  );

  if (boundingBox === null) {
    console.warn(
      `⚠️ [SAFECLICK CANCELLED] BoundingBox je null pro "${description}". Kliknutí se neprovede.`
    );
    DIAG.safeClickStatus.push({
      description,
      locatorValid: true,
      locatorVisible: isVisible,
      locatorEnabled: isEnabled,
      boundingBox: "null",
      clickSuccess: false,
      retryUsed: false,
      reason: "BoundingBox is null",
    });
    return false;
  }

  await logElementDetails(locator, `PŘED KLIKEM (${description})`);

  const urlBefore = page.url();
  const titleBefore = await page.title().catch(() => "N/A");
  const stateBefore = await page
    .evaluate(() => ({
      htmlLength: document.documentElement.outerHTML.length,
      buttonCount: document.querySelectorAll("button").length,
      inputCount: document.querySelectorAll("input").length,
    }))
    .catch(() => ({ htmlLength: 0, buttonCount: 0, inputCount: 0 }));

  let retryUsed = false;
  try {
    await locator.waitFor({
      state: "visible",
      timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
    });
    await locator.click();
  } catch (err) {
    console.warn(
      `⚠️ První pokus o kliknutí na "${description}" selhal: ${err.message}. Opakuji kliknutí čerstvým odkazem...`
    );
    retryUsed = true;
    const freshLocator = locator.first();
    await freshLocator.waitFor({
      state: "visible",
      timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
    });
    await freshLocator.click();
  }

  if (options && options.expectDisappear) {
    try {
      await Promise.race([
        locator.waitFor({
          state: "detached",
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        }),
        locator.waitFor({
          state: "hidden",
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        }),
      ]).catch(() => {});
      console.log(`✅ Element "${description}" po kliknutí úspěšně zmizel.`);
    } catch (disappearErr) {
      console.warn(
        `⚠️ Element "${description}" nezmizel v požadovaném časovém limitu.`
      );
    }
  }

  const urlAfter = page.url();
  const titleAfter = await page.title().catch(() => "N/A");
  const stateAfter = await page
    .evaluate(() => ({
      htmlLength: document.documentElement.outerHTML.length,
      buttonCount: document.querySelectorAll("button").length,
      inputCount: document.querySelectorAll("input").length,
    }))
    .catch(() => ({ htmlLength: 0, buttonCount: 0, inputCount: 0 }));

  const domChanged = stateBefore.htmlLength !== stateAfter.htmlLength;
  const urlChanged = urlBefore !== urlAfter;

  logDiag(`👈 [AFTER CLICK DIAG] "${description}":
├─ URL before:          ${urlBefore}
├─ URL after:           ${urlAfter}
├─ Title before:        ${titleBefore}
├─ Title after:         ${titleAfter}
├─ DOM changed:         ${domChanged} (délka: ${stateBefore.htmlLength} -> ${stateAfter.htmlLength})
├─ Button count before: ${stateBefore.buttonCount}
├─ Button count after:  ${stateAfter.buttonCount}
├─ Input count before:  ${stateBefore.inputCount}
└─ Input count after:   ${stateAfter.inputCount}`);

  DIAG.safeClickStatus.push({
    description,
    locatorValid: true,
    locatorVisible: isVisible,
    locatorEnabled: isEnabled,
    boundingBox: JSON.stringify(boundingBox),
    clickSuccess: true,
    retryUsed,
    domChanged,
    urlChanged,
    urlBefore,
    urlAfter,
    buttonCountBefore: stateBefore.buttonCount,
    buttonCountAfter: stateAfter.buttonCount,
    inputCountBefore: stateBefore.inputCount,
    inputCountAfter: stateAfter.inputCount,
  });

  return true;
}

/**
 * Zpracování a verifikace cookie modalu
 */
async function handleCookieBannerIfPresent(page) {
  console.log("🍪 Vyhledávám tlačítko pro přijetí cookies...");
  DIAG.cookieStatus.cookiesBefore = (
    await page.context().cookies().catch(() => [])
  ).length;

  const candidateSelectors = [
    'button[data-testid="cookie-modal-agree"]',
    '[data-testid="cookie-modal-agree"]',
    'button[title="Povolit vše"]',
    'button("Povolit vše")',
    'button("Accept")',
  ];

  let targetLocator = null;
  let selectedSelectorName = null;

  for (const selector of candidateSelectors) {
    if (page.isClosed()) return;
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);

    if (count === 1) {
      targetLocator = loc;
      selectedSelectorName = selector;
      DIAG.cookieStatus.foundBanner = true;
      DIAG.cookieStatus.usedSelector = selector;
      DIAG.cookieStatus.matchedCount = 1;
      console.log(
        `🎯 Nalezen unikátní selector cookie tlačítka (count == 1): "${selector}"`
      );
      break;
    } else if (count > 1) {
      console.warn(
        `⚠️ Selector "${selector}" vrací více elementů (${count}). Nevolám safeClick, vypisuji diagnostiku:`
      );
      const elementsDetails = await loc
        .evaluateAll((els) =>
          els.map((el) => ({
            tagName: el.tagName.toLowerCase(),
            dataTestId: el.getAttribute("data-testid") || "N/A",
            className: el.className || "N/A",
            text: (el.innerText || el.value || "").trim(),
          }))
        )
        .catch(() => []);
      console.warn(JSON.stringify(elementsDetails, null, 2));
      logDiag(
        `Selector "${selector}" přeskočen kvůli násobnému výskytu (${count}).`
      );
    } else {
      console.log(
        `ℹ️ Selector "${selector}" nenalezl žádný element (count == 0).`
      );
    }
  }

  if (!targetLocator) {
    console.log(
      "ℹ️ Žádný ze selectorů nevrátil přesně 1 element / cookie banner není zobrazen."
    );
    await captureStateSnapshot(page, "03-cookie-not-present");
    return;
  }

  await captureStateSnapshot(page, "03-cookie-visible");
  const clicked = await safeClick(
    page,
    targetLocator,
    `Cookie Accept (${selectedSelectorName})`,
    { expectDisappear: true }
  );

  DIAG.cookieStatus.clicked = clicked;

  if (clicked) {
    console.log(
      "🍪 Potvrzovací tlačítko cookies bylo stisknuto. Ověřuji zmizení modalu..."
    );

    let cookieModalLocator = page
      .locator('[data-testid="cookie-modal"]')
      .first();
    if ((await cookieModalLocator.count().catch(() => 0)) === 0) {
      cookieModalLocator = page.locator('[class*="cookie-modal"]').first();
    }
    if ((await cookieModalLocator.count().catch(() => 0)) === 0) {
      cookieModalLocator = page
        .locator('[class*="cookie" i][class*="modal" i]')
        .first();
    }

    try {
      await Promise.race([
        cookieModalLocator.waitFor({
          state: "hidden",
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        }),
        cookieModalLocator.waitFor({
          state: "detached",
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        }),
      ]).catch(() => {});
      console.log("✅ Cookie modal verified");
      DIAG.cookieStatus.disappeared = true;
    } catch (err) {
      console.error("❌ Cookie modal still visible");
      DIAG.cookieStatus.disappeared = false;

      const errScreenshot = path.join(
        DEBUG_DIR,
        "cookie-modal-failed-disappear.png"
      );
      const errHtml = path.join(
        DEBUG_DIR,
        "cookie-modal-failed-disappear.html"
      );

      if (!page.isClosed()) {
        await page
          .screenshot({ path: errScreenshot, fullPage: true })
          .catch(() => {});
        const htmlContent = await page.content().catch(() => "");
        try {
          fs.writeFileSync(errHtml, htmlContent, "utf8");
        } catch (e) {}
      }

      throw new Error(
        "⛔ [COOKIE BANNER ERROR] Cookie modal still visible po kliknutí na akceptační tlačítko!"
      );
    }

    DIAG.cookieStatus.cookiesAfter = (
      await page.context().cookies().catch(() => [])
    ).length;
    await captureStateSnapshot(page, "03-cookie-handled");
  }
}

/**
 * Pomocný locator pro vrácení aktuálního login modalu
 */
function getLoginModalLocator(page) {
  return page
    .locator('[role="dialog"], [class*="modal" i]')
    .filter({
      has: page.locator(
        'input[type="email"], input[name="email"], input[placeholder*="mail" i], input[type="password"]'
      ),
    })
    .first();
}

/**
 * PŘIHLAŠOVACÍ WORKFLOW - POUZE UVNITŘ MODALU
 */
async function executeModalLogin(page, email, password) {
  console.log("🔑 [LOGIN] Zahajuji modal přihlášení...");
  DIAG.lastSuccessfulStep = "LOGIN_STARTED";

  let loginModal = getLoginModalLocator(page);
  if ((await loginModal.count().catch(() => 0)) === 0) {
    loginModal = page
      .locator("form")
      .filter({
        has: page.locator('input[type="email"], input[type="password"]'),
      })
      .first();
  }

  await loginModal.waitFor({
    state: "visible",
    timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
  });
  console.log("✅ Login modal zobrazen.");
  await captureStateSnapshot(page, "04-login-modal");
  await analyzeModalDOM(page);
  DIAG.lastSuccessfulStep = "MODAL_OPENED";

  const emailInputSelector =
    '[role="dialog"] input[type="email"], [class*="modal" i] input[type="email"], form input[type="email"]';
  const emailInput = page.locator(emailInputSelector).first();

  await emailInput.waitFor({
    state: "visible",
    timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
  });
  console.log("📧 Vyplňuji e-mail...");
  await emailInput.fill(email);

  const filledEmailValue = await emailInput.inputValue().catch(() => "N/A");
  logDiag(`📧 [INPUT DIAG] Email hodnota v poli: "${filledEmailValue}"`);
  await captureStateSnapshot(page, "05-email-filled");

  const continueBtnSelector = `${emailInputSelector} ~ button, ${emailInputSelector} + button, form:has(input[type="email"]) button[type="submit"]`;
  const continueBtnLoc = page.locator(continueBtnSelector).first();

  await logElementDetails(continueBtnLoc, "PŘED KLIKNUTÍM NA ŠIPKU (E-MAIL)");
  await safeClick(page, continueBtnLoc, "Šipka vedle e-mailu");
  await captureStateSnapshot(page, "06-after-email-click");

  console.log("⏳ Čekám na zobrazení pole pro heslo nebo chybové hlášky...");

  const passwordInputSelector =
    '[role="dialog"] input[type="password"], [class*="modal" i] input[type="password"], form input[type="password"]';
  const passwordInput = page.locator(passwordInputSelector).first();
  const errorNotice = getLoginModalLocator(page)
    .locator('[class*="error" i], [role="alert"]')
    .first();

  const resultState = await Promise.race([
    passwordInput
      .waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
      .then(() => "PASSWORD_READY"),
    errorNotice
      .waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
      .then(() => "LOGIN_ERROR"),
  ]).catch(() => "TIMEOUT");

  const currentUrl = page.url();
  if (
    currentUrl.includes("appleid.apple.com") ||
    currentUrl.includes("accounts.google.com") ||
    currentUrl.includes("facebook.com")
  ) {
    DIAG.firstFailedStep = "OAUTH_REDIRECTED";
    throw new Error(
      `⛔ [CRITICAL ERROR] Detekováno nechtěné přesměrování na OAuth! URL: ${currentUrl}`
    );
  }

  if (resultState === "LOGIN_ERROR") {
    const errorMsg = await errorNotice.innerText().catch(() => "Neznámá chyba");
    DIAG.firstFailedStep = "EMAIL_VALIDATION_ERROR";
    throw new Error(`❌ Validace e-mailu selhala přímo v modalu: ${errorMsg}`);
  }

  if (resultState !== "PASSWORD_READY") {
    DIAG.firstFailedStep = "PASSWORD_INPUT_TIMEOUT";
    throw new Error("❌ Vypršel časový limit pro zobrazení pole pro heslo.");
  }

  DIAG.lastSuccessfulStep = "PASSWORD_INPUT_VISIBLE";
  await captureStateSnapshot(page, "07-password-visible");

  console.log("🔒 Pole pro heslo je viditelné. Vyplňuji heslo...");
  await passwordInput.fill(password);

  const passwordVal = await passwordInput.inputValue().catch(() => "");
  logDiag(
    `🔒 [INPUT DIAG] Heslo vyplněno, délka řetězce: ${passwordVal.length} znaků.`
  );
  await captureStateSnapshot(page, "08-password-filled");

  const submitBtnSelector = `${passwordInputSelector} ~ button, ${passwordInputSelector} + button, form:has(input[type="password"]) button[type="submit"]`;
  const submitBtnLoc = page.locator(submitBtnSelector).first();

  await logElementDetails(submitBtnLoc, "PŘED KLIKNUTÍM NA PŘIHLÁSIT (HESLO)");
  await safeClick(page, submitBtnLoc, "Přihlašovací tlačítko hesla");
  await captureStateSnapshot(page, "09-after-login-click");

  console.log("⏳ Čekám na dokončení přihlášení a zobrazení editoru...");

  const editorElement = page
    .locator(
      '[data-testid*="create" i], [class*="editor" i], textarea, [contenteditable="true"]'
    )
    .first();

  const isSuccess = await editorElement
    .waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
    .then(() => true)
    .catch(() => false);

  if (!isSuccess) {
    DIAG.firstFailedStep = "EDITOR_NOT_LOADED";
    throw new Error(
      "❌ Přihlášení selhalo – editor obsahu nebyl načten v daném limitu."
    );
  }

  DIAG.lastSuccessfulStep = "EDITOR_LOADED";
  await captureStateSnapshot(page, "10-editor");

  console.log(`📌 [LOG PO PŘIHLÁŠENÍ]
├─ URL: ${page.url()}
└─ Editor úspěšně zobrazen: ${isSuccess}`);

  console.log("🎉 Přihlášení úspěšně proběhlo.");
}

// FINÁLNÍ REPORT & DUMP
async function dumpAllDiagnosticArtifacts(page, context, err = null) {
  logDiag("--- GENEROVÁNÍ FINÁLNÍCH DIAGNOSTICKÝCH ARTEFAKTŮ ---");

  if (err) {
    DIAG.errors.push(err.message);
    if (page && !page.isClosed()) {
      await captureStateSnapshot(page, "11-failed").catch(() => {});
    }
  }

  if (page && context && !page.isClosed()) {
    const allCookies = await context.cookies().catch(() => []);
    writeJsonDebug("cookies.json", allCookies);

    const storageDump = await page
      .evaluate(() => {
        try {
          return {
            localStorage: { ...localStorage },
            sessionStorage: { ...sessionStorage },
          };
        } catch (e) {
          return { localStorage: {}, sessionStorage: {} };
        }
      })
      .catch(() => ({ localStorage: {}, sessionStorage: {} }));

    writeJsonDebug("localStorage.json", storageDump.localStorage);
    writeJsonDebug("sessionStorage.json", storageDump.sessionStorage);
  }

  writeJsonDebug("network.json", DIAG.networkLogs);
  writeJsonDebug("url-history.json", DIAG.urlHistory);
  writeJsonDebug("timings.json", DIAG.timings);

  const reportMd = `# 📊 DIAGNOSTICKÝ REPORT HEROHERO AUTOLOGIN
Datum běhu: ${new Date().toISOString()}
Výsledek: ${err ? "❌ CHYBA / SELHÁNÍ" : "✅ ÚSPĚCH"}
Poslední úspěšný krok: ${DIAG.lastSuccessfulStep}
První selhaný krok: ${DIAG.firstFailedStep || "N/A"}

🍪 COOKIE STATUS
Našel banner? ${DIAG.cookieStatus.foundBanner ? "ANO" : "NE"}
Použitý selector: \`${DIAG.cookieStatus.usedSelector}\`
Počet nalezených elementů: ${DIAG.cookieStatus.matchedCount}
Kliknutí proběhlo? ${DIAG.cookieStatus.clicked ? "ANO" : "NE"}
Banner zmizel? ${DIAG.cookieStatus.disappeared ? "ANO" : "NE"}
Počet cookies před klikem: ${DIAG.cookieStatus.cookiesBefore}
Počet cookies po kliku: ${DIAG.cookieStatus.cookiesAfter}

🖱️ SAFECLICK STATUS
| Popis | Valid | Visible | Enabled | BoundingBox | Success | Retry | DOM Changed | URL Changed |
|-------|-------|---------|---------|-------------|---------|-------|-------------|-------------|
${DIAG.safeClickStatus
  .map(
    (s) =>
      `| ${s.description} | ${s.locatorValid} | ${s.locatorVisible} | ${s.locatorEnabled} | ${s.boundingBox} | ${s.clickSuccess} | ${s.retryUsed} | ${s.domChanged} | ${s.urlChanged} |`
  )
  .join("\n")}

🛑 Detekované Chyby
${
  DIAG.errors.length > 0
    ? DIAG.errors.map((e) => `- ${e}`).join("\n")
    : "Žádné explicitní výjimky."
}

🚨 OAuth Detekce
Detekováno nechtěné OAuth? ${DIAG.oauthDetected ? "ANO ⚠️" : "NE"}
${
  DIAG.oauthDetails
    ? "```json\n" + JSON.stringify(DIAG.oauthDetails, null, 2) + "\n```"
    : "OAuth nebylo zachyceno."
}

⏳ Časová osa kroků (Timings)
| Krok | Trvání (ms) | Čas |
|------|-------------|-----|
${DIAG.timings
  .map((t) => `| ${t.stepName} | ${t.durationMs} ms | ${t.timestamp} |`)
  .join("\n")}

🌐 URL Historie
| Čas | Krok | URL | Title |
|-----|------|-----|-------|
${DIAG.urlHistory
  .map((u) => `| ${u.time} | ${u.step} | ${u.url} | ${u.title} |`)
  .join("\n")}

🔍 Pravděpodobné příčiny (Seřazeno podle pravděpodobnosti)
1. OAuth Redirect: ${
    DIAG.oauthDetected
      ? "VYSOKÁ - Dochází k nekontrolovanému kliknutí na sociální tlačítko."
      : "NÍZKÁ"
  }
2. Překreslení/Hydratace (SPA): Zkontrolujte \`dom.json\` a porovnejte rozdíl elementů před a po kliknutí.
3. Validace E-mailu: Pokud e-mail neodpovídá formátu registrace, HeroHero neotevře heslo, ale zobrazí alert.

Všechny soubory včetně trace.zip, video, HAR a screenshotů jsou dostupné ve složce \`debug/\`.
`;

  try {
    fs.writeFileSync(path.join(DEBUG_DIR, "report.md"), reportMd, "utf8");
    logDiag("📄 Generování report.md dokončeno.");
  } catch (e) {
    console.error("Selhal zápis report.md:", e.message);
  }
}

module.exports = async function publishHeroHero(job) {
  console.log("🎬 START ZPRACOVÁNÍ PŘÍSPĚVKU PRO HEROHERO (DIAGNOSTIC MODE)");

  diagnoseStorageState();

  let browser = null;
  let context = null;
  let page = null;
  let executionError = null;
  let tracingStarted = false;

  try {
    browser = await chromium.launch({
      headless: CONFIG.HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });

    await diagnoseEnvironment(browser);

    const contextOptions = {
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
      viewport: CONFIG.VIEWPORT,
      recordVideo: { dir: DEBUG_DIR, size: CONFIG.VIEWPORT },
      recordHar: { path: path.join(DEBUG_DIR, "network.har") },
    };

    if (isValidJson(CONFIG.STORAGE_STATE_PATH)) {
      console.log("🔑 Načítám uloženou relaci (storageState.json)...");
      contextOptions.storageState = CONFIG.STORAGE_STATE_PATH;
    }

    context = await browser.newContext(contextOptions);

    const loadedCookies = await context.cookies().catch(() => []);
    const nowInSeconds = Date.now() / 1000;

    const heroHeroCookies = loadedCookies.filter((c) =>
      c.domain.includes("herohero")
    );
    const firebaseCookies = loadedCookies.filter(
      (c) => c.domain.includes("firebase") || c.name.includes("firebase")
    );
    const authCookies = loadedCookies.filter(
      (c) =>
        c.name.includes("auth") ||
        c.name.includes("session") ||
        c.name.includes("token")
    );
    const expiredCookies = loadedCookies.filter(
      (c) => c.expires > 0 && c.expires < nowInSeconds
    );
    const secureCookies = loadedCookies.filter((c) => c.secure);
    const httpOnlyCookies = loadedCookies.filter((c) => c.httpOnly);

    console.log("==========================================");
    console.log(
      `🍪 [CONTEXT COOKIES LOADED] Celkový počet cookies: ${loadedCookies.length}`
    );
    console.log(` ├─ HeroHero cookies: ${heroHeroCookies.length}`);
    console.log(` ├─ Auth cookies:     ${authCookies.length}`);
    console.log(` ├─ Firebase cookies: ${firebaseCookies.length}`);
    console.log(` ├─ Expired cookies:  ${expiredCookies.length}`);
    console.log(` ├─ Secure cookies:   ${secureCookies.length}`);
    console.log(` └─ HttpOnly cookies: ${httpOnlyCookies.length}`);
    console.log("==========================================");

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    tracingStarted = true;

    page = await context.newPage();
    attachEventListeners(page);

    console.log("🌐 Otvírám https://herohero.co/create...");
    await captureStateSnapshot(page, "01-start");

    await page.goto("https://herohero.co/create", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });

    await captureStateSnapshot(page, "02-home");
    await handleCookieBannerIfPresent(page);

    const passwordInputGlobal = page.locator(
      'input[type="password"], input[autocomplete="current-password"]'
    );
    const emailInputGlobal = page.locator(
      'input[type="email"], input[placeholder*="mail" i]'
    );

    const isLoginNeeded =
      ((await emailInputGlobal.count().catch(() => 0)) > 0 &&
        (await emailInputGlobal.first().isVisible().catch(() => false))) ||
      ((await passwordInputGlobal.count().catch(() => 0)) > 0 &&
        (await passwordInputGlobal.first().isVisible().catch(() => false)));

    if (isLoginNeeded) {
      console.log("👤 Uživatel není přihlášen. Spouštím modal login...");

      const email = (job && job.email) || process.env.HEROHERO_EMAIL;
      const password = (job && job.password) || process.env.HEROHERO_PASSWORD;

      if (!email || !password) {
        throw new Error(
          "❌ Chybí přihlašovací údaje (HEROHERO_EMAIL / HEROHERO_PASSWORD)."
        );
      }

      await executeModalLogin(page, email, password);
      await saveStorageStateAtomically(context, CONFIG.STORAGE_STATE_PATH);
    } else {
      console.log("✅ Uživatel je již přihlášen (relace je platná).");
      DIAG.lastSuccessfulStep = "ALREADY_LOGGED_IN";
    }

    console.log("🚀 Připraveno pro vkládání obsahu příspěvku.");
    DIAG.lastSuccessfulStep = "PUBLISH_SUCCESS";
  } catch (err) {
    executionError = err;
    console.error("❌ CHYBA BĚHEM AUTOMATIZACE:", err.message);
    throw err;
  } finally {
    try {
      await dumpAllDiagnosticArtifacts(page, context, executionError);
    } catch (dumpErr) {
      console.error(
        "Selhalo generování diagnostických artefaktů:",
        dumpErr.message
      );
    }

    if (context) {
      if (tracingStarted) {
        await context.tracing
          .stop({ path: path.join(DEBUG_DIR, "trace.zip") })
          .catch(() => {});
      }
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};
