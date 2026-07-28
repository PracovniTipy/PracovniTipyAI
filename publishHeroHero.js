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

async function executeModalLogin(page, email, password) {
  console.log("Klikám na levé menu na 'Profil' pro otevření přihlášení...");
  
  // Kliknutí na tlačítko profilu v levém bočním panelu
  const profileNavBtn = page.locator('aside, nav, div').filter({ hasText: /^Profil$/ }).first();
  await profileNavBtn.click({ timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT }).catch(async () => {
    // Záložní pokus podle běžného selektoru pro profil v levém menu
    await page.locator('a[href*="profile"], button:has-text("Profil")').first().click();
  });

  console.log("Zahajuji přihlašovací formulář...");
  let loginModal = await getLoginModal(page);
  if (!loginModal) throw new Error("Login modal nebyl nalezen.");

  const emailInput = loginModal.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  
  console.log("Vyplňuji e-mail...");
  await emailInput.click();
  await emailInput.fill(email);

  console.log("Odesílám e-mail šipkou...");
  const arrowBtn = loginModal.locator('button:has(svg), button[type="submit"]').last();
  await arrowBtn.click();

  console.log("Čekám na pole pro heslo v novém formuláři...");
  const passwordInput = loginModal.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });

  console.log("Vyplňuji heslo...");
  await passwordInput.click();
  await passwordInput.fill(password);

  console.log("Klikám na tlačítko pro odeslání hesla...");
  const submitBtn = loginModal.locator('button:has-text("Pokračovat"), button[type="submit"]');
  await submitBtn.click();

  console.log("Čekám na načtení po přihlášení...");
  await page.waitForTimeout(4000);
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
    
    console.log("Otevírám herohero.co...");
    await page.goto("https://herohero.co/", {
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
