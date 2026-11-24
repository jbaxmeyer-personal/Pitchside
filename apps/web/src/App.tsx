import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp, when } from './hooks';
import { AdminPage } from './pages/Admin';
import { Claim } from './pages/Claim';
import { ClubPage } from './pages/Club';
import { CupPage } from './pages/Cup';
import { LineupPage } from './pages/Lineup';
import { Login } from './pages/Login';
import { MatchPage } from './pages/Match';
import { LeaguePage, SeriesPage } from './pages/Series';
import { configured, supabase } from './supabase';

function Shell() {
  const { session, ready, me, now, world } = useApp();
  if (!configured) return <div className="main"><p className="error">Supabase isn't configured for this build.</p></div>;
  if (!ready) return null;
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">Pitchside</div>
        <div className="clock">{world ? `Season ${world.season} · ${when(now)}` : 'The league is being built…'}</div>
        <nav>
          {me?.club_id && <NavLink to={`/club/${me.club_id}`}>My club</NavLink>}
          {me?.club_id && <NavLink to="/lineup">Lineup</NavLink>}
          <NavLink to="/league">League</NavLink>
          <NavLink to="/cup">Cup</NavLink>
          {me?.is_admin && <NavLink to="/admin">Admin</NavLink>}
          {session && <a href="#" onClick={(e) => { e.preventDefault(); supabase.auth.signOut(); }}>Sign out</a>}
        </nav>
      </aside>
      <main className="main">
        {!world ? (
          <div className="panel"><h2>Kicking off soon</h2><p className="muted">The USA league is generated on the first scheduler run, within a couple of minutes of deploy. Refresh shortly.</p></div>
        ) : (
          <Routes>
            <Route path="/" element={!session ? <Login /> : me?.club_id ? <Navigate to={`/club/${me.club_id}`} /> : <Claim />} />
            <Route path="/club/:id" element={<ClubPage />} />
            <Route path="/lineup" element={<LineupPage />} />
            <Route path="/league" element={<LeaguePage />} />
            <Route path="/series/:id" element={<SeriesPage />} />
            <Route path="/match/:id" element={<MatchPage />} />
            <Route path="/cup" element={<CupPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppProvider><Shell /></AppProvider>
    </HashRouter>
  );
}
