import webpush from 'web-push';
import { redisFor, vercelToPages } from './_redis.js';
import {
  PUSH_ORIGINS, validDeviceId, validReminder, validSubscription,
  shouldDispatch, encryptRecord, decryptRecord
} from './push-core.js';

const SUBSCRIPTIONS = 'vd:push:subscriptions';
const NINETY_DAYS = 90 * 86400;
const EVENTS = new Set(['prompt_view', 'permission_granted', 'notification_click', 'daily_start', 'daily_complete']);

function cors(req, res) {
  const origin = PUSH_ORIGINS.includes(req.headers.origin) ? req.headers.origin : PUSH_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

async function limited(redis, req) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  return (await redis.incr(`vd:rl:push:${ip}`, 3600)) > 60;
}

async function getRecord(redis, deviceId, env) {
  const encrypted = await redis.hget(SUBSCRIPTIONS, deviceId);
  return encrypted ? decryptRecord(encrypted, env.PUSH_DATA_KEY) : null;
}

async function putRecord(redis, deviceId, record, env) {
  const encrypted = await encryptRecord(record, env.PUSH_DATA_KEY);
  await redis.hset(SUBSCRIPTIONS, { [deviceId]: encrypted });
  await redis.expire(SUBSCRIPTIONS, NINETY_DAYS);
}

async function sendPush(record, env) {
  const payload = JSON.stringify({
    title: '字鬥英雄・今日 10 題',
    body: '十題就收工，用 5–8 分鐘把今天的記憶接上。',
    url: '/?daily=1&push=1'
  });
  if (env.__sendNotification) return env.__sendNotification(record.subscription, payload);
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:teacher@vocab-duel.pages.dev', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification(record.subscription, payload, { TTL: 3600, urgency: 'normal' });
}

export async function handler(req, res, env) {
  const redis = env.__redis || redisFor(env.DB);
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const op = req.body?.op || req.query?.op;
  if (req.method === 'GET') {
    if (op === 'key') return res.status(200).json({ ok: 1, publicKey: env.VAPID_PUBLIC_KEY || '' });
    return res.status(405).json({ error: 'method' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  if (op === 'dispatch') {
    if (!env.PUSH_DISPATCH_SECRET || req.headers.authorization !== `Bearer ${env.PUSH_DISPATCH_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
    if (!env.PUSH_DATA_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'push not configured' });
    const all = await redis.hgetall(SUBSCRIPTIONS) || {};
    let sent = 0, skipped = 0, removed = 0, failed = 0;
    for (const [deviceId, encrypted] of Object.entries(all)) {
      try {
        const record = await decryptRecord(encrypted, env.PUSH_DATA_KEY);
        const now = env.__now || Date.now();
        if (record.expiresAt <= now) { await redis.hdel(SUBSCRIPTIONS, deviceId); removed++; continue; }
        const decision = shouldDispatch(record, now);
        if (!decision.send) { skipped++; continue; }
        try {
          await sendPush(record, env);
          record.lastSentDate = decision.date;
          await putRecord(redis, deviceId, record, env);
          sent++;
        } catch (error) {
          const status = error?.statusCode || error?.status;
          if (status === 404 || status === 410) { await redis.hdel(SUBSCRIPTIONS, deviceId); removed++; }
          else failed++;
        }
      } catch { await redis.hdel(SUBSCRIPTIONS, deviceId); removed++; }
    }
    return res.status(200).json({ ok: 1, sent, skipped, removed, failed });
  }

  if (!PUSH_ORIGINS.includes(req.headers.origin)) return res.status(403).json({ error: 'origin' });
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'content-type' });
  if (await limited(redis, req)) return res.status(429).json({ error: 'rate-limit' });
  const deviceId = req.body?.deviceId;
  if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'deviceId' });

  try {
    if (op === 'subscribe') {
      if (!env.PUSH_DATA_KEY || !env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'push not configured' });
      if (!validSubscription(req.body.subscription) || !validReminder(req.body.time)) return res.status(400).json({ error: 'subscription' });
      const timezone = String(req.body.timezone || 'Asia/Taipei').slice(0, 64);
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { return res.status(400).json({ error: 'timezone' }); }
      const now = env.__now || Date.now();
      await putRecord(redis, deviceId, {
        subscription: req.body.subscription,
        time: req.body.time,
        timezone,
        origin: req.headers.origin,
        enabled: true,
        doneDate: '', lastSentDate: '', createdAt: now, expiresAt: now + NINETY_DAYS * 1000
      }, env);
      return res.status(200).json({ ok: 1 });
    }
    if (op === 'update') {
      if (!validReminder(req.body.time)) return res.status(400).json({ error: 'time' });
      const record = await getRecord(redis, deviceId, env);
      if (!record) return res.status(404).json({ error: 'not-found' });
      record.time = req.body.time;
      record.enabled = req.body.enabled !== false;
      record.expiresAt = (env.__now || Date.now()) + NINETY_DAYS * 1000;
      await putRecord(redis, deviceId, record, env);
      return res.status(200).json({ ok: 1 });
    }
    if (op === 'pause') {
      const record = await getRecord(redis, deviceId, env);
      if (!record) return res.status(404).json({ error: 'not-found' });
      const until = new Date((env.__now || Date.now()) + 7 * 86400000);
      record.pausedUntil = until.toISOString().slice(0, 10);
      record.enabled = true;
      await putRecord(redis, deviceId, record, env);
      return res.status(200).json({ ok: 1 });
    }
    if (op === 'done') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || ''))) return res.status(400).json({ error: 'date' });
      const record = await getRecord(redis, deviceId, env);
      if (!record) return res.status(200).json({ ok: 1 });
      record.doneDate = req.body.date;
      await putRecord(redis, deviceId, record, env);
      return res.status(200).json({ ok: 1 });
    }
    if (op === 'event') {
      const event = String(req.body.event || '');
      if (!EVENTS.has(event)) return res.status(400).json({ error: 'event' });
      const date = new Date(env.__now || Date.now()).toISOString().slice(0, 10);
      await redis.incr(`vd:push:event:${date}:${event}`, 120 * 86400);
      return res.status(200).json({ ok: 1 });
    }
    if (op === 'unsubscribe') {
      await redis.hdel(SUBSCRIPTIONS, deviceId);
      return res.status(200).json({ ok: 1 });
    }
    return res.status(400).json({ error: 'op' });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
}

export const onRequest = vercelToPages(handler);
