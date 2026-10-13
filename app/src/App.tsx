import type { ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Jobs from './pages/Jobs'
import JobPage from './pages/JobPage'
import JobForm from './pages/JobForm'
import Team from './pages/Team'
import Updates from './pages/Updates'
import TasksDue from './pages/TasksDue'
import Availability from './pages/Availability'
import { EquipmentList, TaskList } from './pages/Lists'

function Gate({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <main className="gate">
      <div className="logoplate"><img src="/logo.png" alt="Image Art Studio" /></div>
      <h1>{title ?? 'Image Art Teams'}</h1>
      {children}
    </main>
  )
}

function Shell() {
  const { loading, session, person, authError, signIn, signOut } = useAuth()

  if (!configured)
    return (
      <Gate>
        <p>The app is not connected to its database. The Project URL or publishable key is missing or not in the right form.</p>
      </Gate>
    )
  if (loading) return <Gate><p>Loading…</p></Gate>
  if (!session)
    return (
      <Gate>
        <p>Job schedules and call sheets for the Image Art Studio team.</p>
        {authError && <p className="alert" role="alert">Sign-in did not complete: {authError}</p>}
        <button className="btn" onClick={signIn}>Sign in with Google</button>
      </Gate>
    )
  if (!person)
    return (
      <Gate title="You're not on the team list yet">
        <p>
          You signed in as <span className="sel">{session.user.email}</span>. Ask the studio to add that
          email address, then sign in again.
        </p>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </Gate>
    )

  const office = person.role === 'office'

  return (
    <>
      <header className="top noprint">
        <div className="topin">
          <Link className="brand" to="/">
            <img src="/icon-64.png" alt="" width="36" height="36" />
            <span>Image Art <b>Teams</b></span>
          </Link>
          <div className="who">
            {person.name}
            <button className="linkbtn" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="app">
        <nav className="tabs noprint" aria-label="Sections">
          <NavLink className="tab" to="/" end>{office ? 'All jobs' : 'My jobs'}</NavLink>
          {office && <NavLink className="tab" to="/tasks">Tasks due</NavLink>}
          <NavLink className="tab" to="/updates">{office ? 'Sent updates' : 'Updates'}</NavLink>
          {office && <NavLink className="tab" to="/task-list">Task list</NavLink>}
          {office && <NavLink className="tab" to="/equipment">Equipment list</NavLink>}
          {office && <NavLink className="tab" to="/team">Team</NavLink>}
          {!office && <NavLink className="tab" to="/availability">Availability</NavLink>}
          {office && <span className="spacer" />}
          {office && <Link className="btn small" to="/jobs/new">New job</Link>}
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<Jobs />} />
            <Route path="/updates" element={<Updates />} />
            {office && <Route path="/jobs/new" element={<JobForm />} />}
            {office && <Route path="/jobs/:id/edit" element={<JobForm />} />}
            {office && <Route path="/tasks" element={<TasksDue />} />}
            {office && <Route path="/task-list" element={<TaskList />} />}
            {office && <Route path="/equipment" element={<EquipmentList />} />}
            {office && <Route path="/team" element={<Team />} />}
            {!office && <Route path="/availability" element={<Availability />} />}
            <Route path="/jobs/:id" element={<JobPage />} />
            <Route path="*" element={<Jobs />} />
          </Routes>
        </main>
      </div>
    </>
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
