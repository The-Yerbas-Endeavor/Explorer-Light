import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Explorer serves an explicit crawler policy', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');

  assert.ok(server.includes("['/robots.txt', ['robots.txt', 'text/plain; charset=utf-8']]"));
  assert.ok(robots.includes('User-agent: GPTBot\nDisallow: /'));
  assert.ok(robots.includes('User-agent: OAI-SearchBot\nAllow: /'));
  assert.ok(robots.includes('Disallow: /api/'));
  assert.ok(robots.includes('Disallow: /ext/'));
});

test('nginx bot guard mirrors the production per-IP protections', async () => {
  const guard = await readFile(new URL('../scripts/install-nginx-bot-guard.sh', import.meta.url), 'utf8');
  const installer = await readFile(new URL('../scripts/install-fresh-server.sh', import.meta.url), 'utf8');

  for (const source of [guard, installer]) {
    assert.ok(source.includes('zone=explorer_all:10m rate=10r/s'));
    assert.ok(source.includes('zone=explorer_scraper:10m rate=1r/s'));
    assert.ok(source.includes('zone=explorer_heavy:10m rate=2r/s'));
    assert.ok(source.includes('limit_req zone=explorer_all burst=40 nodelay'));
    assert.ok(source.includes('limit_req zone=explorer_scraper burst=5 nodelay'));
    assert.ok(source.includes('limit_req zone=explorer_heavy burst=4 nodelay'));
    assert.ok(source.includes('limit_conn explorer_conn 20'));
    assert.ok(source.includes('limit_conn explorer_heavy_conn 4'));
    assert.ok(source.includes('~*GPTBot 1'));
    assert.ok(source.includes('OAI-SearchBot|Googlebot|bingbot'));
  }
});

test('existing-server bot guard validates and can roll nginx back', async () => {
  const guard = await readFile(new URL('../scripts/install-nginx-bot-guard.sh', import.meta.url), 'utf8');

  assert.ok(guard.includes('nginx -t'));
  assert.ok(guard.includes('rollback()'));
  assert.ok(guard.includes('restoring previous nginx/fail2ban configuration'));
  assert.ok(guard.includes('fail2ban-client -t'));
  assert.ok(guard.includes('maxretry = 30'));
  assert.ok(guard.includes('findtime = 10m'));
  assert.ok(guard.includes('bantime = 1h'));
});
