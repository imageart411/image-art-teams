import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDate, todayISO } from '../lib/types'
import type { Task } from '../lib/types'

export default function TasksDue() {
  const { person } = useAuth()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('job_tasks').select('*').is('done_on', null).order('due_date', { nullsFirst: false })
    const list = (data ?? []) as Task[]
    const ids = list.map((t) => t.job_id).filter((v, i, a) => a.indexOf(v) === i)
    const map: Record<string, string> = {}
    if (ids.length) {
      const { data: jobs } = await supabase.from('jobs').select('id,title').in('id', ids)
      for (const j of jobs ?? []) map[j.id as string] = j.title as string
    }
    setTitles(map)
    setTasks(list)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function complete(t: Task) {
    setError('')
    const { error: err } = await supabase.from('job_tasks').update({ done_on: todayISO(), done_by: person?.id ?? null }).eq('id', t.id)
    if (err) setError('That task was not saved. Check your connection and try again.')
    load()
  }

  if (!tasks) return <p className="empty">Loading tasks…</p>
  const today = todayISO()

  return (
    <section className="sheet">
      <header className="sheet-head">
        <h1>Tasks due</h1>
        <p className="meta">Every unfinished task across all jobs, soonest first. Ticking one records today's date and your name.</p>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {tasks.length === 0 && <p className="empty">Nothing outstanding. Tasks you add to jobs show up here until they are ticked off.</p>}
      <ul className="rows">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="rowwrap">
              <input type="checkbox" checked={false} onChange={() => complete(t)} />
              <span><strong>{t.name}</strong><br /><span className="meta">{titles[t.job_id] ?? 'Job'}</span></span>
            </label>
            <span className="rowwrap">
              {t.due_date && t.due_date < today && <span className="pill">Overdue</span>}
              <span className="time">{t.due_date ? `Due ${fmtDate(t.due_date)}` : 'No due date'}</span>
              <Link to={`/jobs/${t.job_id}`}>Open job</Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
