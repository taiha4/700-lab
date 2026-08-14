/** 選択肢生成（テスト仕様書 UT-CHOICE-01〜06） */
import rawWords from '@/data/toeic_wordlist.json';
import { CHOICE_COUNT, buildChoices, similarWordsInMaster } from '@/domain/buildChoices';
import type { Word } from '@/types';

const words = rawWords as Word[];
const byWord = (w: string) => words.find((x) => x.word === w)!;

describe('UT-CHOICE: 選択肢生成', () => {
  test('UT-CHOICE-01: 4 択で正解はちょうど 1 つ', () => {
    for (const format of ['recognize', 'use'] as const) {
      for (const word of words.slice(0, 60)) {
        const choices = buildChoices({ word, format, words });
        expect(choices).toHaveLength(CHOICE_COUNT);
        expect(choices.filter((c) => c.correct)).toHaveLength(1);
        expect(choices.find((c) => c.correct)!.label).toBe(format === 'recognize' ? word.meaning : word.word);
      }
    }
  });

  test('UT-CHOICE-02: ラベルが重複しない', () => {
    for (const format of ['recognize', 'use'] as const) {
      for (const word of words) {
        const labels = buildChoices({ word, format, words }).map((c) => c.label.toLowerCase());
        expect(new Set(labels).size).toBe(CHOICE_COUNT);
      }
    }
  });

  test('UT-CHOICE-03: confusion + use 形式なら全 300 語で similar 由来のダミーが入る', () => {
    for (const word of words) {
      const choices = buildChoices({ word, format: 'use', words, dominantErrorType: 'confusion' });
      const similar = new Set(word.similar.map((s) => s.toLowerCase()));
      const hit = choices.filter((c) => !c.correct && similar.has(c.label.toLowerCase()));
      expect(hit.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('UT-CHOICE-03b: confusion + recognize 形式は master 内類似語があればその意味を混ぜる', () => {
    const withSimilar = words.filter((w) => similarWordsInMaster(w, words).length > 0);
    // 実データでは 109 語（docs/spec.md §4.5 の補足）
    expect(withSimilar.length).toBeGreaterThanOrEqual(100);

    for (const word of withSimilar) {
      const choices = buildChoices({ word, format: 'recognize', words, dominantErrorType: 'confusion' });
      const meanings = new Set(similarWordsInMaster(word, words).map((w) => w.meaning));
      expect(choices.some((c) => !c.correct && meanings.has(c.label))).toBe(true);
    }

    // 類似語を master 内に持たない語でも 4 択は成立する
    for (const word of words.filter((w) => similarWordsInMaster(w, words).length === 0).slice(0, 30)) {
      const choices = buildChoices({ word, format: 'recognize', words, dominantErrorType: 'confusion' });
      expect(choices).toHaveLength(CHOICE_COUNT);
    }
  });

  test('UT-CHOICE-04: pos なら品詞の異なる語がダミーに入る', () => {
    for (const word of words.slice(0, 80)) {
      const choices = buildChoices({ word, format: 'recognize', words, dominantErrorType: 'pos' });
      const dummyWords = choices
        .filter((c) => !c.correct)
        .map((c) => words.find((w) => w.meaning === c.label))
        .filter((w): w is Word => !!w);
      expect(dummyWords.some((w) => !w.posTags.some((t) => word.posTags.includes(t)))).toBe(true);
    }
  });

  test('UT-CHOICE-05: similar が空でも例外を投げず 4 択になる', () => {
    const stripped: Word = { ...byWord('provide'), similar: [] };
    for (const format of ['recognize', 'use'] as const) {
      const choices = buildChoices({ word: stripped, format, words });
      expect(choices).toHaveLength(CHOICE_COUNT);
      expect(choices.filter((c) => c.correct)).toHaveLength(1);
    }
  });

  test('UT-CHOICE-06: 正解位置が偏らない（100 回中どの位置も 40% 未満）', () => {
    const positions = [0, 0, 0, 0];
    for (let i = 0; i < 100; i++) {
      const choices = buildChoices({ word: byWord('require'), format: 'recognize', words });
      positions[choices.findIndex((c) => c.correct)]++;
    }
    for (const n of positions) expect(n).toBeLessThan(40);
    expect(positions.reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('use 形式では Gemini の distractor が最優先で使われる', () => {
    const choices = buildChoices({
      word: byWord('provide'),
      format: 'use',
      words,
      aiDistractors: ['withhold', 'postpone', 'decline'],
    });
    const labels = choices.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['withhold', 'postpone', 'decline', 'provide']));
  });
});
