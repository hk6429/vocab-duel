export const PUSH_ORIGINS = [
  'https://vocab-duel.vercel.app',
  'https://vocab-duel.pages.dev',
  'https://vocab-duel.netlify.app',
  'http://localhost:8765'
];

export function validReminder(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 17 && hour <= 22 && (minute === 0 || minute === 30) && !(hour === 22 && minute > 0);
}

export function validSubscription(subscription) {
  if (!subscription || !subscription.keys) return false;
  try {
    const endpoint = new URL(subscription.endpoint);
    return endpoint.protocol === 'https:'
      && typeof subscription.keys.p256dh === 'string' && subscription.keys.p256dh.length >= 20
      && typeof subscription.keys.auth === 'string' && subscription.keys.auth.length >= 8;
  } catch { return false; }
}

export function validDeviceId(value) {
  return /^[a-zA-Z0-9_-]{16,80}$/.test(String(value || ''));
}

export function localClock(nowMs, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(nowMs));
    const get = type => parts.find(part => part.type === type)?.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  } catch { return null; }
}

export function shouldDispatch(subscription, nowMs = Date.now()) {
  if (!subscription || !subscription.enabled || !validReminder(subscription.time)) return { send: false };
  const local = localClock(nowMs, subscription.timezone || 'Asia/Taipei');
  if (!local || subscription.doneDate === local.date || subscription.lastSentDate === local.date || subscription.pausedUntil >= local.date) return { send: false, ...local };
  const [hour, minute] = local.time.split(':').map(Number);
  if (hour > 22 || (hour === 22 && minute > 0)) return { send: false, ...local };
  const [targetHour, targetMinute] = subscription.time.split(':').map(Number);
  const delta = hour * 60 + minute - (targetHour * 60 + targetMinute);
  return { send: delta >= 0 && delta < 15, ...local };
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function dataKey(secret, usage) {
  const raw = fromBase64Url(String(secret || ''));
  if (raw.length !== 32) throw new Error('PUSH_DATA_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usage);
}

export async function encryptRecord(record, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await dataKey(secret, ['encrypt']);
  const plain = new TextEncoder().encode(JSON.stringify(record));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptRecord(value, secret) {
  const [ivText, cipherText] = String(value || '').split('.');
  if (!ivText || !cipherText) throw new Error('invalid encrypted record');
  const key = await dataKey(secret, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivText) }, key, fromBase64Url(cipherText));
  return JSON.parse(new TextDecoder().decode(plain));
}
