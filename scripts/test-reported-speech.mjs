import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'js', 'speak.js'), 'utf8')
  .replace('const VDSpeak =', 'globalThis.VDSpeak =');

const audioUrls = [];
const playedUrls = [];
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.speechSynthesis = {
  getVoices: () => [{ name: 'Test English', lang: 'en-US', default: true, localService: true }],
  speak: () => {},
  cancel: () => {},
  onvoiceschanged: null
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.Audio = class {
  constructor(url) { this.url = url; audioUrls.push(url); }
  play() { playedUrls.push(this.url); return Promise.resolve(); }
  pause() {}
};
globalThis.setTimeout = () => 0;

new Function(source)();

function audioUrlAfter(text) {
  const before = playedUrls.length;
  VDSpeak.say(text);
  if (playedUrls.length !== before + 1) {
    console.error(`FAIL: ${text} 應使用真人音檔，卻未播放音檔`);
    process.exit(1);
  }
  return new URL(playedUrls.at(-1));
}

const mrsUrl = audioUrlAfter('Mrs');
if (mrsUrl.searchParams.get('audio') !== 'missus') {
  console.error('FAIL: Mrs 應以 missus 朗讀，實際為', mrsUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: Mrs 使用 missus 朗讀');

const mrsDotUrl = audioUrlAfter('Mrs.');
if (mrsDotUrl.searchParams.get('audio') !== 'missus') {
  console.error('FAIL: Mrs. 應以 missus 朗讀，實際為', mrsDotUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: Mrs. 使用 missus 朗讀');

const msUrl = audioUrlAfter('Ms');
if (msUrl.searchParams.get('audio') !== 'miz') {
  console.error('FAIL: Ms 應以 miz 朗讀，實際為', msUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: Ms 使用 miz 朗讀');

const msDotUrl = audioUrlAfter('Ms.');
if (msDotUrl.searchParams.get('audio') !== 'miz') {
  console.error('FAIL: Ms. 應以 miz 朗讀，實際為', msDotUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: Ms. 使用 miz 朗讀');

const doctorUrl = audioUrlAfter('Dr.');
if (doctorUrl.searchParams.get('audio') !== 'doctor') {
  console.error('FAIL: Dr. 應以 doctor 朗讀，實際為', doctorUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: Dr. 使用 doctor 朗讀');

const tearUrl = audioUrlAfter('tear');
if (tearUrl.searchParams.get('phonetic') !== 'tɪr') {
  console.error('FAIL: tear 的現行「眼淚」詞義應指定美音 tɪr，實際為', tearUrl.searchParams.get('phonetic'));
  process.exit(1);
}

console.log('PASS: tear 的「眼淚」詞義使用美音 tɪr');

const usaUrl = audioUrlAfter('USA');
if (usaUrl.searchParams.get('audio') !== 'U S A') {
  console.error('FAIL: USA 應逐字母朗讀，實際為', usaUrl.searchParams.get('audio'));
  process.exit(1);
}

console.log('PASS: USA 保持逐字母朗讀');

VDSpeak.setAccent('en-GB');
const tearUkUrl = audioUrlAfter('tear');
if (tearUkUrl.searchParams.get('phonetic') !== 'tɪə(r)') {
  console.error('FAIL: tear 的現行「眼淚」詞義應指定英音 tɪə(r)，實際為', tearUkUrl.searchParams.get('phonetic'));
  process.exit(1);
}

console.log('PASS: tear 的「眼淚」詞義使用英音 tɪə(r)');
VDSpeak.setAccent('en-US');

const diagnostics = VDSpeak.diagnostics('Mrs');
const expectedDiagnostics = {
  accent: 'en-US', source: 'youdao', spoken: 'missus', phonetic: '',
  voice: 'Test English', tts: 'ok'
};
if (JSON.stringify(diagnostics) !== JSON.stringify(expectedDiagnostics)) {
  console.error('FAIL: 發音診斷資訊不完整', diagnostics);
  process.exit(1);
}

console.log('PASS: 發音診斷資訊可隨回報送出');
