import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Person, Role } from '../lib/types'

const ROLE_LABEL: Record<Role, string> = { office: 'Office', photographer: 'Photographer', assistant: 'Assistant' }

export default function Team() {
  const { person: me } = useAuth()
  const [people, setPeople] = useState<Person[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('')
  const [role, setRole] = useState<Role>('photographer')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('people').select('id,email,name,initials,role,active').order('name')
    setPeople((data ?? []) as Person[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const cleanEmail = email.trim().toLowerCase()
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError('Add a name and a valid email address.')
      return
    }
    const { error: err } = await supabase
      .from('people')
      .insert({ name: name.trim(), email: cleanEmail, initials: initials.trim() || null, role })
    if (err) {
      setError(err.code === '23505' ? 'Someone with that email address is already on the team.' : 'That person was not added. Try again.')
      return
    }
    setName('')
    setEmail('')
    setInitials('')
    load()
  }

  async function setActive(p: Person, active: boolean) {
    await supabase.from('people').update({ active }).eq('id', p.id)
    load()
  }

  if (!people) return <p className="empty">Loading team…</p>

  return (
    <section className="sheet">
      <header className="sheet-head">
        <h1>Team</h1>
        <p className="meta">Only people listed here can sign in. Each person signs in with Google using the email shown.</p>
      </header>

      <ul className="rows">
        {people.map((p) => (
          <li key={p.id}>
            <span>
              <strong>{p.name}</strong>{p.id === me?.id ? ' (you)' : ''}
              <br />
              <span className="meta">{ROLE_LABEL[p.role]} · {p.email}{p.active ? '' : ' · access removed'}</span>
            </span>
            {p.id !== me?.id && (
              <button className="linkbtn" onClick={() => setActive(p, !p.active)}>
                {p.active ? 'Remove access' : 'Restore access'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form className="form" onSubmit={add} noValidate>
        <h2>Add someone</h2>
        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor="tName">Name</label>
            <input id="tName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="tEmail">Google email</label>
            <input id="tEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="tInitials">Initials</label>
            <input id="tInitials" value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="tRole">Role</label>
            <select id="tRole" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="photographer">Photographer</option>
              <option value="assistant">Assistant</option>
              <option value="office">Office (full access)</option>
            </select>
          </div>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="submit">Add to team</button>
        </div>
        <p className="hint">Invite emails are not sent yet. For now, tell the person to open the app and sign in with this email.</p>
      </form>
    </section>
  )
}
