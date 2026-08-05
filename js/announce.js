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

export function shouldShowSaveAnnouncement(storage = globalThis.localStorage) {
  try {
    return storage.getItem(SAVE_ANNOUNCEMENT_SEEN_KEY) !== SAVE_ANNOUNCEMENT.version;
  } catch {
    return true;
  }
}

export function markSaveAnnouncementSeen(storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_ANNOUNCEMENT_SEEN_KEY, SAVE_ANNOUNCEMENT.version);
  } catch {
    // 無法使用 localStorage 時，仍允許玩家關閉公告並繼續操作。
  }
}

export function initSaveAnnouncement(
  doc = globalThis.document,
  storage = globalThis.localStorage,
) {
  if (!doc?.body || doc.getElementById('vd-save-announcement')) return false;
  if (!shouldShowSaveAnnouncement(storage)) return false;

  const overlay = doc.createElement('div');
  overlay.id = 'vd-save-announcement';
  overlay.className = 'av-modal vd-save-announcement';
  overlay.innerHTML = `
    <div class="av-panel vd-save-announcement__panel" role="dialog" aria-modal="true" aria-labelledby="vd-save-announcement-title">
      <span class="vd-save-announcement__version">重要提醒</span>
      <div id="vd-save-announcement-title" class="av-title">${SAVE_ANNOUNCEMENT.title}</div>
      <ul class="vd-save-announcement__list">
        ${SAVE_ANNOUNCEMENT.items.map((item) => `<li>${item}</li>`).join('')}
      </ul>
      <div class="vd-save-announcement__actions">
        <button class="btn" type="button" data-save-now>現在去存檔</button>
        <button class="btn ghost" type="button" data-close>我會先存檔，再離開</button>
      </div>
    </div>`;

  const close = () => {
    markSaveAnnouncementSeen(storage);
    doc.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };

  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.querySelector('[data-save-now]').addEventListener('click', () => {
    close();
    globalThis.VDApp?.go?.('cloud');
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  doc.addEventListener('keydown', onKeydown);
  doc.body.appendChild(overlay);
  overlay.querySelector('[data-save-now]').focus();
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSaveAnnouncement(), { once: true });
  } else {
    initSaveAnnouncement();
  }
}
