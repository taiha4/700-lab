/**
 * セット総括（docs/spec.md §4.1）
 * 「続けたのに実感なし」への回答。今日の前進をスコア差分で言い切る。
 */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Body, Button, Card, Divider, Eyebrow, Meta, Num, Screen, Tag, Title } from '@/components/base';
import { StatTile, useCountUp } from '@/components/gauges';
import { FALLBACK_MESSAGE } from '@/components/FeedbackCard';
import { getWord, useWords } from '@/context/WordsProvider';
import { formatDelta } from '@/domain/score';
import { ERROR_TYPE_LABEL, type Summary } from '@/types';
import { spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

export default function SummaryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { lastSession, requestSummary, beginSession } = useWords();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!lastSession) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    void requestSummary(lastSession)
      .then((s) => !cancelled && setSummary(s))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // セッション確定後に 1 度だけ総括を取りにいく
  }, [lastSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = useCountUp(lastSession?.scoreBefore ?? 0, lastSession?.scoreAfter ?? 0, 1100);

  const stats = useMemo(() => {
    if (!lastSession) return null;
    const correct = lastSession.answers.filter((a) => a.correct).length;
    const elapsedMs = new Date(lastSession.finishedAt).getTime() - new Date(lastSession.startedAt).getTime();
    const errorTypes = lastSession.answers
      .filter((a) => !a.correct && a.errorType)
      .reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.errorType!]: (acc[a.errorType!] ?? 0) + 1 }), {});
    return { correct, total: lastSession.answers.length, elapsedMs, errorTypes };
  }, [lastSession]);

  if (!lastSession || !stats) return null;

  const minutes = Math.floor(stats.elapsedMs / 60000);
  const seconds = Math.round((stats.elapsedMs % 60000) / 1000);

  return (
    <Screen>
      <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
        <Eyebrow>TODAY&apos;S RESULT</Eyebrow>
        <Title>今日の前進</Title>
      </View>

      {/* スコア差分をカウントアップで見せる */}
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Meta>推定到達スコア</Meta>
        <Num style={{ fontSize: 52, marginVertical: spacing.sm }}>{score.toFixed(1)}</Num>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Meta>{lastSession.scoreBefore.toFixed(1)}</Meta>
          <Meta>→</Meta>
          <Tag label={`${formatDelta(lastSession.scoreBefore, lastSession.scoreAfter)} pt`} tone="primary" />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <StatTile value={`${stats.correct}`} unit={`/ ${stats.total}`} label="正解数" />
        <StatTile value={`${Math.round((stats.correct / Math.max(1, stats.total)) * 100)}`} unit="%" label="正解率" />
        <StatTile value={`${minutes}:${String(seconds).padStart(2, '0')}`} label="所要時間" />
      </View>

      {/* 先生からの総括 */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>FROM YOUR TEACHER</Eyebrow>
        {loading ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ height: 12, width: '95%', borderRadius: 6, backgroundColor: colors.secondary }} />
            <View style={{ height: 12, width: '80%', borderRadius: 6, backgroundColor: colors.secondary }} />
            <Meta style={{ marginTop: spacing.sm }}>先生が今日の学習をまとめています…</Meta>
          </View>
        ) : summary ? (
          <View style={{ gap: spacing.md }}>
            <Body>{summary.summary}</Body>
            <Divider />
            <View style={{ gap: 4 }}>
              <Meta style={{ fontWeight: '700' }}>今日よかった点</Meta>
              <Body style={{ fontSize: 14 }}>{summary.strength}</Body>
            </View>
            <View style={{ gap: 4 }}>
              <Meta style={{ fontWeight: '700', color: colors.primary }}>次回への一言</Meta>
              <Body style={{ fontSize: 14 }}>{summary.focus}</Body>
            </View>
            {summary.source === 'fallback' ? (
              <View style={{ gap: spacing.sm }}>
                <Meta style={{ color: colors.destructive }}>{FALLBACK_MESSAGE[summary.reason ?? 'offline']}</Meta>
                {summary.reason !== 'no-key' ? (
                  <Button
                    label={loading ? '取得しています…' : '総括をもう一度取得する'}
                    variant="outline"
                    size="md"
                    loading={loading}
                    disabled={loading}
                    onPress={() => {
                      setLoading(true);
                      void requestSummary(lastSession)
                        .then(setSummary)
                        .finally(() => setLoading(false));
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* 今日の誤答タイプ内訳 */}
      {Object.keys(stats.errorTypes).length > 0 ? (
        <Card tone="secondary" style={{ marginTop: spacing.lg }}>
          <Eyebrow style={{ marginBottom: spacing.md }}>TODAY&apos;S ERROR CHART</Eyebrow>
          <View style={{ gap: spacing.sm }}>
            {Object.entries(stats.errorTypes).map(([type, count]) => (
              <View key={type} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body style={{ fontSize: 14 }}>{ERROR_TYPE_LABEL[type as keyof typeof ERROR_TYPE_LABEL]}</Body>
                <Num style={{ fontSize: 14 }}>{count}問</Num>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* 1 問ずつの結果 */}
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Eyebrow>QUESTIONS</Eyebrow>
        {lastSession.answers.map((a, i) => {
          const word = getWord(a.wordId);
          return (
            <Animated.View key={`${a.wordId}-${i}`} entering={FadeInDown.delay(i * 40).duration(240)}>
              <Card style={{ paddingVertical: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Body style={{ color: a.correct ? colors.success : colors.destructive, fontWeight: '700' }}>
                    {a.correct ? '✓' : '✕'}
                  </Body>
                  <Body style={{ fontWeight: '700', flex: 1 }}>{word?.word}</Body>
                  <Tag label={a.format === 'recognize' ? '意味' : '文脈'} />
                </View>
                <Meta style={{ marginTop: 4 }}>{word?.meaning}</Meta>
                {!a.correct && a.errorType ? (
                  <Meta style={{ marginTop: 4, color: colors.destructive }}>
                    原因: {ERROR_TYPE_LABEL[a.errorType]}（選んだ答え: {a.chosen}）
                  </Meta>
                ) : null}
              </Card>
            </Animated.View>
          );
        })}
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        {summary && summary.nextWords.length > 0 ? (
          <Button
            label={`${summary.nextWords.length}語に今すぐ再挑戦する`}
            variant="outline"
            loading={retrying}
            disabled={retrying}
            onPress={async () => {
              setRetrying(true);
              try {
                await beginSession('lunch', summary.nextWords);
                router.replace('/session');
              } finally {
                setRetrying(false);
              }
            }}
          />
        ) : null}
        <Button label="ホームに戻る" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
