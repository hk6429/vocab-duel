/* LOOP 閉環測試：連錯救援真降階(B)、錯字真攻克(C)、診斷誠實化 durable/learning(D)、
   閃卡自評到不了 durable(E)。以最小 shim 在 node vm 中載入 store.js（比照 test/townstore.test.mjs 風格）。
   今天固定為 2026-07-18，用自訂 Date 子類覆寫 `new Date()`（無參數）取得固定值，
   `new Date(str)` 等原樣呼叫不受影響（addDays()/toLocaleDateString 都仍照常運作）。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

const FIXED_NOW = '2026-07-18T12:00:00';

function loadStore() {
  const storeMem = {};
  const localStorage = {
    getItem: k => (k in storeMem ? storeMem[k] : null),
    setItem: (k, v) => { storeMem[k] = String(v); },
    removeItem: k => { delete storeMem[k]; }
  };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  }
  const ctx = { localStorage, console, JSON, Object, Array, Set, Date: FakeDate, Math, btoa, atob };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx.VDStore;
}

const wobj = w => ({ word: w });

// ── B：連錯救援 rescue 答對不升盒、不清錯題本 ──
test('B rescue：答對不升盒（維持救援前的盒數，不得計入升盒/精熟）', () => {
  const S = loadStore();
  S.record('rw', true, undefined, { qtype: 'e2z', ms: 2000 }); // b:0→1
  S.record('rw', true, undefined, { qtype: 'e2z', ms: 2000 }); // b:1→2
  const before = S.getWord('rw').b;
  assert.equal(before, 2);
  const res = S.record('rw', true, 'rescue', { qtype: 'e2z', ms: 2000 });
  assert.equal(S.getWord('rw').b, before, '救援答對不應升盒');
  assert.equal(res.graduated, false);
});

test('B rescue：答對不清錯題本（維持「待攻克」狀態）', () => {
  const S = loadStore();
  S.record('rw2', false); // 答錯，進錯題本
  assert.equal(S.isWrong('rw2'), true);
  S.record('rw2', true, 'rescue', { qtype: 'e2z', ms: 2000 });
  assert.equal(S.isWrong('rw2'), true, '救援答對不應清掉錯題本');
});

// ── C：錯字必須用拼寫題親手打對才算攻克；其他題型／道具不能代替 ──
test('C 錯字待攻克：答錯後未攻克，todayWrongUnconquered 應列出', () => {
  const S = loadStore();
  S.record('cw', false);
  assert.equal(S.isConquered('cw'), false);
  assert.deepEqual(S.todayWrongUnconquered([wobj('cw')]).map(w => w.word), ['cw']);
});

test('C 用非拼寫題型答對「不」算攻克', () => {
  const S = loadStore();
  S.record('cw2', false);
  S.record('cw2', true, undefined, { qtype: 'e2z', ms: 2000 });
  assert.equal(S.isConquered('cw2'), false, 'e2z 答對不能代替拼寫攻克');
  assert.deepEqual(S.todayWrongUnconquered([wobj('cw2')]).map(w => w.word), ['cw2']);
});

test('C 用拼寫題(spell)親手打對才算攻克，且從待攻克清單移除', () => {
  const S = loadStore();
  S.record('cw3', false);
  S.record('cw3', true, undefined, { qtype: 'spell', ms: 3000 });
  assert.equal(S.isConquered('cw3'), true);
  assert.deepEqual(S.todayWrongUnconquered([wobj('cw3')]), []);
});

test('C 救援模式下即使帶 spell qtype 也不算攻克（道具/降階不得代替親手攻克）', () => {
  const S = loadStore();
  S.record('cw4', false);
  const res = S.record('cw4', true, 'rescue', { qtype: 'spell', ms: 3000 });
  assert.equal(res.graduated, false);
  assert.equal(S.isConquered('cw4'), false, 'rescue 來源不應設定攻克紀錄');
});

// ── D：box<5 不 durable；box≥5 + 產出題 + 高信任 才 durable；record 回傳 graduated ──
test('D box<5 不算 durable，即使有拼寫答對紀錄', () => {
  const S = loadStore();
  S.record('dw', true, undefined, { qtype: 'spell', ms: 2000 }); // b=1
  S.record('dw', true, undefined, { qtype: 'e2z', ms: 2000 });   // b=2
  assert.equal(S.isDurable('dw'), false);
  assert.equal(S.isLearning('dw'), false); // b<3
});

test('D box≥3 才 isLearning；box≥5 + 曾產出題答對 + 高信任 才 isDurable；graduated 只在首次達成那次為 true', () => {
  const S = loadStore();
  const qtypes = ['e2z', 'z2e', 'spell', 'cloze', 'e2z'];
  const results = qtypes.map(qtype => S.record('dw2', true, undefined, { qtype, ms: 2000 }));
  // 5 次答對：b 依序 1,2,3,4,5
  assert.equal(S.getWord('dw2').b, 5);
  assert.equal(S.isLearning('dw2'), true, 'box≥3 應為複習中');
  results.slice(0, 4).forEach((r, i) => assert.equal(r.graduated, false, `第 ${i + 1} 次不應 graduated`));
  assert.equal(results[4].graduated, true, '第 5 次首次達到已鞏固應回傳 graduated:true');
  assert.equal(S.isDurable('dw2'), true);
  assert.equal(S.durableCount([wobj('dw2')]), 1);
  assert.equal(S.learningCount([wobj('dw2')]), 1);
});

test('D 從沒出過產出題(spell/cloze)：box=5 仍不算 durable', () => {
  const S = loadStore();
  ['e2z', 'z2e', 'e2z', 'z2e', 'e2z'].forEach(qtype => S.record('dw3', true, undefined, { qtype, ms: 2000 }));
  assert.equal(S.getWord('dw3').b, 5);
  assert.equal(S.isDurable('dw3'), false, '沒有產出題答對過，不該算已鞏固');
});

// ── E：閃卡自評（source='flash'）升盒封頂 2，永遠到不了 isLearning(≥3) / isDurable(≥5) ──
test('E 閃卡自評無法單獨造成精熟：升盒封頂 2，反覆按「我會了」也上不去', () => {
  const S = loadStore();
  for (let i = 0; i < 10; i++) S.record('ew', true, 'flash');
  assert.equal(S.getWord('ew').b, 2, '閃卡自評應封頂在盒 2');
  assert.equal(S.isLearning('ew'), false);
  assert.equal(S.isDurable('ew'), false);
});
