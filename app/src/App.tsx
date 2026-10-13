import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Jobs from './pages/Jobs'
import JobPage from './pages/JobPage'

function Shell() {
  const { loading, session, person, signIn, signOut } = useAuth()

  if (!configured)
    return (
      <main className="gate">
        <h1>Image Art Teams</h1>
        <p>The app is not connected to its database yet. Add the Project URL and publishable key to app/.env.local, then restart.</p>
      </main>
    )
  if (loading) return <main className="gate"><p>Loading…</p></main>
  if (!session)
    return (
      <main className="gate">
        <h1>Image Art Teams</h1>
        <p>Job schedules and call sheets for the Image Art Studio team.</p>
        <button className="btn" onClick={signIn}>Sign in with Google</button>
      </main>
    )
  if (!person)
    return (
      <main className="gate">
        <h1>You're not on the team list yet</h1>
        <p>
          You signed in as <span className="sel">{session.user.email}</span>. Ask the studio to add that
          email address, then sign in again.
        </p>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </main>
    )

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Image Art Teams</div>
        <div className="who">
          {person.name}
          <button className="linkbtn" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="*" element={<Jobs />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  )
}
