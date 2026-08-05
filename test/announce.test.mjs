import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

test('同一版存檔公告在玩家確認後不會重複顯示', () => {
  const storage = fakeStorage();

  assert.equal(shouldShowSaveAnnouncement(storage), true);
  markSaveAnnouncementSeen(storage);
  assert.equal(storage.getItem(SAVE_ANNOUNCEMENT_SEEN_KEY), SAVE_ANNOUNCEMENT.version);
  assert.equal(shouldShowSaveAnnouncement(storage), false);
});
