/**
 * Main Diagnostic & Automation Script
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ====================================================
// DIAGNOSTIC ARTIFACTS DUMP
// ====================================================
async function dumpAllDiagnosticArtifacts(page, context, err = null) {
  const outputDir = path.join(process.cwd(), 'diagnostic-reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Cookies
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(
      path.join(outputDir, 'cookies.json'),
      JSON.stringify(cookies, null, 2)
    );
  } catch (e) {
    console.error('Failed to dump cookies:', e.message);
  }

  // 2. Local Storage & Session Storage
  try {
    if (page && !page.isClosed()) {
      const localStorageData = await page.evaluate(() => JSON.stringify(window.localStorage));
      const sessionStorageData = await page.evaluate(() => JSON.stringify(window.sessionStorage));
      
      fs.writeFileSync(
        path.join(outputDir, 'localStorage.json'),
        JSON.stringify(JSON.parse(localStorageData || '{}'), null, 2)
      );
      fs.writeFileSync(
        path.join(outputDir, 'sessionStorage.json'),
        JSON.stringify(JSON.parse(sessionStorageData || '{}'), null, 2)
      );
    }
  } catch (e) {
    console.error('Failed to dump web storage:', e.message);
  }

  // 3. Network, Timings, URL History (Dummy containers / workflow state placeholders)
  try {
    fs.writeFileSync(
      path.join(outputDir, 'network.json'),
      JSON.stringify({ status: 'dumped', timestamp }, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'timings.json'),
      JSON.stringify({ status: 'dumped', timestamp }, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'url-history.json'),
      JSON.stringify({ currentUrl: page ? page.url() : 'unknown', timestamp }, null, 2)
    );
  } catch (e) {
    console.error('Failed to dump network/timings/history:', e.message);
  }

  // 4. Report Markdown
  try {
    const reportContent = `# Diagnostic Report
- **Timestamp:** ${new Date().toISOString()}
- **Status:** ${err ? 'FAILED' : 'SUCCESS'}
- **URL:** ${page ? page.url() : 'N/A'}
${err ? `\n## Error Details\n\`\`\`\n${err.stack || err.message || err}\n\`\`\`\n` : ''}
`;
    fs.writeFileSync(path.join(outputDir, 'report.md'), reportContent);
  } catch (e) {
    console.error('Failed to dump report.md:', e.message);
  }
}

// ====================================================
// HELPER FUNCTIONS (SafeClick, Workflows, etc.)
// ====================================================
async function safeClick(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.click(selector);
}

async function loginWorkflow(page) {
  // Login workflow implementation (NEMĚNĚNO)
  console.log('Executing login workflow...');
}

async function uploadWorkflow(page) {
  // Upload workflow implementation (NEMĚNĚNO)
  console.log('Executing upload workflow...');
}

async function publishWorkflow(page) {
  // Publish workflow implementation (NEMĚNĚNO)
  console.log('Executing publish workflow...');
}

async function oauthWorkflow(page) {
  // OAuth workflow implementation (NEMĚNĚNO)
  console.log('Executing OAuth workflow...');
}

async function cookieWorkflow(page) {
  // Cookie workflow implementation (NEMĚNĚNO)
  console.log('Executing Cookie workflow...');
}

// ====================================================
// MAIN RUNNER WORKFLOW
// ====================================================
async function runAutomation() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: 'videos/' },
    recordHar: { path: 'har/trace.har' }
  });

  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  // Flag zabraňující duplicitnímu generování reportu
  let diagnosticsDumped = false;

  try {
    // 1. Workflows
    await cookieWorkflow(page);
    await oauthWorkflow(page);
    await loginWorkflow(page);
    await uploadWorkflow(page);
    await publishWorkflow(page);

    console.log('Workflow fully executed with success.');
  } catch (err) {
    console.error('Workflow error detected:', err);

    // Vygenerujeme diagnostické artefakty pouze jednou v případe chyby
    await dumpAllDiagnosticArtifacts(page, context, err);
    diagnosticsDumped = true;

    throw err;
  } finally {
    // Pokud artefakty nebyly vygenerovány v catch, vygenerujeme je zde
    if (!diagnosticsDumped) {
      await dumpAllDiagnosticArtifacts(page, context);
    }

    // Úklid zdrojů a ukončení
    await context.tracing.stop({ path: 'trace.zip' });
    await context.close();
    await browser.close();
  }
}

// ====================================================
// EXPORTS & EXECUTION
// ====================================================
module.exports = {
  runAutomation,
  dumpAllDiagnosticArtifacts,
  safeClick,
  loginWorkflow,
  uploadWorkflow,
  publishWorkflow,
  oauthWorkflow,
  cookieWorkflow
};

if (require.main === module) {
  runAutomation().catch((err) => {
    console.error('Fatal execution failure:', err);
    process.exit(1);
  });
}
