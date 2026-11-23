import { useAuth } from './hooks/useAuth.js';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CursorGlow from './components/CursorGlow.jsx';

export default function App() {
  const { user, ready, login, logout } = useAuth();

  if (!ready) return null; // brief flash avoided: nothing renders until we know if a session exists

  return (
    <>
      <div className="ambient-orb a" aria-hidden="true" />
      <div className="ambient-orb b" aria-hidden="true" />
      <CursorGlow />
      {!user ? <LoginPage onLogin={login} /> : <DashboardPage user={user} onLogout={logout} />}
    </>
  );
}
