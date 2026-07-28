const { chromium } = require("playwright");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - CLEAN RUNNER");
console.log("==========================================");

const CONFIG = {
  HEADLESS: process.env.HEADLESS !== "false",
  TIMEOUTS: {
    PAGE_NAVIGATION: 35000,
    ELEMENT_WAIT: 10000,
    LOGIN_WAIT: 15000,
  },
  VIEWPORT: { width: 1280, height: 900 },
  USER_AGENT:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  LOCALE: "cs-CZ",
};

async function handleCookieBannerIfPresent(page) {
  console.log("🍪 Vyhledávám tlačítko pro přijetí cookies...");
  const candidateSelectors = [
    'button[data-testid="cookie-modal-agree"]',
    '[data-testid="cookie-modal-agree"]',
    'button:has-text("Povolit vše")',
    'button:has-text("Accept")',
  ];

  for (const selector of candidateSelectors) {
    if (page.isClosed()) return;
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);
    if (count > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.click({ timeout: 5000 }).catch(() => {});
      console.log(`✅ Cookies potvrzeny přes selector: ${selector}`);
      break;
    }
  }
}

async function getLoginModal(page) {
  const modalHandles = await page.locator('[role="dialog"], [class*="modal" i]').all();
  for (const handle of modalHandles) {
    const hasInputs = (await handle.locator('input[type="email"], input[name="email"], input[type="password"]').count().catch(() => 0)) > 0;
    const isVisible = await handle.isVisible().catch(() => false);
    if (hasInputs && isVisible) return handle;
  }
  return null;
}

async function findLoginButton(page, loginModal, mode) {
  console.log(`Hledám tlačítko v režimu: ${mode}`);
  
  if (mode === "continue") {
    const arrowButtons = await loginModal.locator('button:has(svg), button[type="submit"], button').all();
    for (const btn of arrowButtons) {
      const info = await btn.evaluate((el) => {
        const text = (el.innerText || "").trim();
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        const hasSvg = el.querySelector("svg") !== null;
        return { isVisible, hasSvg, text };
      }).catch(() => null);

      if (info && info.isVisible && (info.hasSvg || info.text === "")) {
        return btn;
      }
    }
  }

  const keywords = mode === "continue" ? ["pokračovat", "continue", "next"] : ["přihlásit", "login", "sign in"];
  const buttons = await loginModal.locator("button").all();
  
  for (const btn of buttons) {
    const matches = await btn.evaluate((el, kws) => {
      const text = (el.innerText || "").toLowerCase();
      return kws.some(kw => text.includes(kw));
    }, keywords).catch(() => false);

    if (matches && (await btn.isVisible().catch(() => false))) {
      return btn;
    }
  }

  throw new Error(`Tlačítko pro režim ${mode} nebylo nalezeno.`);
}

async function executeModalLogin(page, email, password) {
  console.log("Zahajuji přihlašovací formulář...");

  let loginModal = await getLoginModal(page);
  if (!loginModal) throw new Error("Login modal nebyl nalezen.");

  const emailInput = loginModal.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  
  console.log("Vyplňuji e-mail...");
  await emailInput.click();
  await emailInput.fill(email);

  const continueBtn = await findLoginButton(page, loginModal, "continue");
  await continueBtn.click();

  console.log("Čekám na pole pro heslo...");
  const passwordInput = loginModal.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });

  console.log("Vyplňuji heslo...");
  await passwordInput.click();
  await passwordInput.fill(password);

  const submitBtn = await findLoginButton(page, loginModal, "submit");
  await submitBtn.click();

  console.log("Čekám na načtení editoru po přihlášení...");
  await page.waitForTimeout(3000);
  console.log("Přihlášení proběhlo úspěšně.");
}

async function publishHeroHero(job) {
  let browser;
  try {
    browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: CONFIG.LOCALE,
    });

    const page = await context.newPage();
    
    console.log("Otevírám herohero.co/login...");
    await page.goto("https://herohero.co/login", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    });

    await handleCookieBannerIfPresent(page);

    const email = process.env.HEROHERO_EMAIL;
    const password = process.env.HEROHERO_PASSWORD;
    if (!email || !password) throw new Error("Chybí přihlašovací údaje v prostředí.");

    await executeModalLogin(page, email, password);

    return { success: true, job };
  } catch (err) {
    console.error(`❌ [CHYBA]:`, err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = publishHeroHero;
