import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { frontendAssets } from './frontend-assets.mjs';

const apiUrl = URL.parse(process.env.CALENDAR_API_URL?.trim() ?? '');
if (apiUrl?.protocol !== 'https:' || apiUrl.pathname !== '/' || apiUrl.username || apiUrl.password
    || apiUrl.search || apiUrl.hash) {
  throw new Error('Set CALENDAR_API_URL to the public HTTPS origin of the Worker.');
}

const dist = new URL('./dist/', import.meta.url);
const [appSource] = frontendAssets.get('/app.js');
const app = await readFile(new URL(appSource, import.meta.url));
const appVersion = createHash('sha256').update(app).digest('hex').slice(0, 12);
await mkdir(new URL('vendor/', dist), { recursive: true });
for (const [path, [source]] of frontendAssets) {
  const input = new URL(source, import.meta.url);
  const output = new URL(path.slice(1), dist);
  if (path === '/index.html') {
    const origin = apiUrl.origin.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const html = await readFile(input, 'utf8');
    await writeFile(output, html
      .replace('name="calendar-api-origin" content=""', () => `name="calendar-api-origin" content="${origin}"`)
      .replace('src="app.js"', `src="app.js?v=${appVersion}"`));
  } else {
    await copyFile(input, output);
  }
}
