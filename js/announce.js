export const SAVE_ANNOUNCEMENT_SEEN_KEY = 'vd_save_announcement_seen';

export const SAVE_ANNOUNCEMENT = Object.freeze({
  version: '2026.08.05',
  title: '離開前務必先存檔，讓冒險進度跟著你走',
  items: Object.freeze([
    '離開網站、換手機／電腦或清除瀏覽器資料前，請務必先把目前進度同步到雲端。',
    '方法一：打開右下角學習工具，進入「我的學習進度」，按「同步到雲端」。',
    '方法二：進入「更多工具」→「☁️ 雲端／班級榜」，按「⬆️ 上傳這台的進度」。',
    '請妥善保存同步碼；到新裝置輸入同一組碼，再按「⬇️ 下載到這台」即可接續進度。',
  ]),
});

export const ANNOUNCEMENTS = Object.freeze([
  Object.freeze({
    version: '2026.08.05-2',
    title: '公告收進左下角，需要時隨時回來看',
    items: Object.freeze([
      '公告關閉後，左下角會保留一枚「公告」按鈕，點一下就能重新打開。',
      '公告卡新增「公告紀錄」，可以切換並查看以前的舊版本。',
      '右下角仍保留學習工具，左、右入口分開，不會互相遮住。',
    ]),
  }),
  SAVE_ANNOUNCEMENT,
]);

export const LATEST_ANNOUNCEMENT = ANNOUNCEMENTS[0];

export function shouldShowSaveAnnouncement(storage = globalThis.localStorage) {
  try {
    return storage.getItem(SAVE_ANNOUNCEMENT_SEEN_KEY) !== LATEST_ANNOUNCEMENT.version;
  } catch {
    return true;
  }
}

export function markSaveAnnouncementSeen(storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_ANNOUNCEMENT_SEEN_KEY, LATEST_ANNOUNCEMENT.version);
  } catch {
    // 無法使用 localStorage 時，仍允許玩家關閉公告並繼續操作。
  }
}

function renderAnnouncement(overlay, announcement) {
  overlay.querySelector('[data-version]').textContent = announcement.version;
  overlay.querySelector('[data-title]').textContent = announcement.title;
  const list = overlay.querySelector('[data-list]');
  list.replaceChildren(...announcement.items.map((item) => {
    const li = overlay.ownerDocument.createElement('li');
    li.textContent = item;
    return li;
  }));
  overlay.querySelector('[data-history]').value = announcement.version;
}

export function openSaveAnnouncement(
  doc = globalThis.document,
  storage = globalThis.localStorage,
) {
  if (!doc?.body || doc.getElementById('vd-save-announcement')) return false;

  const overlay = doc.createElement('div');
  overlay.id = 'vd-save-announcement';
  overlay.className = 'av-modal vd-save-announcement';
  overlay.innerHTML = `
    <div class="av-panel vd-save-announcement__panel" role="dialog" aria-modal="true" aria-labelledby="vd-save-announcement-title">
      <span class="vd-save-announcement__version" data-version></span>
      <div id="vd-save-announcement-title" class="av-title" data-title></div>
      <label class="vd-save-announcement__history-label" for="vd-save-announcement-history">公告紀錄</label>
      <select id="vd-save-announcement-history" class="vd-save-announcement__history" data-history aria-label="選擇公告版本">
        ${ANNOUNCEMENTS.map((item) => `<option value="${item.version}">${item.version}｜${item.title}</option>`).join('')}
      </select>
      <ul class="vd-save-announcement__list" data-list></ul>
      <div class="vd-save-announcement__actions">
        <button class="btn" type="button" data-save-now>現在去存檔</button>
        <button class="btn ghost" type="button" data-close>我會先存檔，再離開</button>
      </div>
    </div>`;

  const close = () => {
    markSaveAnnouncementSeen(storage);
    const trigger = doc.getElementById('vd-announcement-trigger');
    trigger?.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('keydown', onKeydown);
    overlay.remove();
    trigger?.focus({ preventScroll: true });
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };

  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.querySelector('[data-history]').addEventListener('change', (event) => {
    const announcement = ANNOUNCEMENTS.find((item) => item.version === event.target.value);
    if (announcement) renderAnnouncement(overlay, announcement);
  });
  overlay.querySelector('[data-save-now]').addEventListener('click', () => {
    close();
    globalThis.VDApp?.go?.('cloud');
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  doc.addEventListener('keydown', onKeydown);
  doc.body.appendChild(overlay);
  renderAnnouncement(overlay, LATEST_ANNOUNCEMENT);
  doc.getElementById('vd-announcement-trigger')?.setAttribute('aria-expanded', 'true');
  overlay.querySelector('[data-save-now]').focus();
  return true;
}

export function initSaveAnnouncement(
  doc = globalThis.document,
  storage = globalThis.localStorage,
) {
  if (!doc?.body) return false;
  let trigger = doc.getElementById('vd-announcement-trigger');
  if (!trigger) {
    trigger = doc.createElement('button');
    trigger.id = 'vd-announcement-trigger';
    trigger.className = 'vd-announcement-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-controls', 'vd-save-announcement');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', '打開公告紀錄');
    trigger.innerHTML = '<span aria-hidden="true">📢</span><span>公告</span>';
    trigger.addEventListener('click', () => openSaveAnnouncement(doc, storage));
    doc.body.appendChild(trigger);
  }
  if (shouldShowSaveAnnouncement(storage)) openSaveAnnouncement(doc, storage);
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSaveAnnouncement(), { once: true });
  } else {
    initSaveAnnouncement();
  }
}
