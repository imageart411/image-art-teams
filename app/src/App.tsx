import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Jobs from './pages/Jobs'
import JobPage from './pages/JobPage'
import JobForm from './pages/JobForm'
import Team from './pages/Team'

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

  const office = person.role === 'office'

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Image Art Teams</div>
        <div className="who">
          {person.name}
          <button className="linkbtn" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {office && (
        <nav className="tabs" aria-label="Sections">
          <NavLink className="tab" to="/" end>All jobs</NavLink>
          <NavLink className="tab" to="/team">Team</NavLink>
          <span className="spacer" />
          <Link className="btn small" to="/jobs/new">New job</Link>
        </nav>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Jobs />} />
          {office && <Route path="/jobs/new" element={<JobForm />} />}
          {office && <Route path="/jobs/:id/edit" element={<JobForm />} />}
          {office && <Route path="/team" element={<Team />} />}
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
