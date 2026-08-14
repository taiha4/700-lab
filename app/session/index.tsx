/**
 * 出題画面（docs/spec.md §4.3）
 *
 * 守ること:
 *  - 選択肢タップから正誤表示までは AI を待たない（100ms 以内）。
 *  - AI 解説は後から差し込む。待っている間も「次へ」で進める。
 *  - 主要 CTA は画面下部（片手・通勤中の操作）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, EnglishText, Eyebrow, Meta, Num, Tag } from '@/components/base';
import { FeedbackCard } from '@/components/FeedbackCard';
import { getWord, useWords } from '@/context/WordsProvider';
import { radius, shadow, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';
import type { Feedback } from '@/types';

export default function SessionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { active, answerQuestion, finishSession, abandonSession, settings } = useWords();

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const questionStartedAt = useRef(Date.now());
  /**
   * 連打対策。state の chosen は次のレンダーまで更新されないため、
   * 同一フレーム内の 2 回目のタップを止められない（回答が二重登録される）。
   */
  const answeredRef = useRef(false);
  const advancingRef = useRef(false);
  /**
   * 表示中の問題番号。AI 応答は問題を進めた後に返ることがあるため、
   * 解決時にこの値と照合し、古い問題の解説を今の問題に出さないようにする。
   */
  const currentIndexRef = useRef(0);
  currentIndexRef.current = index;

  const question = active?.questions[index];
  const word = question ? getWord(question.wordId) : undefined;
  const correctLabel = useMemo(() => question?.choices.find((c) => c.correct)?.label ?? '', [question]);

  useEffect(() => {
    questionStartedAt.current = Date.now();
    answeredRef.current = false;
    advancingRef.current = false;
  }, [index]);

  // セッションが無い状態で開かれたらホームに戻す
  useEffect(() => {
    if (!active) router.replace('/');
  }, [active, router]);

  const onChoose = useCallback(
    (label: string) => {
      if (answeredRef.current || chosen || !question) return;
      answeredRef.current = true;
      const isCorrect = label === correctLabel;

      // 1. 正誤の確定・記録・永続化はこの場で終わらせる（AI を待たない）
      setChosen(label);
      setLoadingFeedback(true);
      if (settings.haptics) {
        void Haptics.notificationAsync(
          isCorrect ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
        );
      }

      const { feedback: feedbackPromise } = answerQuestion(index, label, Date.now() - questionStartedAt.current);

      // 2. AI 解説だけを後から差し込む（先に進んでいても記録は失われない）
      //    応答が遅れて次の問題に進んでいた場合は、この解説を捨てる。
      //    そうしないと別の単語の解説が今の問題に表示されてしまう。
      const answeredIndex = index;
      void feedbackPromise
        .then((fb) => {
          if (currentIndexRef.current !== answeredIndex) return;
          setFeedback(fb);
        })
        .finally(() => {
          if (currentIndexRef.current !== answeredIndex) return;
          setLoadingFeedback(false);
        });
    },
    [answerQuestion, chosen, correctLabel, index, question, settings.haptics]
  );

  const onNext = useCallback(async () => {
    if (!active || advancingRef.current) return;
    advancingRef.current = true;
    if (index + 1 < active.questions.length) {
      setIndex((i) => i + 1);
      setChosen(null);
      setFeedback(null);
      return;
    }
    setFinishing(true);
    await finishSession();
    router.replace('/session/summary');
  }, [active, finishSession, index, router]);

  const onQuit = useCallback(() => {
    abandonSession();
    router.replace('/');
  }, [abandonSession, router]);

  if (!active || !question || !word) return null;

  const total = active.questions.length;
  const answered = chosen !== null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* 進捗ドット */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={onQuit} accessibilityRole="button" accessibilityLabel="学習をやめてホームに戻る" hitSlop={12}>
            <Meta>やめる</Meta>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center' }}>
            {active.questions.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 4,
                  flex: 1,
                  maxWidth: 26,
                  borderRadius: 2,
                  backgroundColor: i < index ? colors.primary : i === index ? colors.accent : colors.secondary,
                }}
              />
            ))}
          </View>
          <Num style={{ fontSize: 12 }}>
            {index + 1}/{total}
          </Num>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* 問題カード */}
        <Animated.View
          key={`q-${index}`}
          entering={FadeInDown.duration(240)}
          style={{
            backgroundColor: colors.card,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.xl,
            gap: spacing.md,
            ...shadow,
          }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Tag label={question.format === 'recognize' ? '意味をつかむ' : '文脈で使う'} tone="primary" />
            <Tag label={`L${word.level}`} />
            <Tag label={word.scene} />
          </View>

          {question.format === 'recognize' ? (
            <View style={{ gap: spacing.xs, paddingVertical: spacing.md }}>
              <EnglishText style={{ fontSize: 40, lineHeight: 52 }}>{word.word}</EnglishText>
              <Meta>{word.pos}</Meta>
            </View>
          ) : (
            <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
              <Eyebrow>FILL IN THE BLANK</Eyebrow>
              <EnglishText style={{ fontSize: 20, lineHeight: 34 }}>{question.sentence}</EnglishText>
            </View>
          )}

          <Body style={{ fontWeight: '700' }}>
            {question.format === 'recognize' ? 'この語の意味は？' : '空欄に入る語は？'}
          </Body>
        </Animated.View>

        {/* 選択肢 */}
        <View style={{ gap: spacing.sm }}>
          {question.choices.map((choice) => {
            const isChosen = chosen === choice.label;
            const revealCorrect = answered && choice.correct;
            const revealWrong = answered && isChosen && !choice.correct;

            return (
              <Pressable
                key={choice.label}
                disabled={answered}
                onPress={() => onChoose(choice.label)}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected: isChosen, disabled: answered }}
                style={({ pressed }) => ({
                  minHeight: 64,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.tag + 6,
                  borderWidth: revealCorrect || revealWrong ? 2 : 1,
                  borderColor: revealCorrect ? colors.success : revealWrong ? colors.destructive : colors.border,
                  backgroundColor: revealCorrect || revealWrong ? colors.secondary : colors.card,
                  opacity: answered && !revealCorrect && !revealWrong ? 0.5 : pressed ? 0.9 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {answered && (revealCorrect || revealWrong) ? (
                    <Body style={{ color: revealCorrect ? colors.success : colors.destructive, fontWeight: '700' }}>
                      {revealCorrect ? '✓' : '✕'}
                    </Body>
                  ) : null}
                  {question.format === 'use' ? (
                    <EnglishText style={{ fontSize: 18 }}>{choice.label}</EnglishText>
                  ) : (
                    <Body style={{ flex: 1 }}>{choice.label}</Body>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* フィードバック（AI 応答は後から差し込まれる） */}
        {answered ? (
          <>
            {question.format === 'use' && question.translation ? (
              <Animated.View entering={FadeIn}>
                <Meta>{question.translation}</Meta>
              </Animated.View>
            ) : null}
            <FeedbackCard
              feedback={feedback}
              word={word}
              correct={chosen === correctLabel}
              loading={loadingFeedback}
            />
          </>
        ) : (
          <Meta style={{ textAlign: 'center' }}>直感で選んで大丈夫です。間違えた理由は先生が解説します。</Meta>
        )}
      </ScrollView>

      {/* 主要 CTA は常に画面下部（片手操作） */}
      {answered ? (
        <View
          style={{
            padding: spacing.lg,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <Button
            label={index + 1 < total ? '次の問題へ' : '今日のまとめを見る'}
            onPress={onNext}
            loading={finishing}
            disabled={finishing}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
