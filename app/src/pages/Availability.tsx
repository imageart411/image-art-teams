import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDate, todayISO } from '../lib/types'

export default function Availability() {
  const { person } = useAuth()
  const [days, setDays] = useState<string[] | null>(null)
  const [day, setDay] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!person) return
    const { data } = await supabase.from('unavailability').select('day').eq('person_id', person.id).gte('day', todayISO()).order('day')
    setDays((data ?? []).map((d) => d.day as string))
  }, [person])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    setError('')
    if (!day || !person) return
    const { error: err } = await supabase.from('unavailability').upsert({ person_id: person.id, day })
    if (err) setError('That day was not saved. Check your connection and try again.')
    setDay('')
    load()
  }

  async function remove(d: string) {
    if (!person) return
    await supabase.from('unavailability').delete().eq('person_id', person.id).eq('day', d)
    load()
  }

  if (!days) return <p className="empty">Loading…</p>
  return (
    <section className="sheet">
      <header className="sheet-head">
        <h1>Availability</h1>
        <p className="meta">Mark the days you cannot work. The studio sees a warning before assigning you on those days.</p>
      </header>
      {days.length === 0 && <p className="empty">No days off marked.</p>}
      <ul className="rows">
        {days.map((d) => (
          <li key={d}>
            <span className="time">{fmtDate(d)}, {d.slice(0, 4)}</span>
            <button className="linkbtn" onClick={() => remove(d)}>Remove</button>
          </li>
        ))}
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="rowwrap">
        <input className="inp" type="date" aria-label="Day you cannot work" min={todayISO()} value={day} onChange={(e) => setDay(e.target.value)} />
        <button className="btn small" onClick={add}>Mark unavailable</button>
      </div>
    </section>
  )
}
