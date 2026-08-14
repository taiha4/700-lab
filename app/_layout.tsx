import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { WordsProvider } from '@/context/WordsProvider';
import { useTheme } from '@/theme/useTheme';

void SplashScreen.preventAutoHideAsync();

/**
 * Web プレビュー時のブラウザ自動翻訳を止める。
 *
 * 既定の HTML は lang="en" で配信されるため、日本語環境の Chrome が
 * ページ全体を英語→日本語に翻訳し、出題対象の英単語まで置き換えてしまう
 * （schedule →「スケジュール」）。UI の主言語は日本語だと宣言し、翻訳を無効化する。
 * app/+html.tsx は静的書き出し時にしか効かないため、実行時にも適用する。
 */
function disableBrowserTranslation() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  document.documentElement.lang = 'ja';
  document.documentElement.setAttribute('translate', 'no');
  document.body?.classList.add('notranslate');

  if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
    const meta = document.createElement('meta');
    meta.name = 'google';
    meta.content = 'notranslate';
    document.head.appendChild(meta);
  }
}

export default function RootLayout() {
  const { colors, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  useEffect(() => {
    disableBrowserTranslation();
  }, []);

  useEffect(() => {
    // フォント読込に失敗しても OS 標準で表示を続ける
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WordsProvider>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="session/index" options={{ gestureEnabled: false }} />
            <Stack.Screen name="session/summary" options={{ gestureEnabled: false }} />
            <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
          </Stack>
        </WordsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
