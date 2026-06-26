import { chromium } from 'playwright';

let browserInstance = null;

const PROXY_URL = process.env.HTTPS_PROXY || '';
const CA_CERT = '/root/.ccr/ca-bundle.crt';

export async function getBrowser() {
  if (!browserInstance) {
    const launchOpts = {
      headless: true,
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors'
      ]
    };

    if (PROXY_URL) {
      launchOpts.proxy = { server: PROXY_URL };
    }

    browserInstance = await chromium.launch(launchOpts);
  }
  return browserInstance;
}

export async function getPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'hu-HU',
    ignoreHTTPSErrors: true,
    geolocation: { latitude: 47.4979, longitude: 19.0402 },
    permissions: ['geolocation']
  });
  return context.newPage();
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function takeScreenshot(page, path) {
  await page.screenshot({ path, fullPage: true, type: 'png' });
}

export async function getPageMetrics(page) {
  const timing = await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0];
    return perf ? {
      dns: perf.domainLookupEnd - perf.domainLookupStart,
      connect: perf.connectEnd - perf.connectStart,
      ttfb: perf.responseStart - perf.requestStart,
      domLoad: perf.domContentLoadedEventEnd - perf.navigationStart,
      fullLoad: perf.loadEventEnd - perf.navigationStart
    } : null;
  });
  return timing;
}
