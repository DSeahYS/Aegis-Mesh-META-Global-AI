import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PYTHON_PATH = 'C:\\VSCode Folder\\AEGIS-MESH\\backend\\venv\\Scripts\\python.exe';

const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const outputDir = path.resolve('docs/images');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function waitForBackend(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log('Starting backend server...');
  const backendProc = spawn(PYTHON_PATH, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.resolve('backend'),
    stdio: 'ignore',
  });

  const backendReady = await waitForBackend('http://127.0.0.1:8000/docs');
  console.log(`Backend ready: ${backendReady}`);

  console.log(`Using browser: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Mission Dashboard
  console.log('Capturing Mission Dashboard...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Mission Dashboard');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'mission-dashboard.png') });

  // 2. 3D Orbital View
  console.log('Capturing 3D Orbital View...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '3D Orbital View');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 4500));
  await page.screenshot({ path: path.join(outputDir, 'hero-orbital-globe.png') });
  await page.screenshot({ path: path.join(outputDir, 'screenshot.png') });

  // 3. Conjunction Assessment
  console.log('Capturing Conjunction Assessment...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Conjunction Assessment');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'conjunction-assessment.png') });

  // 4. Mesh Network & ISL
  console.log('Capturing Mesh Network & ISL...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Mesh Network & ISL');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'mesh-network.png') });

  // 5. System Architecture
  console.log('Capturing System Architecture...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'System Architecture');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'system-architecture.png') });

  // 6. AEGIS-MESH Edge Lab
  console.log('Capturing AEGIS-MESH Edge Lab...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'AEGIS-MESH Edge Lab');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'edge-retrieval-lab.png') });

  // 7. GPU Inference Proof
  console.log('Capturing GPU Inference Proof...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'GPU Inference Proof');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'hardware-profiler.png') });

  // 8. Backend Live Console
  console.log('Capturing Backend Live Console...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Backend Live Console');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outputDir, 'backend-console.png') });

  // 9. V&V Proof with live backend active!
  console.log('Capturing V&V Proof (Pipeline)...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'V&V Proof');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 2500));

  // Trigger RUN PIPELINE
  await page.evaluate(() => {
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('RUN PIPELINE'));
    if (runBtn) runBtn.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(outputDir, 'vv-proof.png') });

  // Switch to Verification Suite (16 Oracles)
  console.log('Capturing V&V Proof (16 Analytical Oracles)...');
  await page.evaluate(() => {
    const tabBtn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('VERIFICATION SUITE'));
    if (tabBtn) tabBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  // Run Self-Test
  await page.evaluate(() => {
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('RUN FULL TEST') || b.innerText.includes('RUN'));
    if (runBtn) runBtn.click();
  });
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(outputDir, 'vv-proof-oracles.png') });

  await browser.close();
  backendProc.kill();
  console.log('Screenshots refreshed with live backend active!');
}

run().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
