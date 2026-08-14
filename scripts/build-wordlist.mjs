/**
 * doc/toeic_wordlist.xlsx → src/data/toeic_wordlist.json 変換スクリプト（開発時のみ実行）
 *
 *   npm run build:wordlist
 *
 * xlsx は ZIP + XML なので、追加依存を入れずに zlib で展開して読む。
 * 対象ファイルはセル文字列を inlineStr（<is><t>）で持つため sharedStrings は不要。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'doc/toeic_wordlist.xlsx');
const OUT = resolve(ROOT, 'src/data/toeic_wordlist.json');

/** ZIP の End of Central Directory から各エントリを取り出す */
function unzip(buf) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP の End of Central Directory が見つかりません');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Central Directory が壊れています');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // ローカルヘッダ側の可変長を読み直してデータ開始位置を確定する
    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const method = buf.readUInt16LE(localOffset + 8);
    const compSize = buf.readUInt32LE(p + 20);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** 列参照（A1, AB12）から 0 始まりの列番号を得る */
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** worksheet XML → 行ごとの文字列配列（空セルは '' で埋める） */
function parseSheet(xml) {
  const rows = [];
  for (const [, rowXml] of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const m of rowXml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const inner = m[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : cells.length;
      const text =
        /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ??
        /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ??
        '';
      while (cells.length < idx) cells.push('');
      cells[idx] = decodeXml(text).trim();
    }
    rows.push(cells);
  }
  return rows;
}

/** 「⭐⭐⭐ 上級 (L3)」→ 3 */
function toLevel(raw) {
  const m = /L([123])/.exec(raw);
  if (m) return Number(m[1]);
  const stars = (raw.match(/⭐/g) ?? []).length;
  if (stars >= 1 && stars <= 3) return stars;
  throw new Error(`難易度を解釈できません: "${raw}"`);
}

/** 「名詞/動詞」→ ['noun','verb']（誤答タイプ「品詞ズレ」の判定に使う） */
const POS_MAP = {
  動詞: 'verb',
  名詞: 'noun',
  形容詞: 'adjective',
  副詞: 'adverb',
  名詞句: 'nounPhrase',
};
function toPosTags(raw) {
  const tags = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const tag = POS_MAP[s];
      if (!tag) throw new Error(`未知の品詞です: "${s}"`);
      return tag;
    });
  return [...new Set(tags)];
}

const splitList = (raw, sep) =>
  raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

// ---- 変換 ----
const files = unzip(readFileSync(SRC));
const sheetXml = files.get('xl/worksheets/sheet1.xml');
if (!sheetXml) throw new Error('xl/worksheets/sheet1.xml が見つかりません');

const rows = parseSheet(sheetXml.toString('utf8'));
const header = rows[0];
const EXPECTED = ['ID', '英単語', '品詞', '意味（日本語）', '難易度', 'ビジネス場面', '混同しやすい類似語'];
if (EXPECTED.some((h, i) => header[i] !== h)) {
  throw new Error(`ヘッダーが想定と異なります:\n  期待: ${EXPECTED}\n  実際: ${header}`);
}

const words = rows
  .slice(1)
  .filter((r) => r[0] && r[1])
  .map((r) => {
    const [id, word, pos, meaning, level, scene, similar] = r;
    return {
      id: Number(id),
      word,
      pos,
      posTags: toPosTags(pos),
      meaning,
      meanings: splitList(meaning, '・'),
      level: toLevel(level),
      scene,
      similar: splitList(similar ?? '', ','),
    };
  });

// ---- 検証（テスト仕様書 UT-DATA-01〜06 に対応） ----
const errors = [];
if (words.length !== 300) errors.push(`件数が 300 ではありません: ${words.length}`);

const ids = new Set(words.map((w) => w.id));
if (ids.size !== words.length) errors.push('id に重複があります');
for (let i = 1; i <= 300; i++) if (!ids.has(i)) errors.push(`id ${i} が欠けています`);

for (const w of words) {
  for (const key of ['word', 'pos', 'meaning', 'scene']) {
    if (!w[key]) errors.push(`id ${w.id}: ${key} が空です`);
  }
  if (w.meanings.length === 0) errors.push(`id ${w.id}: meanings が空です`);
}

const dist = words.reduce((acc, w) => ((acc[w.level] = (acc[w.level] ?? 0) + 1), acc), {});
const EXPECTED_DIST = { 1: 40, 2: 110, 3: 150 };
for (const [lv, n] of Object.entries(EXPECTED_DIST)) {
  if (dist[lv] !== n) errors.push(`レベル ${lv} の件数が ${n} ではありません: ${dist[lv] ?? 0}`);
}

if (errors.length) {
  console.error('変換結果の検証に失敗しました:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(words, null, 2) + '\n', 'utf8');

const noSimilar = words.filter((w) => w.similar.length === 0).length;
console.log(`✅ ${words.length} 語を書き出しました → ${OUT.replace(ROOT + '/', '')}`);
console.log(`   レベル分布: L1=${dist[1]} / L2=${dist[2]} / L3=${dist[3]}`);
console.log(`   類似語なしの語: ${noSimilar} 件 / 場面の種類: ${new Set(words.map((w) => w.scene)).size}`);
