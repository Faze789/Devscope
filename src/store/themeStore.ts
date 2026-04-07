import { create } from 'zustand';
import { Appearance } from 'react-native';
import { Theme, darkTheme, lightTheme } from '../theme';

interface ThemeState {
  theme: Theme;
  preference: 'system' | 'dark' | 'light';
  setPreference: (pref: 'system' | 'dark' | 'light') => void;
}

function resolveTheme(pref: 'system' | 'dark' | 'light'): Theme {
  if (pref === 'dark') return darkTheme;
  if (pref === 'light') return lightTheme;
  return Appearance.getColorScheme() === 'dark' ? darkTheme : lightTheme;
}

export const useThemeStore = create<ThemeState>((set) => {
  const listener = Appearance.addChangeListener(({ colorScheme }) => {
    set((state) => {
      if (state.preference !== 'system') return state;
      return { theme: colorScheme === 'dark' ? darkTheme : lightTheme };
    });
  });

  return {
    theme: resolveTheme('system'),
    preference: 'system',
    setPreference: (pref) =>
      set({ preference: pref, theme: resolveTheme(pref) }),
  };
});
