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

async function printDetailedStateToConsole(page, stepName) {
  if (!page || page.isClosed()) return;

  const url = page.url();
  const title = await page.title().catch(() => "N/A");
  const pageState = await page
    .evaluate(() => ({
      readyState: document.readyState,
      visibilityState: document.visibilityState,
    }))
    .catch(() => ({ readyState: "error", visibilityState: "error" }));

  const cookies = await page.context().cookies().catch(() => []);
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

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

  const counts = await page
    .evaluate(() => ({
      dialogs: document.querySelectorAll("dialog").length,
      modals: document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]').length,
      buttons: document.querySelectorAll("button").length,
      inputs: document.querySelectorAll("input").length,
      forms: document.querySelectorAll("form").length,
      iframes: document.querySelectorAll("iframe").length,
    }))
    .catch(() => ({ dialogs: 0, modals: 0, buttons: 0, inputs: 0, forms: 0, iframes: 0 }));

  console.log("==========================================");
  console.log(`📊 DIAGNOSTICKÝ STAV KROKU: ${stepName}`);
  console.log("==========================================");
  console.log(`- název kroku: ${stepName}`);
  console.log(`- URL: ${url}`);
  console.log(`- title: ${title}`);
  console.log(`- document.readyState: ${pageState.readyState}`);
  console.log(`- document.visibilityState: ${pageState.visibilityState}`);
  console.log(`- počet dialogů: ${counts.dialogs}`);
  console.log(`- počet modalů: ${counts.modals}`);
  console.log(`- počet button elementů: ${counts.buttons}`);
  console.log(`- počet input elementů: ${counts.inputs}`);
  console.log(`- počet formulářů: ${counts.forms}`);
  console.log(`- počet iframe: ${counts.iframes}`);
  console.log(`- aktuální cookies: ${cookieString || "Žádné"}`);
  console.log(`- aktuální localStorage klíče: ${storageKeys.localKeys.join(", ") || "Žádné"}`);
  console.log(`- aktuální sessionStorage klíče: ${storageKeys.sessionKeys.join(", ") || "Žádné"}`);
  console.log("==========================================");
}

async function captureStateSnapshotWithConsole(page, stepName) {
  await printDetailedStateToConsole(page, stepName);
  return await captureStateSnapshot(page, stepName);
}

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

function attachEventListeners(page) {
  if (!page || page.isClosed()) return;

  let lastUrl = page.url();
  page.on("framenavigated", async (frame) => {
    if (frame === page.mainFrame()) {
      const newUrl = frame.url();
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        logDiag(`🌐 [URL CHANGED] ${newUrl}`);
        await captureStateSnapshotWithConsole(page, "024-url-changed");
      }
    }
  });

  page.on("request", (req) => {
    DIAG.networkLogs.push({
      type: "request",
      url: req.url(),
      method: req.method(),
      time: new Date().toISOString(),
    });
  });

  page.on("response", async (res) => {
    const status = res.status();
    const headers = res.headers();
    const reqUrl = res.url();
    const item = {
      type: "response",
      url: reqUrl,
      status,
      location: headers["location"] || null,
      time: new Date().toISOString(),
    };
    DIAG.networkLogs.push(item);

    if (reqUrl.includes("login") || reqUrl.includes("auth") || reqUrl.includes("api")) {
      logDiag(`🌐 [LOGIN NETWORK REQUEST] ${reqUrl} -> Status: ${status}`);
      await captureStateSnapshotWithConsole(page, "025-login-network-request");
    }

    if ([301, 302, 307, 308, 401, 403, 404, 429, 500].includes(status)) {
      logDiag(
        `🌐 [NETWORK ALERT ${status}] ${reqUrl} -> Location: ${
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
 * ODOLNÁ FUNKCE SAFECLICK
 * Obsahuje záložní strategie (force click a JS click) pro případ překrytí prvků overlayem.
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

  const isVisible = await locator.isVisible().catch(() => false);
  const isEnabled = await locator.isEnabled().catch(() => false);
  const boundingBox = await locator.boundingBox().catch(() => null);

  console.log(
    `🔍 [SAFECLICK CHECK] "${description}": isVisible=${isVisible}, isEnabled=${isEnabled}, boundingBox=${JSON.stringify(
      boundingBox
    )}`
  );

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
  let clickSuccess = false;

  // 1. Pokus: Běžný klik
  try {
    await locator.waitFor({
      state: "visible",
      timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
    });
    await captureStateSnapshotWithConsole(page, "019-po-kazdem-safeclick");
    await locator.click({ timeout: 5000 });
    clickSuccess = true;
    await captureStateSnapshotWithConsole(page, "020-po-kazdem-locator-click");
  } catch (err) {
    console.warn(
      `⚠️ Běžný klik na "${description}" selhal (${err.message}). Zkouším FORCED CLICK...`
    );
    retryUsed = true;
    
    // 2. Pokus: Forced Click (obchází interception check)
    try {
      await locator.click({ force: true, timeout: 5000 });
      clickSuccess = true;
      console.log(`✅ Forced click na "${description}" byl úspěšný.`);
    } catch (forceErr) {
      console.warn(
        `⚠️ Forced click na "${description}" selhal (${forceErr.message}). Zkouším EVALUATE JS CLICK...`
      );

      // 3. Pokus: Direct JavaScript click v DOMu
      try {
        await locator.evaluate((el) => el.click());
        clickSuccess = true;
        console.log(`✅ Direct JS click na "${description}" byl úspěšný.`);
      } catch (jsErr) {
        console.error(`❌ Všechny metody kliknutí na "${description}" selhaly: ${jsErr.message}`);
      }
    }
  }

  if (options && options.expectDisappear && clickSuccess) {
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

  DIAG.safeClickStatus.push({
    description,
    locatorValid: true,
    locatorVisible: isVisible,
    locatorEnabled: isEnabled,
    boundingBox: JSON.stringify(boundingBox),
    clickSuccess,
    retryUsed,
    domChanged,
    urlChanged,
    urlBefore,
    urlAfter,
  });

  return clickSuccess;
}

/**
 * Zpracování cookie modalu s ošetřením překrývání
 */
async function handleCookieBannerIfPresent(page) {
  console.log("🍪 Vyhledávám tlačítko pro přijetí cookies...");
  DIAG.cookieStatus.cookiesBefore = (
    await page.context().cookies().catch(() => [])
  ).length;

  // Zkusíme nejprve poslat Escape, pokud je zobrazen jakýkoliv jiný modal/overlay
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  const candidateSelectors = [
    'button[data-testid="cookie-modal-agree"]',
    '[data-testid="cookie-modal-agree"]',
    'button[title="Povolit vše"]',
    'button:has-text("Povolit vše")',
    'button:has-text("Accept")',
  ];

  let targetLocator = null;
  let selectedSelectorName = null;

  await captureStateSnapshotWithConsole(page, "005-pred-hledanim-cookie-banneru");

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
      await captureStateSnapshotWithConsole(page, "006-po-nalezeni-cookie-banneru");
      break;
    } else if (count > 1) {
      console.warn(
        `⚠️ Selector "${selector}" vrací více elementů (${count}).`
      );
    }
  }

  if (!targetLocator) {
    console.log(
      "ℹ️ Žádný ze selectorů nevrátil přesně 1 element / cookie banner není zobrazen."
    );
    await captureStateSnapshotWithConsole(page, "03-cookie-not-present");
    return;
  }

  await captureStateSnapshotWithConsole(page, "007-tesne-pred-kliknutim-na-cookie-tlacitko");
  
  const clicked = await safeClick(
    page,
    targetLocator,
    `Cookie Accept (${selectedSelectorName})`,
    { expectDisappear: true }
  );

  DIAG.cookieStatus.clicked = clicked;

  if (clicked) {
    await captureStateSnapshotWithConsole(page, "008-ihned-po-kliknuti-na-cookie-tlacitko");
    console.log(
      "🍪 Potvrzovací tlačítko cookies bylo stisknuto. Ověřuji zmizení modalu..."
    );

    const cookieModalHandles = await page.locator('[data-testid="cookie-modal"], [class*="cookie-modal"], [class*="cookie" i][class*="modal" i]').all();
    let cookieModalLocator = null;
    for (const h of cookieModalHandles) {
      if (await h.isVisible().catch(() => false)) {
        cookieModalLocator = h;
        break;
      }
    }

    if (cookieModalLocator) {
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
        await captureStateSnapshotWithConsole(page, "009-po-zmizeni-cookie-banneru");
      } catch (err) {
        console.warn("⚠️ Cookie modal je stále v DOMu, pokračujeme dál v přihlašovacím workflow...");
        DIAG.cookieStatus.disappeared = false;
      }
    }

    DIAG.cookieStatus.cookiesAfter = (
      await page.context().cookies().catch(() => [])
    ).length;
    await captureStateSnapshotWithConsole(page, "03-cookie-handled");
  }
}

async function getLoginModal(page) {
  const modalHandles = await page.locator('[role="dialog"], [class*="modal" i]').all();
  for (const handle of modalHandles) {
    const hasInputs = (await handle.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i], input[type="password"]').count().catch(() => 0)) > 0;
    const isVisible = await handle.isVisible().catch(() => false);
    if (hasInputs && isVisible) {
      return handle;
    }
  }

  const formHandles = await page.locator("form").all();
  for (const handle of formHandles) {
    const hasInputs = (await handle.locator('input[type="email"], input[type="password"]').count().catch(() => 0)) > 0;
    const isVisible = await handle.isVisible().catch(() => false);
    if (hasInputs && isVisible) {
      return handle;
    }
  }
  return null;
}

async function findLoginButton(page, loginModal, mode) {
  console.log("\n==================================================");
  console.log(`🔍 DYNAMICKÝ VÝBĚR TLAČÍTKA V LOGIN MODALU (mode: ${mode})`);
  console.log("==================================================");

  if (mode !== "continue" && mode !== "submit") {
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error(`⛔ [STRICT ERROR] Neznámý mode pro findLoginButton: "${mode}"`);
  }

  let allowedKeywords = [];
  if (mode === "continue") {
    allowedKeywords = ["pokračovat", "continue", "next", "další"];
  } else if (mode === "submit") {
    allowedKeywords = ["přihlásit", "přihlásit se", "login", "log in", "sign in"];
  }

  const buttonHandles = await loginModal.locator("button").all();
  const buttonDiagnostics = [];
  const validCandidates = [];

  for (const btn of buttonHandles) {
    const diagInfo = await btn.evaluate((el) => {
      const text = (el.innerText || el.value || "").trim();
      const testId = el.getAttribute("data-testid") || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const type = el.getAttribute("type") || "";
      const isDisabled = el.disabled || false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden";
      const isInForm = !!el.closest("form");

      return {
        tagName: el.tagName.toLowerCase(),
        text,
        testId,
        ariaLabel,
        type,
        disabled: isDisabled,
        visible: isVisible,
        isInForm,
        width: rect.width,
        height: rect.height,
        area: rect.width * rect.height,
        outerHTML: el.outerHTML.slice(0, 200),
      };
    });

    buttonDiagnostics.push(diagInfo);

    const lowerText = diagInfo.text.toLowerCase();
    const lowerTestId = diagInfo.testId.toLowerCase();
    const lowerAria = diagInfo.ariaLabel.toLowerCase();

    const matchesText = allowedKeywords.some((kw) => lowerText.includes(kw));
    const matchesTestId = allowedKeywords.some((kw) => lowerTestId.includes(kw));
    const matchesAria = allowedKeywords.some((kw) => lowerAria.includes(kw));

    if (
      diagInfo.tagName === "button" &&
      diagInfo.visible &&
      !diagInfo.disabled &&
      (matchesText || matchesTestId || matchesAria)
    ) {
      validCandidates.push({ handle: btn, info: diagInfo });
    }
  }

  if (validCandidates.length === 0) {
    console.error(`❌ Diagnostika všech tlačítek v modalu (žádný platný kandidát pro mode: ${mode}):`);
    console.error(JSON.stringify(buttonDiagnostics, null, 2));
    DIAG.firstFailedStep = "BUTTON_SELECTION_FAILED";
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error(`⛔ [STRICT ERROR] Nebyl nalezen žádný vhodný kandidát pro tlačítko (mode: ${mode}).`);
  }

  validCandidates.sort((a, b) => {
    const aIsSubmit = a.info.type === "submit" ? 1 : 0;
    const bIsSubmit = b.info.type === "submit" ? 1 : 0;
    if (aIsSubmit !== bIsSubmit) return bIsSubmit - aIsSubmit;

    const aInForm = a.info.isInForm ? 1 : 0;
    const bInForm = b.info.isInForm ? 1 : 0;
    if (aInForm !== bInForm) return bInForm - aInForm;

    return b.info.area - a.info.area;
  });

  const bestCandidate = validCandidates[0];
  console.log(`🎯 Vybrán nejlepší kandidát: text="${bestCandidate.info.text}", testId="${bestCandidate.info.testId}", area=${bestCandidate.info.area}`);
  console.log("==================================================\n");

  return bestCandidate.handle;
}

async function executeModalLogin(page, email, password) {
  console.log("🔑 [LOGIN] Zahajuji modal přihlášení...");
  DIAG.lastSuccessfulStep = "LOGIN_STARTED";

  await captureStateSnapshotWithConsole(page, "010-pred-hledanim-login-modalu");
  let loginModal = await getLoginModal(page);
  if (!loginModal) {
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error("❌ Login modal nebyl nalezen.");
  }

  await captureStateSnapshotWithConsole(page, "011-po-nalezeni-login-modalu");
  await loginModal.waitFor({
    state: "visible",
    timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
  });
  console.log("✅ Login modal zobrazen.");
  await captureStateSnapshotWithConsole(page, "04-login-modal");
  await analyzeModalDOM(page);
  DIAG.lastSuccessfulStep = "MODAL_OPENED";

  const emailInputHandles = await loginModal.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').all();
  let emailInput = null;
  for (const h of emailInputHandles) {
    if (await h.isVisible().catch(() => false)) {
      emailInput = h;
      break;
    }
  }

  if (!emailInput) {
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error("❌ E-mailové vstupní pole nebylo nalezeno v modalu.");
  }

  await emailInput.waitFor({
    state: "visible",
    timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
  });
  console.log("📧 Vyplňuji e-mail...");

  await captureStateSnapshotWithConsole(page, "012-pred-vyplnenim-emailu");
  await emailInput.click();
  await captureStateSnapshotWithConsole(page, "013-po-kliknuti-do-emailoveho-pole");
  await emailInput.focus();
  await emailInput.clear();
  await emailInput.pressSequentially(email, { delay: 30 });
  await captureStateSnapshotWithConsole(page, "022-po-kazdem-presssequentially");

  let filledEmailValue = await emailInput.inputValue().catch(() => "N/A");

  if (filledEmailValue !== email) {
    logDiag("⚠️ pressSequentially neaktualizoval state plně, aplikuji Native Value Setter...");
    await emailInput.evaluate((el, val) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(el, val);

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, email);
    await captureStateSnapshotWithConsole(page, "023-po-kazdem-evaluate");
  }

  await emailInput.blur();
  await page.waitForTimeout(500);
  await captureStateSnapshotWithConsole(page, "018-po-kazdem-page-waitfortimeout");

  filledEmailValue = await emailInput.inputValue().catch(() => "N/A");
  logDiag(`📧 [INPUT DIAG] Email hodnota v poli: "${filledEmailValue}"`);
  await captureStateSnapshotWithConsole(page, "014-po-vyplneni-emailu");

  const targetContinueButton = await findLoginButton(page, loginModal, "continue");

  const networkCountBeforeClick = DIAG.networkLogs.length;

  await captureStateSnapshotWithConsole(page, "015-pred-kliknutim-na-pokracovat");
  await safeClick(page, targetContinueButton, "Login modal button");
  await captureStateSnapshotWithConsole(page, "016-ihned-po-kliknuti-na-pokracovat");

  await page.waitForTimeout(1000);
  await captureStateSnapshotWithConsole(page, "018-po-kazdem-page-waitfortimeout");

  const newNetworkLogs = DIAG.networkLogs.slice(networkCountBeforeClick);
  const heroHeroRequests = newNetworkLogs.filter(
    (log) => log.url && log.url.includes("herohero")
  );

  const currentModalForPassword = await getLoginModal(page) || loginModal;
  const passwordInputHandles = await currentModalForPassword.locator('input[type="password"]').all();
  let passwordInput = null;
  for (const h of passwordInputHandles) {
    if (await h.isVisible().catch(() => false)) {
      passwordInput = h;
      break;
    }
  }

  const errorNoticeHandles = await currentModalForPassword.locator('[class*="error" i], [role="alert"]').all();
  let errorNotice = null;
  for (const h of errorNoticeHandles) {
    if (await h.isVisible().catch(() => false)) {
      errorNotice = h;
      break;
    }
  }

  const isFormChanged = passwordInput !== null;
  const isErrorVisible = errorNotice !== null;
  const errorText = isErrorVisible
    ? await errorNotice.innerText().catch(() => "N/A")
    : "Žádná";

  console.log("\n==================================================");
  console.log("📊 DIAGNOSTIKA PO KLIKNUTÍ NA 'POKRAČOVAT'");
  console.log("==================================================");
  console.log(`  ├─ Request na HeroHero API odešel: ${heroHeroRequests.length > 0 ? "ANO" : "NE"}`);
  console.log(`  ├─ Celkem nových network requestů: ${newNetworkLogs.length}`);
  if (heroHeroRequests.length > 0) {
    heroHeroRequests.forEach((r) =>
      console.log(`  │   └─ [${r.type}] ${r.method || r.status} ${r.url}`)
    );
  }
  console.log(`  ├─ Změnil se formulář (zobrazeno pole pro heslo): ${isFormChanged ? "ANO" : "NE"}`);
  console.log(`  └─ Zobrazila se validační hláška: ${isErrorVisible ? `ANO ("${errorText}")` : "NE"}`);
  console.log("==================================================\n");

  await captureStateSnapshotWithConsole(page, "06-after-email-click");

  console.log("⏳ Čekám na zobrazení pole pro heslo nebo chybové hlášky...");

  let resultState = "TIMEOUT";
  const waitStartTime = Date.now();
  while (Date.now() - waitStartTime < CONFIG.TIMEOUTS.LOGIN_WAIT) {
    const modalCheck = await getLoginModal(page);
    if (modalCheck) {
      const pwdHandles = await modalCheck.locator('input[type="password"]').all();
      for (const ph of pwdHandles) {
        if (await ph.isVisible().catch(() => false)) {
          passwordInput = ph;
          resultState = "PASSWORD_READY";
          break;
        }
      }
      if (resultState === "PASSWORD_READY") break;

      const errHandles = await modalCheck.locator('[class*="error" i], [role="alert"]').all();
      for (const eh of errHandles) {
        if (await eh.isVisible().catch(() => false)) {
          errorNotice = eh;
          resultState = "LOGIN_ERROR";
          break;
        }
      }
      if (resultState === "LOGIN_ERROR") break;
    }
    await page.waitForTimeout(200);
    await captureStateSnapshotWithConsole(page, "017-po-kazdem-waitfor");
  }

  const currentUrl = page.url();
  if (
    currentUrl.includes("appleid.apple.com") ||
    currentUrl.includes("accounts.google.com") ||
    currentUrl.includes("facebook.com")
  ) {
    DIAG.firstFailedStep = "OAUTH_REDIRECTED";
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error(
      `⛔ [CRITICAL ERROR] Detekováno nechtěné přesměrování na OAuth! URL: ${currentUrl}`
    );
  }

  if (resultState === "LOGIN_ERROR") {
    const errorMsg = errorNotice ? await errorNotice.innerText().catch(() => "Neznámá chyba") : "Neznámá chyba";
    DIAG.firstFailedStep = "EMAIL_VALIDATION_ERROR";
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error(`❌ Validace e-mailu selhala přímo v modalu: ${errorMsg}`);
  }

  if (resultState !== "PASSWORD_READY") {
    DIAG.firstFailedStep = "PASSWORD_INPUT_TIMEOUT";
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error("❌ Vypršel časový limit pro zobrazení pole pro heslo.");
  }

  DIAG.lastSuccessfulStep = "PASSWORD_INPUT_VISIBLE";
  await captureStateSnapshotWithConsole(page, "026-po-zobrazeni-pole-pro-heslo");
  await captureStateSnapshotWithConsole(page, "07-password-visible");

  console.log("🔒 Pole pro heslo je viditelné. Vyplňuji heslo...");
  await captureStateSnapshotWithConsole(page, "027-pred-vyplnenim-hesla");
  await passwordInput.click();
  await passwordInput.focus();
  await passwordInput.clear();
  await passwordInput.pressSequentially(password, { delay: 30 });
  await captureStateSnapshotWithConsole(page, "022-po-kazdem-presssequentially");

  const passwordVal = await passwordInput.inputValue().catch(() => "");
  logDiag(
    `🔒 [INPUT DIAG] Heslo vyplněno, délka řetězce: ${passwordVal.length} znaků.`
  );
  await captureStateSnapshotWithConsole(page, "028-po-vyplneni-hesla");
  await captureStateSnapshotWithConsole(page, "08-password-filled");

  const finalLoginModal = await getLoginModal(page);
  if (!finalLoginModal) {
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error("❌ Login modal pro finální přihlášení nebyl nalezen.");
  }

  const targetSubmitButton = await findLoginButton(page, finalLoginModal, "submit");

  await captureStateSnapshotWithConsole(page, "029-pred-finalnim-kliknutim-na-prihlasit");
  await safeClick(page, targetSubmitButton, "Login modal button");
  await captureStateSnapshotWithConsole(page, "030-ihned-po-finalnim-kliknuti");
  await captureStateSnapshotWithConsole(page, "09-after-login-click");

  console.log("⏳ Čekám na dokončení přihlášení a zobrazení editoru...");

  const editorHandles = await page.locator('[data-testid*="create" i], [class*="editor" i], textarea, [contenteditable="true"]').all();
  let editorElement = null;
  for (const eh of editorHandles) {
    if (await eh.isVisible().catch(() => false)) {
      editorElement = eh;
      break;
    }
  }

  while (!editorElement) {
    await page.waitForTimeout(500);
    if (page.isClosed()) break;
    await captureStateSnapshotWithConsole(page, "031-po-kazdem-cekani-na-editor");
    const updatedHandles = await page.locator('[data-testid*="create" i], [class*="editor" i], textarea, [contenteditable="true"]').all();
    for (const eh of updatedHandles) {
      if (await eh.isVisible().catch(() => false)) {
        editorElement = eh;
        break;
      }
    }
    if (editorElement) break;
  }

  const isSuccess = editorElement !== null && await editorElement.isVisible().catch(() => false);

  if (isSuccess) {
    await captureStateSnapshotWithConsole(page, "032-po-nacteni-editoru");
  }

  if (!isSuccess) {
    DIAG.firstFailedStep = "EDITOR_NOT_LOADED";
    await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
    throw new Error(
      "❌ Přihlášení selhalo – editor obsahu nebyl načten v daném limitu."
    );
  }

  DIAG.lastSuccessfulTag = "EDITOR_LOADED";
  await captureStateSnapshotWithConsole(page, "10-editor");

  console.log(`📌 [LOG PO PŘIHLÁŠENÍ]
├─ URL: ${page.url()}
└─ Editor úspěšně zobrazen: ${isSuccess}`);

  console.log("🎉 Přihlášení úspěšně proběhlo.");
}

async function dumpAllDiagnosticArtifacts(page, context, err = null) {
  logDiag("--- GENEROVÁNÍ FINÁLNÍCH DIAGNOSTICKÝCH ARTEFAKTŮ ---");

  if (err) {
    DIAG.errors.push(err.message);
    if (page && !page.isClosed()) {
      await captureStateSnapshotWithConsole(page, "034-v-kazdem-catch-bloku");
      await captureStateSnapshot(page, "error-before-throw");
      await page.screenshot({ path: path.join(DEBUG_DIR, "error-fullpage.png"), fullPage: true }).catch(() => {});
      await page.screenshot({ path: path.join(DEBUG_DIR, "error-last-state.png"), fullPage: false }).catch(() => {});
      await captureStateSnapshot(page, "error-after-throw");
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
Chyba: ${err ? err.message : "Žádná"}
`;
  try {
    fs.writeFileSync(path.join(DEBUG_DIR, "report.md"), reportMd, "utf8");
  } catch (e) {}
}

async function publishHeroHero(job) {
  let browser;
  let context;
  let page;

  try {
    browser = await chromium.launch({
      headless: CONFIG.HEADLESS,
    });

    context = await browser.newContext({
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
    });

    page = await context.newPage();

    diagnoseStorageState();
    await diagnoseEnvironment(browser);
    attachEventListeners(page);

    await captureStateSnapshotWithConsole(page, "001-pred-page-goto");
    await page.goto("https://herohero.co/login", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });
    await captureStateSnapshotWithConsole(page, "002-ihned-po-page-goto");
    await captureStateSnapshotWithConsole(page, "003-po-domcontentloaded");
    await captureStateSnapshotWithConsole(page, "004-po-uplnem-nacitani-stranky");

    await handleCookieBannerIfPresent(page);

    const HEROHERO_EMAIL = process.env.HEROHERO_EMAIL;
    const HEROHERO_PASSWORD = process.env.HEROHERO_PASSWORD;

    if (!HEROHERO_EMAIL || !HEROHERO_PASSWORD) {
      await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
      throw new Error("Chybí HEROHERO_EMAIL nebo HEROHERO_PASSWORD v prostředí.");
    }

    let existingLoginModal = await getLoginModal(page);

    if (!existingLoginModal) {
      console.log("🔍 Login modal není otevřen, hledám přihlašovací tlačítko / odkaz...");

      const loginCandidateLocators = [
        page.locator('a[href*="login"]'),
        page.locator('button:has-text("Přihlásit")'),
        page.locator('button:has-text("Log in")'),
        page.locator('a:has-text("Přihlásit")'),
        page.locator('a:has-text("Log in")'),
        page.getByRole("button", { name: /přihlásit|log in/i }),
        page.getByRole("link", { name: /přihlásit|log in/i }),
        page.locator('[data-testid*="login"]'),
        page.locator('[class*="login" i]')
      ];

      let clickedLoginButton = false;

      for (const candidateLocator of loginCandidateLocators) {
        if (page.isClosed()) break;
        const count = await candidateLocator.count().catch(() => 0);
        
        for (let i = 0; i < count; i++) {
          const loc = candidateLocator.nth(i);
          const isVis = await loc.isVisible().catch(() => false);
          
          if (isVis) {
            console.log(`🎯 Nalezeno přihlašovací tlačítko/odkaz (index ${i}). Pokouším se kliknout...`);
            await safeClick(page, loc, "Open Login Modal");
            clickedLoginButton = true;
            await page.waitForTimeout(1000);
            break;
          }
        }
        if (clickedLoginButton) break;
      }

      existingLoginModal = await getLoginModal(page);
      
      if (!clickedLoginButton && !existingLoginModal) {
        console.warn("⚠️ Tlačítko nenalezeno v DOMu, zkouším přímé vyvolání /login URL...");
        await page.goto("https://herohero.co/login", {
          waitUntil: "networkidle",
          timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
        });
        await page.waitForTimeout(1500);
      }
    }
      if (!clickedLoginButton) {
        await captureStateSnapshotWithConsole(page, "033-pred-kazdym-throw");
        throw new Error("Nelze najít tlačítko Přihlásit se / Log in pro otevření login modalu.");
      }
    }

    const openedModal = await getLoginModal(page);
    if (openedModal) {
      await openedModal.waitFor({
        state: "visible",
        timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
      });
    }

    await executeModalLogin(page, HEROHERO_EMAIL, HEROHERO_PASSWORD);
    await saveStorageStateAtomically(context, CONFIG.STORAGE_STATE_PATH);

    await captureStateSnapshotWithConsole(page, "035-tesne-pred-ukoncenim-programu");

    return {
      success: true,
      job,
    };
  } catch (err) {
    await captureStateSnapshotWithConsole(page, "034-v-kazdem-catch-bloku");
    await dumpAllDiagnosticArtifacts(page, context, err);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = publishHeroHero;
