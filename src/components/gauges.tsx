/**
 * 進捗の可視化（docs/spec.md §6 / §4.4 / §4.6）
 *
 * このアプリのシグネチャは「二層ゲージ」。
 * 進捗を必ず〈認識＝淡い層〉と〈運用＝濃い層〉の2層で描き、
 * その差（＝覚えたのに使えない量）が一目で分かるようにする。
 */
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Meta, Num } from './base';
import { fonts, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** 極座標 → デカルト座標。UI スレッドから呼ぶので worklet 化する */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  'worklet';
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 半円アーク（180°→360°）のパスを ratio 分だけ描く */
function arcPath(cx: number, cy: number, r: number, ratio: number): string {
  'worklet';
  const clamped = Math.min(1, Math.max(0.0001, ratio));
  const end = polar(cx, cy, r, 180 * clamped);
  const start = polar(cx, cy, r, 0);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * ホームの主役。700点メーターを二層アークで描く。
 * 外側の淡い層 = 認識まで到達した量、内側の濃い層 = 運用まで到達した量。
 */
export function ScoreArc({
  score,
  recognizeRatio,
  useRatio,
  delta,
}: {
  score: number;
  /** 認識層の到達率 0–1 */
  recognizeRatio: number;
  /** 運用層の到達率 0–1 */
  useRatio: number;
  /** セット直後の差分表示（省略可） */
  delta?: string;
}) {
  const { colors } = useTheme();
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 108;
  const innerR = 86;

  const outer = useSharedValue(0);
  const inner = useSharedValue(0);

  useEffect(() => {
    outer.value = withTiming(recognizeRatio, { duration: 900 });
    inner.value = withTiming(useRatio, { duration: 1100 });
  }, [recognizeRatio, useRatio, outer, inner]);

  // 到達 0 のときは線端の丸みだけが点として残るので、まるごと隠す
  const outerProps = useAnimatedProps(() => ({
    d: arcPath(cx, cy, outerR, outer.value),
    opacity: outer.value <= 0.0005 ? 0 : 1,
  }));
  const innerProps = useAnimatedProps(() => ({
    d: arcPath(cx, cy, innerR, inner.value),
    opacity: inner.value <= 0.0005 ? 0 : 1,
  }));

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ height: size / 2 + 24, width: size }}>
        <Svg width={size} height={size}>
          {/* 下地 */}
          <Path d={arcPath(cx, cy, outerR, 1)} stroke={colors.secondary} strokeWidth={14} fill="none" strokeLinecap="round" />
          <Path d={arcPath(cx, cy, innerR, 1)} stroke={colors.secondary} strokeWidth={12} fill="none" strokeLinecap="round" />
          {/* 認識層（淡） */}
          <AnimatedPath
            animatedProps={outerProps}
            stroke={colors.accent}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
          />
          {/* 運用層（濃）＝ 本当に「使える」量 */}
          <AnimatedPath
            animatedProps={innerProps}
            stroke={colors.primary}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>

        <View style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center' }}>
          <Num style={{ fontSize: 46, color: colors.foreground }}>{score.toFixed(1)}</Num>
          <Meta style={{ marginTop: 2, fontFamily: fonts.mono, letterSpacing: 1 }}>推定到達スコア</Meta>
          {delta ? (
            <View
              style={{
                marginTop: spacing.sm,
                backgroundColor: colors.secondary,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <Num style={{ fontSize: 14, color: colors.primary }}>{delta} pt</Num>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
        <LayerLegend color={colors.accent} label="分かる（認識）" />
        <LayerLegend color={colors.primary} label="使える（運用）" />
      </View>
    </View>
  );
}

function LayerLegend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Meta>{label}</Meta>
    </View>
  );
}

/**
 * 二層ゲージの横棒版。単語行や小さな枠で使う。
 * 上層 = 認識、下層 = 運用。ズレている幅がそのまま「使えない差」。
 */
export function TwoLayerBar({
  recognizeRatio,
  useRatio,
  height = 8,
  style,
}: {
  recognizeRatio: number;
  useRatio: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const clamp = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%` as const;

  return (
    <View style={[{ gap: 3 }, style]}>
      <View style={{ height, borderRadius: height, backgroundColor: colors.secondary, overflow: 'hidden' }}>
        <View style={{ width: clamp(recognizeRatio), height: '100%', backgroundColor: colors.accent }} />
      </View>
      <View style={{ height, borderRadius: height, backgroundColor: colors.secondary, overflow: 'hidden' }}>
        <View style={{ width: clamp(useRatio), height: '100%', backgroundColor: colors.primary }} />
      </View>
    </View>
  );
}

export type DonutSlice = { value: number; color: string; label: string };

/** 誤答カルテのドーナツ。件数 0 のときは薄いリングだけ描く */
export function Donut({ slices, size = 140, thickness = 18 }: { slices: DonutSlice[]; size?: number; thickness?: number }) {
  const { colors } = useTheme();
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.secondary} strokeWidth={thickness} fill="none" />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const length = (s.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const el = (
                <Circle
                  key={s.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={s.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return el;
            })}
      </G>
    </Svg>
  );
}

/** 直近 7 日の学習量バー */
export function WeekBars({ data }: { data: { label: string; count: number }[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 84 }}>
      {data.map((d, i) => (
        <View key={`${d.label}-${i}`} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
          <View
            style={{
              width: 18,
              height: Math.max(4, (d.count / max) * 56),
              borderRadius: 6,
              backgroundColor: d.count > 0 ? colors.primary : colors.secondary,
            }}
          />
          <Meta style={{ fontFamily: fonts.mono, fontSize: 10 }}>{d.label}</Meta>
        </View>
      ))}
    </View>
  );
}

/** 数値 KPI の小タイル */
export function StatTile({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 96,
        backgroundColor: colors.card,
        borderRadius: radius.tag + 4,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Num style={{ fontSize: 22 }}>{value}</Num>
        {unit ? <Meta style={{ fontFamily: fonts.mono }}>{unit}</Meta> : null}
      </View>
      <Meta numberOfLines={1}>{label}</Meta>
    </View>
  );
}

/**
 * 数値のカウントアップ（総括画面のスコア差分に使う）。
 * 表示する数値そのものを動かすので、JS 側で補間する。
 */
export function useCountUp(from: number, to: number, duration = 900): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      // ease-out で着地を穏やかにする
      setValue(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, duration]);

  return value;
}
