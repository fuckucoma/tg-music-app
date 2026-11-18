import { useEffect } from 'react';

export function useTelegram() {
  const webApp = window.Telegram?.WebApp;
  const telegram = webApp?.initData ? webApp : undefined;

  useEffect(() => {
    if (!telegram) return;
    const applyTheme = () => {
      const theme = telegram.themeParams ?? {};
      const dark = telegram.colorScheme !== 'light';
      const variables = {
        '--bg': theme.bg_color ?? (dark ? '#0f0f0f' : '#f2f2f7'),
        '--surface': theme.secondary_bg_color ?? (dark ? '#1c1c1e' : '#fff'),
        '--text': theme.text_color ?? (dark ? '#fff' : '#000'),
        '--muted': theme.hint_color ?? (dark ? '#8e8e93' : '#6c6c70'),
        '--accent': theme.button_color ?? (dark ? '#fff' : '#000'),
        '--accent-fg': theme.button_text_color ?? (dark ? '#000' : '#fff'),
        '--border': dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)',
      };
      for (const [name, value] of Object.entries(variables))
        document.documentElement.style.setProperty(name, value);
    };

    telegram.ready();
    telegram.expand();
    applyTheme();
    telegram.onEvent?.('themeChanged', applyTheme);
    return () => telegram.offEvent?.('themeChanged', applyTheme);
  }, [telegram]);

  const hapticTap = () => {
    try { telegram?.HapticFeedback?.impactOccurred('light'); } catch { /* Optional Telegram SDK. */ }
  };
  return { initData: telegram?.initData, hapticTap };
}
