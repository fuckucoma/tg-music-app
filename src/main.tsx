import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';

const isTelegram = Boolean(window.Telegram?.WebApp?.initData);
const entry = isTelegram ? import('./App') : import('./desktop/DesktopApp');
entry.then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
