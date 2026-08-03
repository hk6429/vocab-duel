import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const words = JSON.parse(readFileSync(join(root, 'data', 'words.json'), 'utf8'));
const stand = words.find(word => word.word === 'stand');
const wordCount = (stand?.example.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;

if (wordCount < 5) {
  console.error(`FAIL: stand 例句至少需 5 個英文單字，實際 ${wordCount} 個：${stand?.example}`);
  process.exit(1);
}

console.log(`PASS: stand 例句共 ${wordCount} 個英文單字`);
