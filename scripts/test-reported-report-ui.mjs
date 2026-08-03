import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'js', 'report.js'), 'utf8')
  .replace('const VDReport =', 'globalThis.VDReport =');

globalThis.window = globalThis;
globalThis.location = {
  hostname: 'vocab-duel.vercel.app',
  pathname: '/',
  search: '?stage=E',
  hash: '#quiz'
};
globalThis.document = {
  body: { dataset: { view: 'quiz' } },
  querySelectorAll(selector) {
    if (selector === '.quiz-opts .opt-text') {
      return ['搭公車', '走路', '騎腳踏車', '搭火車'].map(textContent => ({ textContent }));
    }
    return [];
  }
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'TestPhone/1.0 Mobile Safari' }, configurable: true
});
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
globalThis.VDApp = {
  words: () => [
    { id: 'w0720', word: 'by', example: 'I go to school by bus.' },
    { id: 'w2426', word: 'go', example: 'I go to school by bus.' },
    { id: 'w5670', word: 'to', example: 'I go to school by bus.' }
  ]
};
globalThis.VDSpeak = {
  diagnostics: () => ({ accent: 'en-US', source: 'device-tts', voice: 'Samantha', tts: 'ok' })
};

new Function(source)();

const payload = VDReport.buildPayload('I go to school by bus.', 'other', '兩個相同答案的選項');
const expectedCandidates = ['w0720:by', 'w2426:go', 'w5670:to'];
const checks = [
  [payload.word === 'I go to school by bus.', '保留回報內容'],
  [payload.kind === 'other' && payload.note === '兩個相同答案的選項', '保留類型與備註'],
  [payload.context.view === 'quiz', '附上目前功能頁'],
  [payload.context.path === '/?stage=E#quiz', '附上站內路徑'],
  [JSON.stringify(payload.context.candidates) === JSON.stringify(expectedCandidates), '附上所有候選單字 ID'],
  [payload.context.options.length === 4 && payload.context.options[0] === '搭公車', '附上當下選項'],
  [payload.context.viewport === '390x844', '附上畫面尺寸'],
  [payload.context.userAgent.includes('Mobile Safari'), '附上瀏覽器資訊'],
  [payload.context.speech.source === 'device-tts' && payload.context.speech.voice === 'Samantha', '附上發音環境']
];

let failures = 0;
for (const [ok, message] of checks) {
  if (ok) console.log('PASS:', message);
  else { console.error('FAIL:', message); failures++; }
}
if (failures) process.exit(1);
