/** Gemini 連携（テスト仕様書 UT-AI-01〜06） */
import rawWords from '@/data/toeic_wordlist.json';
import { GeminiError, MAX_ATTEMPTS, TIMEOUT_MS, generateJson, isDailyQuota, parseJson, parseRetryDelay } from '@/ai/gemini';
import { SYSTEM_INSTRUCTION, buildBriefPrompt, buildDiagnosisPrompt, describeLearner } from '@/ai/prompts';
import { fetchDiagnosis, fetchSummary, fetchWordBriefs } from '@/ai/service';
import { fallbackBrief } from '@/ai/fallback';
import { createInitialProgress } from '@/domain/srs';
import type { Word } from '@/types';

const words = rawWords as Word[];
const require_ = words.find((w) => w.word === 'require')!;

const learner = {
  recentErrorTypes: ['confusion' as const, 'confusion' as const, 'pos' as const],
  learnedCount: 84,
  overallAccuracy: 0.71,
  estimatedScore: 612,
};

const okResponse = (payload: unknown) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  text: async () => '',
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('UT-AI: プロンプト構築', () => {
  test('UT-AI-01: 単語・品詞・意味・場面・類似語・生徒の回答・履歴がすべて含まれる', () => {
    const prompt = buildDiagnosisPrompt({
      word: require_,
      format: 'recognize',
      chosen: '依頼する',
      correctLabel: require_.meaning,
      learner: describeLearner({
        progress: { ...createInitialProgress(require_.id), recognizeWrong: 2 },
        ...learner,
      }),
    });

    expect(prompt).toContain('require');
    expect(prompt).toContain(require_.pos);
    expect(prompt).toContain(require_.meaning);
    expect(prompt).toContain(require_.scene);
    for (const s of require_.similar) expect(prompt).toContain(s);
    expect(prompt).toContain('依頼する'); // 生徒の回答
    expect(prompt).toContain('84語'); // 履歴（総学習語数）
    expect(prompt).toContain('71%'); // 履歴（正解率）
    expect(prompt).toContain('類似語の混同 2回'); // 履歴（誤答傾向）
  });

  test('UT-AI-02: system 指示に先生ロール・口調・一般論禁止が含まれる', () => {
    expect(SYSTEM_INSTRUCTION).toContain('英語講師');
    expect(SYSTEM_INSTRUCTION).toContain('です・ます調');
    expect(SYSTEM_INSTRUCTION).toContain('一般論を書かない');
    expect(SYSTEM_INSTRUCTION).toContain('精神論は禁止');
  });

  test('誤答分析のプロンプトには分類基準が含まれ、例文は生成させない', () => {
    const prompt = buildDiagnosisPrompt({
      word: require_,
      format: 'recognize',
      chosen: '依頼する',
      correctLabel: require_.meaning,
      learner: '初挑戦です。',
    });
    expect(prompt).toContain('誤答タイプの分類基準');
    // 例文はセット開始時に用意済みなので、ここでは作らせない
    expect(prompt).not.toContain('example');
  });

  test('一括生成のプロンプトには全語と穴埋め対象の指定が含まれる', () => {
    const target = words.slice(0, 5);
    const prompt = buildBriefPrompt({
      words: target,
      useWordIds: [target[1].id, target[3].id],
      dominant: 'confusion',
      learner: '総学習語数 84語。',
    });
    for (const w of target) {
      expect(prompt).toContain(w.word);
      expect(prompt).toContain(w.scene);
    }
    // 単語一覧の行のうち、穴埋め対象の 2 語にだけ印が付く（見出しの説明文は数えない）
    const markedLines = prompt
      .split('\n')
      .filter((line) => /^\d+\. wordId=/.test(line) && line.includes('【穴埋め問題も作る】'));
    expect(markedLines).toHaveLength(2);
    expect(markedLines.some((l) => l.includes(`wordId=${target[1].id} `))).toBe(true);
    expect(markedLines.some((l) => l.includes(`wordId=${target[3].id} `))).toBe(true);
    expect(prompt).toContain('nuance');
    expect(prompt).toContain('類似語の混同');
  });
});

describe('UT-AI: 応答パース', () => {
  test('UT-AI-03: 規定スキーマの JSON をパースできる', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test('```json フェンスが付いていても拾える', () => {
    expect(parseJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('前後に文章が混ざっていても JSON 部分を抽出する', () => {
    expect(parseJson<{ a: number }>('はい、こちらです {"a":1} 以上です')).toEqual({ a: 1 });
  });

  test('UT-AI-04: 不正な JSON では GeminiError を投げる', () => {
    expect(() => parseJson('これはJSONではありません')).toThrow(GeminiError);
  });
});

describe('UT-AI: 通信の失敗とフォールバック', () => {
  test('意味選択のフォールバックでも誤答タイプを類似語から判定できる', async () => {
    // schedule の類似語 agenda（master 内に存在）の意味を選んだケース
    const schedule = words.find((w) => w.word === 'schedule')!;
    const agenda = words.find((w) => w.word === 'agenda')!;

    const fb = await fetchDiagnosis({
      apiKey: null,
      word: schedule,
      format: 'recognize',
      chosen: agenda.meaning, // 選択肢は日本語
      correctLabel: schedule.meaning,
      learner,
      allWords: words,
    });
    expect(fb.errorType).toBe('confusion');
  });

  test('品詞の異なる語の意味を選んだ場合は pos と判定する', async () => {
    const verb = words.find((w) => w.posTags.length === 1 && w.posTags[0] === 'verb')!;
    const adjective = words.find(
      (w) => w.posTags.length === 1 && w.posTags[0] === 'adjective' && !verb.similar.includes(w.word)
    )!;

    const fb = await fetchDiagnosis({
      apiKey: null,
      word: verb,
      format: 'recognize',
      chosen: adjective.meaning,
      correctLabel: verb.meaning,
      learner,
      allWords: words,
    });
    expect(fb.errorType).toBe('pos');
  });

  test('UT-AI-06: API キー未設定なら通信せずフォールバックを返す', async () => {
    const spy = jest.spyOn(global, 'fetch' as never);
    const fb = await fetchDiagnosis({
      apiKey: null,
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(fb.source).toBe('fallback');
    expect(fb.why).toContain('require');
    // 選んだ答えが類似語ならローカル推定でも confusion になる
    expect(fb.errorType).toBe('confusion');
  });

  test('UT-AI-05: 失敗時は 1 回だけ再試行する', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as never;

    await expect(
      generateJson({ apiKey: 'k', system: 's', prompt: 'p', schema: {} })
    ).rejects.toBeInstanceOf(GeminiError);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(TIMEOUT_MS).toBe(12_000);
  });

  test('HTTP エラーでもサービス層はフォールバックに変換する', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as never;

    const fb = await fetchDiagnosis({
      apiKey: 'k',
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
      allWords: words,
    });
    expect(fb.source).toBe('fallback');
    // AI が使えなくても誤答タイプは必ず埋まる（誤答カルテを空にしない）
    expect(fb.errorType).not.toBe(null);
  });

  test('AI 応答が正常なら source が ai になる', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      okResponse({
        errorType: 'confusion',
        why: 'requestと取り違えましたね。',
        howToTell: '主語が人なら request です。',
        example: 'All applicants are required to submit the form by Friday.',
        exampleJa: '応募者は金曜までに提出が必要です。',
      })
    ) as never;

    const fb = await fetchDiagnosis({
      apiKey: 'k',
      word: require_,
      format: 'recognize',
      chosen: '依頼する',
      correctLabel: require_.meaning,
      learner,
    });
    expect(fb.source).toBe('ai');
    expect(fb.errorType).toBe('confusion');
    expect(fb.why).toContain('request');
  });

  test('未知の errorType が返ってきてもローカル推定にフォールバックする', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({ errorType: 'unknown', why: 'w', howToTell: 'h' })) as never;

    const fb = await fetchDiagnosis({
      apiKey: 'k',
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
      allWords: words,
    });
    // 誤答カルテを空にしないため、必ず 4 タイプのいずれかになる
    expect(['confusion', 'pos', 'memory', 'context']).toContain(fb.errorType);
  });

  test('フォールバック例文は品詞に合った文型になる', () => {
    const noun = words.find((w) => w.posTags[0] === 'noun')!;
    const verb = words.find((w) => w.posTags[0] === 'verb')!;
    const adjective = words.find((w) => w.posTags[0] === 'adjective')!;

    expect(fallbackBrief(noun, false).example).toContain(`the ${noun.word}`);
    expect(fallbackBrief(verb, false).example).toContain(`will ${verb.word}`);
    expect(fallbackBrief(adjective, false).example).toContain(`was ${adjective.word}`);

    // 全 300 語で例文に語が含まれ、空欄が残らないこと
    for (const w of words) {
      const brief = fallbackBrief(w, true);
      expect(brief.example).toContain(w.word);
      expect(brief.example).not.toContain('____');
      // 穴埋め対象の語には空欄付きの文が入る
      expect(brief.sentence).toContain('____');
      // 対象外の語には穴埋め文を作らない
      expect(fallbackBrief(w, false).sentence).toBeUndefined();
    }
  });


  test('UT-AI-11: 全語ぶんの教材を 1 回の呼び出しで取得する', async () => {
    const target = words.slice(0, 10);
    const useIds = [target[2].id, target[5].id];
    const fetchMock = jest.fn().mockResolvedValue(
      okResponse({
        items: target.map((w) => ({
          wordId: w.id,
          nuance: `${w.word} の勘所`,
          howToTell: `${w.word} の見分け方`,
          example: `We must ${w.word} the report.`,
          exampleJa: '報告書を扱う必要があります。',
          ...(useIds.includes(w.id)
            ? { sentence: `Please ____ the report today.`, translation: '訳', distractors: ['a', 'b', 'c'] }
            : {}),
        })),
      })
    );
    global.fetch = fetchMock as never;

    const briefs = await fetchWordBriefs({
      apiKey: 'k',
      words: target,
      useWordIds: useIds,
      dominant: 'confusion',
      learner,
    });

    // 10 語ぶんを 1 リクエストで取得できている
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(briefs).toHaveLength(10);
    expect(briefs.every((b) => b.source === 'ai')).toBe(true);
    // 穴埋め対象の語にだけ sentence が入る
    expect(briefs.filter((b) => b.sentence).map((b) => b.wordId).sort()).toEqual([...useIds].sort());
  });

  test('UT-AI-12: 一括生成で返らなかった語はテンプレートで埋める', async () => {
    const target = words.slice(0, 5);
    global.fetch = jest.fn().mockResolvedValue(
      okResponse({
        items: [
          {
            wordId: target[0].id,
            nuance: 'n',
            howToTell: 'h',
            example: `We must ${target[0].word} it.`,
            exampleJa: 'j',
          },
        ],
      })
    ) as never;

    const briefs = await fetchWordBriefs({ apiKey: 'k', words: target, useWordIds: [], dominant: null, learner });
    expect(briefs).toHaveLength(5);
    expect(briefs[0].source).toBe('ai');
    expect(briefs.slice(1).every((b) => b.source === 'fallback')).toBe(true);
  });

  test('UT-AI-13: 空欄のない生成文は採用せずテンプレート文に差し替える', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      okResponse({
        items: [
          {
            wordId: require_.id,
            nuance: 'n',
            howToTell: 'h',
            example: 'e',
            exampleJa: 'j',
            sentence: '空欄がない文です',
            translation: 'x',
            distractors: ['a', 'b', 'c'],
          },
        ],
      })
    ) as never;

    const [brief] = await fetchWordBriefs({
      apiKey: 'k',
      words: [require_],
      useWordIds: [require_.id],
      dominant: 'confusion',
      learner,
    });
    expect(brief.source).toBe('fallback');
    expect(brief.sentence).toContain('____');
  });

  test('UT-AI-07: 429 は rate-limit として扱い、retryDelay を読み取る', async () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message: 'Quota exceeded',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '29s' }],
      },
    });
    expect(parseRetryDelay(body)).toBe(29_000);
    // RetryInfo が無い場合も既定値にフォールバックする
    expect(parseRetryDelay('{}')).toBeGreaterThan(0);
    expect(parseRetryDelay('not json')).toBeGreaterThan(0);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => body }) as never;
    await expect(
      generateJson({ apiKey: 'k', system: 's', prompt: 'p', schema: {} })
    ).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 29_000 });
  });

  test('UT-AI-08: 待機を許していなければ 429 で再試行しない（出題を止めない）', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => '{}' });
    global.fetch = fetchMock as never;

    await expect(
      generateJson({ apiKey: 'k', system: 's', prompt: 'p', schema: {} })
    ).rejects.toBeInstanceOf(GeminiError);
    // maxRetryWaitMs 既定 0 なので 1 回で諦める
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('UT-AI-09: 待機を許すと 429 後に再試行して成功する', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '{}' })
      .mockResolvedValueOnce(okResponse({ ok: true }));
    global.fetch = fetchMock as never;

    const result = await generateJson<{ ok: boolean }>({
      apiKey: 'k',
      system: 's',
      prompt: 'p',
      schema: {},
      maxRetryWaitMs: 10, // テストでは待機をごく短くする
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('UT-AI-10: 日次上限は待たずに諦め、reason に quota-daily が入る', async () => {
    const dailyBody = JSON.stringify({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }],
          },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '22s' },
        ],
      },
    });
    expect(isDailyQuota(dailyBody)).toBe(true);
    expect(isDailyQuota('{}')).toBe(false);

    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => dailyBody });
    global.fetch = fetchMock as never;

    // 待機を許していても、日次上限では待たずに 1 回で諦める
    await expect(
      generateJson({ apiKey: 'k', system: 's', prompt: 'p', schema: {}, maxRetryWaitMs: 35_000 })
    ).rejects.toMatchObject({ kind: 'quota-daily' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fb = await fetchDiagnosis({
      apiKey: 'k',
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
      allWords: words,
    });
    expect(fb.reason).toBe('quota-daily');
  });

  test('レート制限で落ちた場合は reason に rate-limit が入る', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '{}' }) as never;

    const fb = await fetchDiagnosis({
      apiKey: 'k',
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
      allWords: words,
    });
    expect(fb.source).toBe('fallback');
    expect(fb.reason).toBe('rate-limit');
  });

  test('キー未設定は reason に no-key が入る', async () => {
    const fb = await fetchDiagnosis({
      apiKey: null,
      word: require_,
      format: 'recognize',
      chosen: 'request',
      correctLabel: require_.meaning,
      learner,
    });
    expect(fb.reason).toBe('no-key');
  });

  test('総括が失敗してもローカル集計の総括を返す', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;

    const summary = await fetchSummary({
      apiKey: 'k',
      answers: [
        { wordId: require_.id, format: 'recognize', correct: false, chosen: '依頼する', ms: 5000, errorType: 'confusion' },
        { wordId: 1, format: 'use', correct: true, chosen: 'provide', ms: 4000 },
      ],
      wordById: new Map(words.map((w) => [w.id, w])),
      elapsedMs: 600_000,
      scoreBefore: 612,
      scoreAfter: 614.4,
      streakDays: 3,
      gapWords: 12,
      recentSessions: [],
      dominant: 'confusion',
    });

    expect(summary.source).toBe('fallback');
    expect(summary.summary).toContain('612.0');
    expect(summary.summary).toContain('require');
    expect(summary.focus).toContain('類似語の混同');
  });
});
