/**
 * ホーム（docs/spec.md §4.1）
 * 開いて 1 タップで学習が始まること、今日の前進が数字で見えることだけに絞る。
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Eyebrow, Meta, Num, Screen, Tag, Title } from '@/components/base';
import { ScoreArc, StatTile } from '@/components/gauges';
import { useWords } from '@/context/WordsProvider';
import { formatDelta, progressTo700 } from '@/domain/score';
import { spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';
import type { SessionMode } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { ready, score, overview, lastSession, beginSession, preparing, words } = useWords();
  const [startingMode, setStartingMode] = useState<SessionMode | null>(null);

  const start = useCallback(
    async (mode: SessionMode) => {
      setStartingMode(mode);
      try {
        await beginSession(mode);
        router.push('/session');
      } finally {
        setStartingMode(null);
      }
    },
    [beginSession, router]
  );

  if (!ready) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Meta>学習データを読み込んでいます…</Meta>
        </View>
      </Screen>
    );
  }

  // 二層ゲージ: 外側 = 認識まで到達、内側 = 運用まで到達
  const { stages, total } = overview;
  const recognizeRatio = (stages.recognized + stages.using + stages.mastered) / total;
  const useRatio = (stages.using + stages.mastered) / total;
  const delta = lastSession ? formatDelta(lastSession.scoreBefore, lastSession.scoreAfter) : undefined;

  return (
    <Screen>
      <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
        <Eyebrow>700 LAB</Eyebrow>
        <Title>今日の15分が、700点をつくる。</Title>
      </View>

      <Card style={{ paddingVertical: spacing.xl }}>
        <ScoreArc score={score} recognizeRatio={recognizeRatio} useRatio={useRatio} delta={delta} />

        <View
          style={{
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Column label="学習した語" value={`${overview.learned}`} unit={`/ ${total}`} />
          <Column label="使える語" value={`${stages.using + stages.mastered}`} unit="語" />
          <Column label="連続" value={`${overview.streakDays}`} unit="日" />
        </View>
      </Card>

      {/* 「覚えたのに使えない」層を名指しして、次の一手にする */}
      {stages.recognized > 0 && (
        <Card tone="secondary" style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Tag label="伸びしろ" tone="primary" />
            <Meta>意味は分かるが、まだ使えない語</Meta>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.sm }}>
            <Num style={{ fontSize: 32, color: colors.primary }}>{stages.recognized}</Num>
            <Body>語</Body>
          </View>
          <Meta style={{ marginTop: 4 }}>
            このセットではこの層から優先して、ビジネス文脈の問題で出します。
          </Meta>
        </Card>
      )}

      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
        <Eyebrow>START</Eyebrow>
        <Card>
          <Body style={{ fontWeight: '700' }}>通勤モード</Body>
          <Meta style={{ marginTop: 2, marginBottom: spacing.md }}>
            {wordCountLabel(words.length)} · 10問 · 約12分。新しい語と復習をバランスよく。
          </Meta>
          <Button
            label={startingMode === 'commute' ? '問題を用意しています…' : '通勤モードを始める'}
            loading={preparing && startingMode === 'commute'}
            disabled={preparing}
            onPress={() => start('commute')}
          />
        </Card>

        <Card>
          <Body style={{ fontWeight: '700' }}>昼休みモード</Body>
          <Meta style={{ marginTop: 2, marginBottom: spacing.md }}>8問 · 約8分。復習と弱点の語に絞ります。</Meta>
          <Button
            label={startingMode === 'lunch' ? '問題を用意しています…' : '昼休みモードを始める'}
            variant="outline"
            loading={preparing && startingMode === 'lunch'}
            disabled={preparing}
            onPress={() => start('lunch')}
          />
        </Card>
      </View>

      {lastSession?.summary ? (
        <Card style={{ marginTop: spacing.lg }} tone="secondary">
          <Eyebrow style={{ marginBottom: spacing.sm }}>LAST SESSION</Eyebrow>
          <Body>{lastSession.summary}</Body>
          {lastSession.nextAdvice ? (
            <Meta style={{ marginTop: spacing.sm, color: colors.primary }}>次回: {lastSession.nextAdvice}</Meta>
          ) : null}
        </Card>
      ) : null}

      <View style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.sm }}>
        <StatTile value={`${Math.round(overview.accuracy * 100)}`} unit="%" label="通算正解率" />
        <StatTile value={`${overview.totalSessions}`} unit="回" label="学習セット" />
        <StatTile value={`${Math.round(progressTo700(score) * 100)}`} unit="%" label="700点への到達" />
      </View>
    </Screen>
  );
}

function Column({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Num style={{ fontSize: 20 }}>{value}</Num>
        <Meta>{unit}</Meta>
      </View>
      <Meta>{label}</Meta>
    </View>
  );
}

const wordCountLabel = (n: number) => `全${n}語から出題`;
