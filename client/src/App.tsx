import { useEffect } from 'react';
import { useStore, getInitialPin } from './store';
import Landing from './views/Landing';
import HostSetup from './views/HostSetup';
import HostGame from './views/HostGame';
import PlayerGame from './views/PlayerGame';
import ErrorBanner from './components/ErrorBanner';

export default function App() {
  const role = useStore((s) => s.role);
  const pin = useStore((s) => s.pin);
  const setRole = useStore((s) => s.setRole);

  // Arriving via a scanned QR link (?pin=...) drops the student on Join.
  useEffect(() => {
    if (getInitialPin() && role === 'none') setRole('player');
  }, [role, setRole]);

  let screen;
  if (role === 'none') screen = <Landing />;
  else if (role === 'host') screen = pin ? <HostGame /> : <HostSetup />;
  else screen = <PlayerGame />;

  return (
    <div className="app">
      <ErrorBanner />
      {screen}
    </div>
  );
}
