import { useEffect, useState } from 'react';

interface TelegramTheme {
  colorScheme: 'light' | 'dark';
  bgColor: string;
  textColor: string;
  hintColor: string;
  buttonColor: string;
  buttonTextColor: string;
  secondaryBgColor: string;
}

const DEFAULT_DARK: TelegramTheme = {
  colorScheme: 'dark',
  bgColor: '#0f0f0f',
  textColor: '#ffffff',
  hintColor: '#aaaaaa',
  buttonColor: '#ffffff',
  buttonTextColor: '#000000',
  secondaryBgColor: '#1a1a1a',
};

const DEFAULT_LIGHT: TelegramTheme = {
  colorScheme: 'light',
  bgColor: '#ffffff',
  textColor: '#000000',
  hintColor: '#888888',
  buttonColor: '#000000',
  buttonTextColor: '#ffffff',
  secondaryBgColor: '#f2f2f2',
};

export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  const [theme] = useState<TelegramTheme>(() => {
    if (!tg) return DEFAULT_DARK;
    const p = tg.themeParams;
    const isDark = tg.colorScheme === 'dark';
    const defaults = isDark ? DEFAULT_DARK : DEFAULT_LIGHT;
    return {
      colorScheme: tg.colorScheme,
      bgColor: p.bg_color ?? defaults.bgColor,
      textColor: p.text_color ?? defaults.textColor,
      hintColor: p.hint_color ?? defaults.hintColor,
      buttonColor: p.button_color ?? defaults.buttonColor,
      buttonTextColor: p.button_text_color ?? defaults.buttonTextColor,
      secondaryBgColor: p.secondary_bg_color ?? defaults.secondaryBgColor,
    };
  });

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, [tg]);

  // Wrapped in try/catch — HapticFeedback API varies across TG versions
  const haptic = {
    tap: () => {
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}
    },
    success: () => {
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
    },
    error: () => {
      try { tg?.HapticFeedback?.notificationOccurred('error'); } catch {}
    },
  };

  return { tg, theme, haptic };
}