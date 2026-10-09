/** Public demo defaults to a no-send simulation. Live delivery needs an explicit
 * VPS opt-in and a pinned, consenting test destination for each provider. */
export function liveDemoAutomationsEnabled(): boolean {
  return (process.env.DEMO_LIVE_AUTOMATIONS ?? '').trim().toLowerCase() === 'true';
}

/** Separate opt-in for manual sends to an entered (not server-pinned) contact. */
export function manualRecipientDeliveryEnabled(): boolean {
  return liveDemoAutomationsEnabled() && (process.env.DEMO_LIVE_MANUAL_RECIPIENTS ?? '').trim().toLowerCase() === 'true';
}

export function demoEmailRecipient(): string {
  return (process.env.DEMO_AUTOMATION_EMAIL ?? '').trim().toLowerCase();
}

export function demoVoiceRecipient(): string {
  return (process.env.DEMO_AUTOMATION_PHONE ?? '').trim();
}

/** Open sign-in means any visitor can act as the demo professor. Even after an
 * operator opts into live testing, permit at most one outbound per provider
 * per UTC day to cap accidental or abusive calls/messages. */
export function liveDemoDailyKey(provider: string, now = new Date()): string {
  return `${provider}:public-demo:${now.toISOString().slice(0, 10)}`;
}
