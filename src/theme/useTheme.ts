import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from './index';

export function useTheme(): { colors: Palette; dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { colors: dark ? darkPalette : lightPalette, dark };
}

export * from './index';
