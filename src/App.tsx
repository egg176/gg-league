import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SetupScreen from './components/SetupScreen'
import { isConfigured } from './lib/supabase'
import Overview from './pages/Overview'
import Tournaments from './pages/Tournaments'
import TournamentDetail from './pages/TournamentDetail'
import Duels from './pages/Duels'
import DuelLobby from './pages/DuelLobby'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Leaderboards from './pages/Leaderboards'
import ProfilePage from './pages/ProfilePage'
import Settings from './pages/Settings'
import Auth from './pages/Auth'

export default function App() {
  if (!isConfigured) return <SetupScreen />
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="tournaments" element={<Tournaments />} />
        <Route path="tournaments/:id" element={<TournamentDetail />} />
        <Route path="duels" element={<Duels />} />
        <Route path="duels/:id" element={<DuelLobby />} />
        <Route path="teams" element={<Teams />} />
        <Route path="teams/:id" element={<TeamDetail />} />
        <Route path="leaderboards" element={<Leaderboards />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/:username" element={<ProfilePage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
