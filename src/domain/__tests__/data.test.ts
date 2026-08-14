/** 単語データの検証（テスト仕様書 UT-DATA-01〜06） */
import rawWords from '@/data/toeic_wordlist.json';
import type { Word } from '@/types';

const words = rawWords as Word[];

describe('UT-DATA: 単語マスタ', () => {
  test('UT-DATA-01: 件数が 300 件ちょうど', () => {
    expect(words).toHaveLength(300);
  });

  test('UT-DATA-02: id が 1〜300 で過不足なく 1 回ずつ', () => {
    const ids = words.map((w) => w.id).sort((a, b) => a - b);
    expect(new Set(ids).size).toBe(300);
    expect(ids[0]).toBe(1);
    expect(ids[299]).toBe(300);
  });

  test('UT-DATA-03: レベル分布が L1=40 / L2=110 / L3=150', () => {
    const dist = { 1: 0, 2: 0, 3: 0 };
    for (const w of words) dist[w.level]++;
    expect(dist).toEqual({ 1: 40, 2: 110, 3: 150 });
  });

  test('UT-DATA-04: 必須項目に空文字がない', () => {
    for (const w of words) {
      expect(w.word).not.toBe('');
      expect(w.pos).not.toBe('');
      expect(w.meaning).not.toBe('');
      expect(w.scene).not.toBe('');
    }
  });

  test('UT-DATA-05: similar が配列化され前後空白がない', () => {
    for (const w of words) {
      expect(Array.isArray(w.similar)).toBe(true);
      for (const s of w.similar) expect(s).toBe(s.trim());
    }
    // 実データは全語が類似語を持つ（誤答分析の判断材料になる）
    expect(words.every((w) => w.similar.length > 0)).toBe(true);
  });

  test('UT-DATA-06: posTags が正規化されている', () => {
    const allowed = ['verb', 'noun', 'adjective', 'adverb', 'nounPhrase'];
    for (const w of words) {
      expect(w.posTags.length).toBeGreaterThan(0);
      for (const t of w.posTags) expect(allowed).toContain(t);
    }
    expect(words.find((w) => w.pos === '名詞/動詞')?.posTags).toEqual(['noun', 'verb']);
    expect(words.find((w) => w.pos === '名詞句')?.posTags).toEqual(['nounPhrase']);
  });
});
