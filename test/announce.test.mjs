import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANNOUNCEMENTS,
  LATEST_ANNOUNCEMENT,
  SAVE_ANNOUNCEMENT,
  SAVE_ANNOUNCEMENT_SEEN_KEY,
  markSaveAnnouncementSeen,
  shouldShowSaveAnnouncement,
} from '../js/announce.js';

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('存檔公告會寫明右下角與系統內兩條存檔路徑', () => {
  assert.equal(SAVE_ANNOUNCEMENT.version, '2026.08.05');
  assert.match(SAVE_ANNOUNCEMENT.title, /離開前.*存檔/);
  assert.ok(SAVE_ANNOUNCEMENT.items.some(item => /右下角.*我的學習進度.*同步到雲端/.test(item)));
  assert.ok(SAVE_ANNOUNCEMENT.items.some(item => /更多工具.*雲端／班級榜.*上傳這台的進度/.test(item)));
  assert.ok(SAVE_ANNOUNCEMENT.items.some(item => /同步碼.*新裝置.*下載到這台/.test(item)));
});

test('最新版公告會說明左下角入口，並保留存檔提醒供回頭查閱', () => {
  assert.equal(LATEST_ANNOUNCEMENT.version, '2026.08.05-2');
  assert.match(LATEST_ANNOUNCEMENT.title, /公告.*左下角|左下角.*公告/);
  assert.ok(LATEST_ANNOUNCEMENT.items.some(item => /左下角.*公告.*重新打開/.test(item)));
  assert.ok(ANNOUNCEMENTS.includes(SAVE_ANNOUNCEMENT));
  assert.equal(ANNOUNCEMENTS.at(-1).version, '2026.08.05');
});

test('同一版存檔公告在玩家確認後不會重複顯示', () => {
  const storage = fakeStorage();

  assert.equal(shouldShowSaveAnnouncement(storage), true);
  markSaveAnnouncementSeen(storage);
  assert.equal(storage.getItem(SAVE_ANNOUNCEMENT_SEEN_KEY), LATEST_ANNOUNCEMENT.version);
  assert.equal(shouldShowSaveAnnouncement(storage), false);
});
