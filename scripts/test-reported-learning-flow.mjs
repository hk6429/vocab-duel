import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadQuizWithPendingWord() {
  const word = {
    word: 'test',
    zh: '測試',
    pos: ['n'],
    example: 'This is a test.',
    example_zh: '這是一個測試。',
    level: 'E'
  };
  const controls = {
    '#spellIn': { focus() {}, classList: { add() {} } },
    '.spell-go': {},
    '.spell-skip': {}
  };
  const mod = {
    innerHTML: '',
    querySelector: selector => controls[selector] || null,
    querySelectorAll: () => [],
    contains: () => true
  };
  const context = {
    window: {},
    localStorage: { getItem: () => null },
    document: { getElementById: id => id === 'mod' ? mod : null },
    VDApp: { scopeWords: () => [word] },
    VDStore: {
      todayWrongUnconquered: words => words,
      box: () => 0,
      correctTypes: () => new Set(),
      isFakeMastery: () => false
    },
    console,
    Math,
    performance: { now: () => 0 },
    setTimeout: () => 0
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/quiz.js', 'utf8') + '\nthis.VDQuiz = VDQuiz;', context);
  return { quiz: context.VDQuiz, mod };
}

function loadStore(seed = {}) {
  const storage = new Map(Object.entries(seed));
  const context = {
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    window: {},
    console,
    Date,
    JSON,
    Math,
    setTimeout,
    clearTimeout,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    escape,
    unescape,
    encodeURIComponent,
    decodeURIComponent
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/store.js', 'utf8') + '\nthis.VDStore = VDStore;', context);
  return { store: context.VDStore, storage };
}

{
  const { quiz, mod } = loadQuizWithPendingWord();
  assert.doesNotThrow(() => quiz.conquer(), '按「去攻克」應直接開啟目前模組的攻克輪');
  assert.match(mod.innerHTML, /拼出這個英文字/, '攻克輪應顯示拼寫產出題');
  console.log('PASS: 去攻克按鈕會在目前模組開啟拼寫題');
}

{
  const oldRecord = { b: 0, d: '2026-08-08', s: 4, h: 'eY' };
  const { store, storage } = loadStore({
    vd_progress: JSON.stringify({ Internet: oldRecord })
  });

  assert.equal(store.box('Internet'), 0, '字庫原始大小寫應讀到既有進度');
  assert.equal(store.box('internet'), 0, '詞靈家族的小寫查詢應讀到同一筆進度');
  assert.deepEqual(
    JSON.parse(storage.get('vd_progress')).internet,
    oldRecord,
    '舊存檔正規化時應完整保留盒號、到期日、作答次數與歷史'
  );

  store.record('Internet', true, 'flash');
  assert.equal(store.box('Internet'), 1);
  assert.equal(store.box('internet'), 1);
  assert.deepEqual(Object.keys(JSON.parse(storage.get('vd_progress'))), ['internet']);
  console.log('PASS: Internet 大小寫共用進度並兼容既有存檔');
}
