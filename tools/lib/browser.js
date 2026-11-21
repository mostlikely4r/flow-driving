// Where the browser is. The screenshot and clip tools drive a real Chrome or
// Edge through puppeteer-core, which needs the executable's path. Set
// BROWSER_PATH to override; otherwise the first of the usual installs wins.
import { existsSync } from 'node:fs';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function browserPath() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('Set BROWSER_PATH to a Chrome or Edge executable');
  return found;
}
