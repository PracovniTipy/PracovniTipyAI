const { chromium } = require("playwright");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - ULTIMATE FIX");
console.log("==========================================");

const CONFIG = {
  HEADLESS: process.env.HEADLESS !== "false",
  TIMEOUTS: {
    PAGE_NAVIGATION: 45000,
    ELEMENT_WAIT: 30000,
    LOGIN_WAIT: 20000,
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

async function handleCookieBannerIfPresent(page) {
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
      break;
    }
  }
}

async function nukeOverlays(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay, [role="dialog"], div[class*="modal"], div[class*="overlay"]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
        }
      });
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    // Ignorujeme
  }
}

async function getLoginModal(page) {
  const modalHandles = await page.locator('[role="dialog"], [class*="modal" i]').all();
  for (const handle of modalHandles) {
    const hasInputs = (await handle.locator('input[type="email"], input[name="email"], input[type="password"]').count().catch(() => 0)) > 0;
    const isVisible = await handle.isVisible().catch(() => false);
    if (hasInputs && isVisible) return handle;
  }
  const directForm = page.locator('form, div').filter({ has: page.locator('input[type="email"]') }).first();
  if (await directForm.isVisible().catch(() => false)) return directForm;
  
  return null;
}

async function executeModalLogin(page, email, password) {
  let loginModal = null;
  for (let i = 0; i < 20; i++) {
    loginModal = await getLoginModal(page);
    if (loginModal) break;
    await page.waitForTimeout(1000);
  }

  if (!loginModal) throw new Error("Přihlašovací formulář nebyl nalezen.");

  const emailInput = loginModal.locator('input[type="email"], input[placeholder*="E-mail" i], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
  
  await emailInput.click();
  await emailInput.fill(email);

  const arrowBtn = loginModal.locator('input[type="email"] ~ button, input[type="email"] + button, button:has(svg), button[type="submit"]').last();
  await arrowBtn.click();

  const passwordInput = loginModal.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });

  await passwordInput.click();
  await passwordInput.fill(password);

  const submitBtn = loginModal.locator('button:has-text("Pokračovat"), button[type="submit"]').last();
  await submitBtn.click();

  await page.waitForTimeout(6000);
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

  if (job.description && job.description.length > 0) {
    output += `\n🔧 Náplň práce\n\n`;
    for (const point of job.description) {
      output += `• ${point}\n`;
    }
  }

  if (job.accommodation && job.accommodation.length > 0) {
    output += `\n🏠 Ubytování\n\n`;
    for (const point of job.accommodation) {
      output += `• ${point}\n`;
    }
  }

  if (job.requirements && job.requirements.length > 0) {
    output += `\n📋 Požadavky\n\n`;
    for (const point of job.requirements) {
      output += `• ${point}\n`;
    }
  }

  if (job.advantages && job.advantages.length > 0) {
    output += `\n⭐ Výhody\n\n`;
    for (const point of job.advantages) {
      output += `• ${point}\n`;
    }
  }

  return output.trim();
}

async function createHeroHeroPost(page, job) {
  console.log(`Vytvářím příspěvek pro pozici: ${job.title}`);
  
  if (!page.url().includes("/create")) {
    console.log("Přecházím na /create...");
    await page.goto("https://herohero.co/create", {
      waitUntil: "networkidle",
      timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION,
    }).catch(() => {});
  }

  console.log("Čekám na vykreslení editoru a hledám políčko pro nadpis...");
  await page.waitForTimeout(4000);
  await nukeOverlays(page);

  let titleInput = null;
  const titleSelectors = [
    'p:has-text("Začni psát...")',
    'div[data-placeholder*="Začni" i]',
    'div[contenteditable="true"]',
    'textarea',
    'input[type="text"]'
  ];

  for (let attempt = 1; attempt <= 5; attempt++) {
    await nukeOverlays(page);
    for (const sel of titleSelectors) {
      const loc = page.locator(sel).first();
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        try {
          await loc.waitFor({ state: "visible", timeout: 3000 });
          titleInput = loc;
          console.log(`✅ Políčko pro nadpis nalezeno pomocí: ${sel}`);
          break;
        } catch (e) {
          // Pokračujeme
        }
      }
    }
    if (titleInput) break;
    console.log(`⚠️ Pokus č. ${attempt}: Políčko nenalezeno, čekám dalších 5 sekund...`);
    await page.waitForTimeout(5000);
  }

  if (!titleInput) {
    const fullHtml = await page.content();
    console.log("DEBUG - Celé HTML začátek:", fullHtml.slice(0, 500));
    throw new Error("Nepodařilo se najít políčko pro nadpis příspěvku.");
  }

  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.click({ force: true });
  await page.keyboard.type(job.title || "Nová pracovní nabídka", { delay: 30 });

  console.log("Vkládám formátovaný text nabídky...");
  const formattedText = formatJobPost(job);
  
  await nukeOverlays(page);
  
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  
  await page.evaluate((text) => {
    navigator.clipboard.writeText(text);
  }, formattedText);
  
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(2000);

  console.log(`Příspěvek "${job.title}" byl úspěšně vyplněn.`);
}

async function publishHeroHero(inputJob) {
  const job = (!inputJob || Object.keys(inputJob).length === 0 || !inputJob.title) 
    ? DEFAULT_TEST_JOB 
    : inputJob;

  console.log(`Používám data pro pozici: ${job.title}`);

  let browser;
  try {
    browser = await chromium.launch({ 
      headless: CONFIG.HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
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
    await createHeroHeroPost(page, job);

    return { success: true, job };
  } catch (err) {
    console.error(`❌ [CHYBA]:`, err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = publishHeroHero;
