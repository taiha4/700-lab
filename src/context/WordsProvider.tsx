/**
 * アプリ全体の状態管理（docs/spec.md §2 / §3.2）
 *
 * 単語マスタ・学習状態・セッション履歴・設定を保持し、
 * 1 問回答するたびに AsyncStorage へ永続化する（強制終了で進捗を失わせない）。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import rawWords from '@/data/toeic_wordlist.json';
import type {
  AnswerRecord,
  ErrorType,
  Feedback,
  Question,
  SessionMode,
  SessionRecord,
  Settings,
  Summary,
  Word,
  WordBrief,
  WordProgress,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { applyAnswer, createInitialProgress } from '@/domain/srs';
import { selectQuestions } from '@/domain/selectQuestions';
import { buildChoices } from '@/domain/buildChoices';
import { estimateScore } from '@/domain/score';
import { allAnswers, buildOverview, dominantErrorType, errorBreakdown, streakDays } from '@/domain/stats';
import type { Overview } from '@/domain/stats';
import { fetchDiagnosis, fetchSummary, fetchWordBriefs } from '@/ai/service';
import { fallbackBrief } from '@/ai/fallback';
import * as storage from '@/storage';

export const WORDS = rawWords as Word[];
const WORD_BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export const getWord = (id: number): Word | undefined => WORD_BY_ID.get(id);

/** 進行中のセッション（画面をまたいで共有する） */
export type ActiveSession = {
  id: string;
  mode: SessionMode;
  startedAt: string;
  questions: Question[];
  /** セット開始時に一括生成した語ごとの教材（wordId → 教材） */
  briefs: Map<number, WordBrief>;
  answers: AnswerRecord[];
  scoreBefore: number;
};

type WordsContextValue = {
  ready: boolean;
  words: Word[];
  progress: Record<number, WordProgress>;
  sessions: SessionRecord[];
  settings: Settings;
  aiCache: storage.AiCache;

  // 派生値
  score: number;
  overview: Overview;
  dominant: ErrorType | null;
  breakdown: ReturnType<typeof errorBreakdown>;

  // セッション
  active: ActiveSession | null;
  preparing: boolean;
  lastSession: SessionRecord | null;
  beginSession: (mode: SessionMode, wordIds?: number[]) => Promise<void>;
  /** タップ時点で回答を確定し、AI 解説は Promise で後追いする */
  answerQuestion: (index: number, chosen: string, elapsedMs: number) => { correct: boolean; feedback: Promise<Feedback> };
  finishSession: () => Promise<SessionRecord>;
  requestSummary: (record: SessionRecord) => Promise<Summary>;
  abandonSession: () => void;

  // 設定
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resetAll: () => Promise<void>;
};

const WordsContext = createContext<WordsContextValue | null>(null);

export function useWords(): WordsContextValue {
  const ctx = useContext(WordsContext);
  if (!ctx) throw new Error('useWords は WordsProvider の内側で使ってください');
  return ctx;
}

export function WordsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<Record<number, WordProgress>>({});
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [aiCache, setAiCache] = useState<storage.AiCache>({});
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  // 非同期処理から常に最新値を参照するための ref
  const progressRef = useRef(progress);
  const sessionsRef = useRef(sessions);
  const activeRef = useRef(active);
  const aiCacheRef = useRef(aiCache);
  progressRef.current = progress;
  sessionsRef.current = sessions;
  activeRef.current = active;
  aiCacheRef.current = aiCache;

  // ---- 初期ロード ----
  useEffect(() => {
    (async () => {
      await storage.ensureSchema();
      const [storedProgress, storedSessions, storedSettings, storedCache] = await Promise.all([
        storage.loadProgress(),
        storage.loadSessions(),
        storage.loadSettings(),
        storage.loadAiCache(),
      ]);

      // 未登録の語を new で埋める（初回起動 / 単語追加時）
      const filled: Record<number, WordProgress> = { ...storedProgress };
      let changed = false;
      for (const w of WORDS) {
        if (!filled[w.id]) {
          filled[w.id] = createInitialProgress(w.id);
          changed = true;
        }
      }

      setProgress(filled);
      setSessions(Array.isArray(storedSessions) ? storedSessions : []);
      setSettings(storedSettings);
      setAiCache(storedCache);
      setReady(true);
      if (changed) void storage.saveProgress(filled);
    })();
  }, []);

  // ---- 派生値 ----
  const answers = useMemo(() => allAnswers(sessions), [sessions]);
  const score = useMemo(() => estimateScore(WORDS, progress, answers), [progress, answers]);
  const overview = useMemo(() => buildOverview(WORDS, progress, sessions), [progress, sessions]);
  const dominant = useMemo(() => dominantErrorType(sessions), [sessions]);
  const breakdown = useMemo(() => errorBreakdown(sessions), [sessions]);

  const apiKey = useMemo(
    () => settings.apiKey?.trim() || process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || null,
    [settings.apiKey]
  );

  // ---- セッション開始 ----
  const beginSession = useCallback(
    async (mode: SessionMode, wordIds?: number[]) => {
      setPreparing(true);
      try {
        const current = progressRef.current;
        const currentSessions = sessionsRef.current;
        // 昼休みモードは短時間なので 2 問少なくし、復習に寄せる
        const questionCount = mode === 'lunch' ? Math.max(8, settings.questionCount - 2) : settings.questionCount;

        const recentWordIds = currentSessions.at(-1)?.answers.map((a) => a.wordId) ?? [];
        const plan = wordIds?.length
          ? wordIds.slice(0, questionCount).map((id) => ({
              wordId: id,
              // 指定出題（弱点語からの再挑戦）は必ず運用形式で問う
              format: (current[id]?.stage === 'new' ? 'recognize' : 'use') as 'recognize' | 'use',
            }))
          : selectQuestions({
              words: WORDS,
              progress: current,
              settings: { questionCount: questionCount as 8 | 10 | 12, levels: settings.levels },
              recentWordIds,
            });

        const dom = dominantErrorType(currentSessions);

        /**
         * 例文・勘所・穴埋め文を、出題する全語ぶんまとめて 1 回で生成する。
         * これにより正解時は API を呼ばずに済み、1 セットの消費が
         * 「1 + 誤答数 + 総括 1」に収まる（docs/spec.md §5.2.1）。
         */
        const planWords = plan.map((p) => WORD_BY_ID.get(p.wordId)).filter((w): w is Word => !!w);
        const briefs = await fetchWordBriefs({
          apiKey,
          words: planWords,
          useWordIds: plan.filter((p) => p.format === 'use').map((p) => p.wordId),
          dominant: dom,
          learner: {
            recentErrorTypes: [],
            learnedCount: WORDS.length - Object.values(current).filter((p) => p.stage === 'new').length,
            overallAccuracy: buildOverview(WORDS, current, currentSessions).accuracy,
            estimatedScore: estimateScore(WORDS, current, allAnswers(currentSessions)),
          },
        });
        const briefById = new Map(briefs.map((b) => [b.wordId, b]));

        const questions: Question[] = plan.map((p) => {
          const word = WORD_BY_ID.get(p.wordId)!;
          const brief = briefById.get(p.wordId);
          return {
            wordId: p.wordId,
            format: p.format,
            sentence: p.format === 'use' ? brief?.sentence : undefined,
            translation: p.format === 'use' ? brief?.translation : undefined,
            sentenceSource: p.format === 'use' ? brief?.source : undefined,
            choices: buildChoices({
              word,
              format: p.format,
              words: WORDS,
              dominantErrorType: dom,
              aiDistractors: brief?.distractors ?? [],
            }),
          };
        });

        setActive({
          id: `s_${Date.now()}`,
          mode,
          startedAt: new Date().toISOString(),
          questions,
          briefs: briefById,
          answers: [],
          scoreBefore: estimateScore(WORDS, current, allAnswers(currentSessions)),
        });
      } finally {
        setPreparing(false);
      }
    },
    [apiKey, settings.questionCount, settings.levels]
  );

  // ---- 1 問回答 ----
  /**
   * 回答の記録は「タップした瞬間」に確定させる。
   * AI 応答を待ってから記録すると、解説を待たずに次へ進んだ回答が失われるため
   * （仕様上、待ち時間中も次へ進めることが要件）。誤答タイプだけは後から追記する。
   */
  const answerQuestion = useCallback(
    (index: number, chosen: string, elapsedMs: number): { correct: boolean; feedback: Promise<Feedback> } => {
      const session = activeRef.current;
      if (!session) throw new Error('進行中のセッションがありません');

      const question = session.questions[index];
      const word = WORD_BY_ID.get(question.wordId)!;
      const correctLabel = question.choices.find((c) => c.correct)!.label;
      const correct = chosen === correctLabel;

      // 1) 学習状態を即時に更新して永続化する（強制終了しても失われない）
      const before = progressRef.current[word.id] ?? createInitialProgress(word.id);
      const updated = applyAnswer(before, { format: question.format, correct, chosen });
      const nextProgress = { ...progressRef.current, [word.id]: updated };
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      void storage.saveProgress(nextProgress);

      // 2) 回答をセッションに積む
      const answer: AnswerRecord = {
        wordId: word.id,
        format: question.format,
        correct,
        chosen,
        ms: elapsedMs,
      };
      // 誤答タイプを後から書き込む位置。問題番号ではなく実際の格納位置を使う
      const answerIndex = session.answers.length;
      const withAnswer = { ...session, answers: [...session.answers, answer] };
      activeRef.current = withAnswer;
      setActive(withAnswer);

      // 3) 例文と勘所はセット開始時に取得済み。ここでは使い回す
      const brief = session.briefs.get(word.id) ?? fallbackBrief(word, question.format === 'use');

      const save = async (fb: Feedback): Promise<Feedback> => {
        const nextCache = await storage.putAiCache(aiCacheRef.current, word.id, fb);
        aiCacheRef.current = nextCache;
        setAiCache(nextCache);
        return fb;
      };

      // 正解なら API を呼ばない。ここが消費回数削減の中心
      if (correct) {
        const feedback: Feedback = {
          errorType: null,
          why: brief.nuance,
          howToTell: brief.howToTell,
          example: brief.example,
          exampleJa: brief.exampleJa,
          source: brief.source,
        };
        return { correct, feedback: save(feedback) };
      }

      // 不正解のときだけ、選んだ答えを踏まえた分析を取りにいく
      const feedback = fetchDiagnosis({
        apiKey,
        word,
        format: question.format,
        chosen,
        correctLabel,
        sentence: question.sentence,
        progress: before,
        allWords: WORDS,
        learner: {
          recentErrorTypes: before.errorTypes,
          learnedCount: WORDS.length - Object.values(progressRef.current).filter((p) => p.stage === 'new').length,
          overallAccuracy: overview.accuracy,
          estimatedScore: score,
        },
      }).then((d) => {
        if (d.errorType) attachErrorType(word.id, answerIndex, d.errorType);
        return save({
          errorType: d.errorType,
          why: d.why,
          howToTell: d.howToTell,
          // 例文は一括生成ぶんを使う
          example: brief.example,
          exampleJa: brief.exampleJa,
          source: d.source,
          reason: d.reason,
        });
      });

      return { correct, feedback };
    },
    [apiKey, overview.accuracy, score] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * AI が判定した誤答タイプを、記録済みの回答と単語の学習状態に後から付ける。
   * セッションが既に確定していれば履歴側を更新する。
   */
  const attachErrorType = useCallback((wordId: number, answerIndex: number, errorType: ErrorType) => {
    const p = progressRef.current[wordId];
    if (p) {
      const nextProgress = {
        ...progressRef.current,
        [wordId]: { ...p, errorTypes: [...p.errorTypes, errorType].slice(-5) },
      };
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      void storage.saveProgress(nextProgress);
    }

    const session = activeRef.current;
    if (session) {
      const answers = session.answers.map((a, i) =>
        i === answerIndex && a.wordId === wordId ? { ...a, errorType } : a
      );
      const next = { ...session, answers };
      activeRef.current = next;
      setActive(next);
      return;
    }

    // セッション終了後に応答が返ってきた場合は履歴側を直す
    const sessionsNow = sessionsRef.current;
    const last = sessionsNow.at(-1);
    if (!last) return;
    const answers = last.answers.map((a, i) => (i === answerIndex && a.wordId === wordId ? { ...a, errorType } : a));
    const merged = [...sessionsNow.slice(0, -1), { ...last, answers }];
    sessionsRef.current = merged;
    setSessions(merged);
    setLastSession((prev) => (prev && prev.id === last.id ? { ...prev, answers } : prev));
    void storage.saveSessions(merged);
  }, []);

  // ---- セッション終了 ----
  const finishSession = useCallback(async (): Promise<SessionRecord> => {
    const session = activeRef.current;
    if (!session) throw new Error('進行中のセッションがありません');

    const finishedAt = new Date().toISOString();
    const correct = session.answers.filter((a) => a.correct).length;
    const scoreAfter = estimateScore(WORDS, progressRef.current, [
      ...allAnswers(sessionsRef.current),
      ...session.answers,
    ]);

    const record: SessionRecord = {
      id: session.id,
      startedAt: session.startedAt,
      finishedAt,
      mode: session.mode,
      answers: session.answers,
      accuracy: session.answers.length ? correct / session.answers.length : 0,
      scoreBefore: session.scoreBefore,
      scoreAfter,
      summary: null,
      nextAdvice: null,
    };

    const nextSessions = [...sessionsRef.current, record].slice(-storage.MAX_SESSIONS);
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    setLastSession(record);
    setActive(null);
    await storage.saveSessions(nextSessions);
    return record;
  }, []);

  /** 総括の取得。結果はセッション履歴にも保存する */
  const requestSummary = useCallback(
    async (record: SessionRecord): Promise<Summary> => {
      const summary = await fetchSummary({
        apiKey,
        answers: record.answers,
        wordById: WORD_BY_ID,
        elapsedMs: new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime(),
        scoreBefore: record.scoreBefore,
        scoreAfter: record.scoreAfter,
        streakDays: streakDays(sessionsRef.current),
        gapWords: Object.values(progressRef.current).filter((p) => p.stage === 'recognized').length,
        recentSessions: sessionsRef.current.slice(-4, -1),
        dominant: dominantErrorType(sessionsRef.current),
      });

      const merged = sessionsRef.current.map((s) =>
        s.id === record.id ? { ...s, summary: summary.summary, nextAdvice: summary.focus } : s
      );
      sessionsRef.current = merged;
      setSessions(merged);
      setLastSession((prev) =>
        prev && prev.id === record.id ? { ...prev, summary: summary.summary, nextAdvice: summary.focus } : prev
      );
      void storage.saveSessions(merged);
      return summary;
    },
    [apiKey]
  );

  const abandonSession = useCallback(() => setActive(null), []);

  // ---- 設定 ----
  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void storage.saveSettings(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(async () => {
    await storage.resetAll();
    const fresh: Record<number, WordProgress> = {};
    for (const w of WORDS) fresh[w.id] = createInitialProgress(w.id);
    progressRef.current = fresh;
    sessionsRef.current = [];
    setProgress(fresh);
    setSessions([]);
    setSettings(DEFAULT_SETTINGS);
    setAiCache({});
    setActive(null);
    setLastSession(null);
    await storage.saveProgress(fresh);
  }, []);

  const value = useMemo<WordsContextValue>(
    () => ({
      ready,
      words: WORDS,
      progress,
      sessions,
      settings,
      aiCache,
      score,
      overview,
      dominant,
      breakdown,
      active,
      preparing,
      lastSession,
      beginSession,
      answerQuestion,
      finishSession,
      requestSummary,
      abandonSession,
      updateSettings,
      resetAll,
    }),
    [
      ready,
      progress,
      sessions,
      settings,
      aiCache,
      score,
      overview,
      dominant,
      breakdown,
      active,
      preparing,
      lastSession,
      beginSession,
      answerQuestion,
      finishSession,
      requestSummary,
      abandonSession,
      updateSettings,
      resetAll,
    ]
  );

  return <WordsContext.Provider value={value}>{children}</WordsContext.Provider>;
}
