import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('layout theme toggle defaults to New and persists Original choice', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.ok(html.includes('data-layout-theme-option="new"'));
  assert.ok(html.includes('data-layout-theme-option="original"'));
  assert.ok(html.includes('>New</button>'));
  assert.ok(html.includes('>Original</button>'));
  assert.ok(html.indexOf('/theme.js') < html.indexOf('/styles.css'));
  assert.ok(theme.includes("const fallbackTheme = 'new'"));
  assert.ok(theme.includes('yerbas-explorer-layout-theme'));
  assert.ok(theme.includes('localStorage.setItem(storageKey, theme)'));
  assert.ok(theme.includes('yerbas-layout-theme-change'));
  assert.ok(server.includes("['/theme.js', ['theme.js', 'text/javascript; charset=utf-8']]"));
});

test('Original mode recreates the legacy Exor visual language', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(css.includes('html[data-layout-theme="original"]'));
  assert.ok(css.includes('--ink: #222'));
  assert.ok(css.includes('--panel-solid: #303030'));
  assert.ok(css.includes('--panel-raised: #444'));
  assert.ok(css.includes('--green: #00bc8c'));
  assert.ok(css.includes('.original-header-panels'));
  assert.ok(css.includes('.original-latest-table'));
});

test('Original home restores the classic Yerbas explorer hierarchy using live RPC data', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(app.includes('async function renderOriginalHome()'));
  assert.ok(app.includes("document.title = 'Yerbas Block Explorer'"));
  assert.ok(app.includes('A listing of all verified Yerbas transactions'));
  assert.ok(app.includes('Latest Transactions'));
  assert.ok(app.includes("api('/ext/getsummary')"));
  assert.ok(app.includes("api('/api/transactions?limit=25&blocks=8')"));
  assert.ok(app.includes("if (layoutTheme() === 'original' && location.pathname === '/')"));
  assert.ok(app.includes("window.addEventListener('yerbas-layout-theme-change'"));
});

test('New and Original have independent header navigation treatments', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(html.includes('class="header-link new-nav-link assets-link" href="/assets"'));
  assert.ok(html.includes('class="header-link original-nav-link" href="/">Explorer</a>'));
  assert.ok(html.includes('class="header-link original-nav-link" href="/transactions">Transactions</a>'));
  assert.ok(html.includes('class="header-link original-nav-link" href="/markets">Markets</a>'));
  assert.ok(css.includes('html[data-layout-theme="original"] .new-nav-link'));
  assert.ok(css.includes('html[data-layout-theme="original"] .original-nav-link'));
});


test('Original palette matches the deployed legacy explorer colors', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.ok(css.includes('--ink: #000000'));
  assert.ok(css.includes('background: #4f7942'));
  assert.ok(css.includes('background: #444444'));
  assert.ok(css.includes('background: #0c0c0c'));
  assert.ok(css.includes('background: #89c180'));
});
