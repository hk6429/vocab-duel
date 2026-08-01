/* 自願每日提醒：兩階段同意、時間自選、拒絕冷卻、可暫停或刪除。 */
const VDPush = (() => {
  const DEVICE_KEY = 'vd_push_device';
  const TIME_KEY = 'vd_push_time';
  const ENABLED_KEY = 'vd_push_enabled';
  const DENIED_KEY = 'vd_push_denied_until';
  const OUTBOX_KEY = 'vd_push_outbox';
  const PAUSED_KEY = 'vd_push_paused_until';

  function apiOrigin() {
    return location.hostname === 'vocab-duel.pages.dev' ? '/api/push' : 'https://vocab-duel.pages.dev/api/push';
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, '_');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function reminderOptions() {
    const out = [];
    for (let hour = 17; hour <= 21; hour++) out.push(`${hour}:00`, `${hour}:30`);
    out.push('22:00');
    return out;
  }

  async function post(body) {
    const response = await fetch(apiOrigin(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, deviceId: deviceId() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || '連線失敗');
    return data;
  }

  function applicationKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function subscribe(time) {
    const deniedUntil = Number(localStorage.getItem(DENIED_KEY) || 0);
    if (deniedUntil > Date.now()) throw new Error('你上次選擇不開啟，30 天後才會再顯示邀請。');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      localStorage.setItem(DENIED_KEY, String(Date.now() + 30 * 86400000));
      throw new Error('通知沒有開啟；不影響今日任務與所有功能。');
    }
    track('permission_granted');
    const keyResponse = await fetch(`${apiOrigin()}?op=key`, { cache: 'no-store' });
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || !keyData.publicKey) throw new Error('提醒服務尚未完成設定');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(keyData.publicKey) });
    await post({ op: 'subscribe', subscription: subscription.toJSON(), time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei' });
    localStorage.setItem(TIME_KEY, time);
    localStorage.setItem(ENABLED_KEY, '1');
  }

  function calendarReminder() {
    const time = localStorage.getItem(TIME_KEY) || '19:30';
    const [hour, minute] = time.split(':');
    const date = new Date(); date.setDate(date.getDate() + 1);
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${ymd}T${hour}${minute}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:字鬥英雄・今日 10 題', 'URL:https://vocab-duel.pages.dev/?daily=1', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    link.download = '字鬥英雄-每日提醒.ics';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function settingsCard(container) {
    if (!container) return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const time = localStorage.getItem(TIME_KEY) || '19:30';
    if (!supported) {
      container.innerHTML = `<div class="push-card"><b>這個瀏覽器不支援背景提醒</b><p>今日 10 題仍可完整使用，也可下載行事曆提醒。</p><button class="btn ghost" id="pushCalendar">下載每日行事曆提醒</button></div>`;
      container.querySelector('#pushCalendar').onclick = calendarReminder;
      return;
    }
    const enabled = localStorage.getItem(ENABLED_KEY) === '1' && Notification.permission === 'granted';
    const pausedUntil = localStorage.getItem(PAUSED_KEY) || '';
    container.innerHTML = `<div class="push-card">
      <b>${enabled ? (pausedUntil ? `🔕 提醒已暫停至 ${pausedUntil}` : '🔔 每日提醒已開啟') : '🔔 要在自己選的時間接到今日任務嗎？'}</b>
      <p>每天最多一則；今日已完成就不再提醒，22:00 後不補送。不開啟也能完整使用。</p>
      <label>提醒時間 <select id="pushTime">${reminderOptions().map(option => `<option value="${option}"${option === time ? ' selected' : ''}>${option}</option>`).join('')}</select></label>
      <div class="push-actions">
        <button class="btn" id="pushEnable">${enabled ? '儲存時間' : '開啟每日提醒'}</button>
        ${enabled ? '<button class="btn ghost" id="pushPause">暫停 7 天</button><button class="btn ghost" id="pushDelete">完全關閉</button>' : ''}
      </div><div class="push-status" id="pushStatus" aria-live="polite"></div>
    </div>`;
    track('prompt_view');
    const status = container.querySelector('#pushStatus');
    container.querySelector('#pushEnable').onclick = async () => {
      const chosen = container.querySelector('#pushTime').value;
      status.textContent = '正在儲存…';
      try {
        if (enabled) { await post({ op: 'update', time: chosen, enabled: true }); localStorage.setItem(TIME_KEY, chosen); localStorage.removeItem(PAUSED_KEY); }
        else await subscribe(chosen);
        status.textContent = `已設為每天 ${chosen}，可隨時修改。`;
        setTimeout(() => settingsCard(container), 500);
      } catch (error) { status.textContent = error.message; }
    };
    const pause = container.querySelector('#pushPause');
    if (pause) pause.onclick = async () => {
      try { await post({ op: 'pause', days: 7 }); const until = new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE'); localStorage.setItem(PAUSED_KEY, until); status.textContent = `已暫停至 ${until}。`; }
      catch (error) { status.textContent = error.message; }
    };
    const remove = container.querySelector('#pushDelete');
    if (remove) remove.onclick = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
        await post({ op: 'unsubscribe' });
        localStorage.removeItem(ENABLED_KEY);
        localStorage.removeItem(PAUSED_KEY);
        status.textContent = '已完全關閉並刪除訂閱。';
        setTimeout(() => settingsCard(container), 500);
      } catch (error) { status.textContent = error.message; }
    };
  }

  function track(event) {
    post({ op: 'event', event }).catch(() => {});
  }

  async function markDone() {
    const item = { op: 'done', date: VDStore.today() };
    try { await post(item); localStorage.removeItem(OUTBOX_KEY); }
    catch { localStorage.setItem(OUTBOX_KEY, JSON.stringify(item)); }
  }

  async function flush() {
    try {
      const item = JSON.parse(localStorage.getItem(OUTBOX_KEY) || 'null');
      if (item) { await post(item); localStorage.removeItem(OUTBOX_KEY); }
    } catch { /* 離線佇列留到下次 */ }
  }

  window.addEventListener('online', flush);
  if (new URLSearchParams(location.search).get('push') === '1') track('notification_click');

  return { apiOrigin, deviceId, reminderOptions, settingsCard, markDone, track, flush, calendarReminder };
})();

window.VDPush = VDPush;
