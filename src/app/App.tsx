import { PlayerProvider } from '../features/player/PlayerProvider';
import { AppShell } from '../layouts/AppShell';

export default function App() {
  return (
    <PlayerProvider>
      <AppShell />
    </PlayerProvider>
  );
}
