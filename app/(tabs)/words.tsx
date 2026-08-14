/**
 * 単語帳（docs/spec.md §4.1）
 * 300 語を二軸の状態つきで一覧する。探すのではなく「今どこにいるか」を見る画面。
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Eyebrow, Meta, Num, Tag, Title } from '@/components/base';
import { useWords } from '@/context/WordsProvider';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';
import type { Stage, Word } from '@/types';

const STAGE_LABEL: Record<Stage, string> = {
  new: '未学習',
  recognized: '分かる',
  using: '使える',
  mastered: '使いこなせる',
};

type Filter = 'all' | Stage;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'recognized', label: '分かる止まり' },
  { key: 'using', label: '使える' },
  { key: 'mastered', label: '使いこなせる' },
  { key: 'new', label: '未学習' },
];

export default function WordsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { words, progress } = useWords();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [level, setLevel] = useState<0 | 1 | 2 | 3>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words.filter((w) => {
      const stage = progress[w.id]?.stage ?? 'new';
      if (filter !== 'all' && stage !== filter) return false;
      if (level !== 0 && w.level !== level) return false;
      if (!q) return true;
      return w.word.toLowerCase().includes(q) || w.meaning.includes(q);
    });
  }, [words, progress, filter, level, query]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Eyebrow>WORD LIST</Eyebrow>
          <Title>単語帳（{filtered.length}語）</Title>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="英単語または意味で探す"
          placeholderTextColor={colors.muted}
          accessibilityLabel="単語を検索"
          style={{
            height: 44,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: spacing.lg,
            color: colors.foreground,
          }}
        />

        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => (
            <Chip label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />
          )}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {([0, 1, 2, 3] as const).map((l) => (
            <Chip
              key={l}
              label={l === 0 ? '全レベル' : `L${l}`}
              active={level === l}
              onPress={() => setLevel(l)}
            />
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.sm }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        ListEmptyComponent={
          <Meta style={{ textAlign: 'center', marginTop: spacing.xl }}>条件に合う単語がありません。</Meta>
        }
        renderItem={({ item }) => (
          <WordRow word={item} stage={progress[item.id]?.stage ?? 'new'} onPress={() => router.push(`/word/${item.id}`)} />
        )}
      />
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      <Body style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryOn : colors.muted }}>{label}</Body>
    </Pressable>
  );
}

/** 行ごとに二層インジケータを持たせ、一覧のまま「分かる／使える」が読み取れるようにする */
function WordRow({ word, stage, onPress }: { word: Word; stage: Stage; onPress: () => void }) {
  const { colors } = useTheme();
  const recognized = stage !== 'new';
  const usable = stage === 'using' || stage === 'mastered';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${word.word}、${word.meaning}、${STAGE_LABEL[stage]}`}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        opacity: pressed ? 0.9 : 1,
        gap: spacing.sm,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {/* 二層インジケータ（上=認識 / 下=運用） */}
        <View style={{ gap: 3 }}>
          <View style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: recognized ? colors.accent : colors.secondary }} />
          <View style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: usable ? colors.primary : colors.secondary }} />
        </View>

        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{word.word}</Body>
          <Meta numberOfLines={1}>{word.meaning}</Meta>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Tag
            label={STAGE_LABEL[stage]}
            tone={stage === 'mastered' ? 'success' : stage === 'recognized' ? 'warning' : stage === 'using' ? 'primary' : 'neutral'}
          />
          <Num style={{ fontSize: 10, color: colors.muted }}>L{word.level}</Num>
        </View>
      </View>
    </Pressable>
  );
}
