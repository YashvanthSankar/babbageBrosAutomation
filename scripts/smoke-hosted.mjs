#!/usr/bin/env node
// Read-only / unauthenticated release smoke check. Never signs in or triggers providers.
const base = (process.argv[2] ?? 'https://automation.zapdos.me').replace(/\/$/, '');
const checks = [
  ['GET', '/', [200]],
  ['GET', '/api/health', [200]],
  ['GET', '/api/auth/providers', [200]],
  ['GET', '/api/dashboard', [401]],
  ['GET', '/api/calendar/connection', [401]],
  ['GET', '/api/automation/status', [401]],
  ['GET', '/api/automation/activity', [401]],
  ['POST', '/api/automation/weekly', [401]],
  ['POST', '/api/automation/weekly/cron', [401, 503]],
  ['POST', '/api/email/demo-send', [401]],
];
let failures = 0;
for (const [method, path, expected] of checks) {
  try {
    const response = await fetch(`${base}${path}`, {
      method, redirect: 'manual', signal: AbortSignal.timeout(12_000),
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const ok = expected.includes(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${method} ${path}: ${response.status} (expected ${expected.join(' or ')})`);
    if (!ok) failures++;
    if (path === '/api/auth/providers' && ok) {
      const providers = await response.json();
      console.log(`  Providers advertised: ${Object.keys(providers).join(', ')}`);
    }
  } catch (error) {
    console.log(`FAIL ${method} ${path}: ${error instanceof Error ? error.name : 'network error'}`);
    failures++;
  }
}
console.log(failures ? `${failures} check(s) failed; hosted release NOT verified.` : 'Unauthenticated smoke checks passed; authenticated flows and external delivery remain unverified.');
process.exitCode = failures ? 1 : 0;
