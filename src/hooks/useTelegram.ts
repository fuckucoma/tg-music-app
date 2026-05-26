import { useEffect, useState } from 'react';

interface TelegramTheme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentFg: string;
  isDark: boolean;
}

const DARK: TelegramTheme = {
  bg: '#0f0f0f', surface: '#1c1c1e', text: '#ffffff',
  muted: '#8e8e93', accent: '#ffffff', accentFg: '#000000', isDark: true,
};
const LIGHT: TelegramTheme = {
  bg: '#f2f2f7', surface: '#ffffff', text: '#000000',
  muted: '#6c6c70', accent: '#000000', accentFg: '#ffffff', isDark: false,
};

export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  const [theme] = useState<TelegramTheme>(() => {
    if (!tg) return DARK;
    const p = tg.themeParams;
    const dark = tg.colorScheme === 'dark';
    const d = dark ? DARK : LIGHT;
    return {
      bg:       p.bg_color            ?? d.bg,
      surface:  p.secondary_bg_color  ?? d.surface,
      text:     p.text_color          ?? d.text,
      muted:    p.hint_color          ?? d.muted,
      accent:   p.button_color        ?? d.accent,
      accentFg: p.button_text_color   ?? d.accentFg,
      isDark:   dark,
    };
  });

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, [tg]);

  // Push into CSS vars so Tailwind can consume them
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--bg',        theme.bg);
    r.style.setProperty('--surface',   theme.surface);
    r.style.setProperty('--text',      theme.text);
    r.style.setProperty('--muted',     theme.muted);
    r.style.setProperty('--accent',    theme.accent);
    r.style.setProperty('--accent-fg', theme.accentFg);
    // subtle border
    r.style.setProperty('--border', theme.isDark
      ? 'rgba(255,255,255,0.09)'
      : 'rgba(0,0,0,0.09)');
  }, [theme]);

  const haptic = {
    tap:     () => { try { tg?.HapticFeedback?.impactOccurred('light');          } catch {} },
    success: () => { try { tg?.HapticFeedback?.notificationOccurred('success');  } catch {} },
    error:   () => { try { tg?.HapticFeedback?.notificationOccurred('error');    } catch {} },
  };

  return { tg, theme, haptic };
}