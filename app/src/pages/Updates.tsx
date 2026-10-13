import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDate, fmtStamp } from '../lib/types'
import type { Update } from '../lib/types'

interface Row extends Update {
  title: string
  shoot_date: string
  crew: { person_id: string; name: string }[]
}

export default function Updates() {
  const { person } = useAuth()
  const office = person?.role === 'office'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [receipts, setReceipts] = useState<{ update_id: string; person_id: string }[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: ups } = await supabase.from('updates').select('id,job_id,changes,sent_at').order('sent_at', { ascending: false }).limit(100)
      const list = (ups ?? []) as Update[]
      const jobIds = list.map((u) => u.job_id).filter((v, i, a) => a.indexOf(v) === i)
      const [jobRes, recRes, asgRes, pplRes] = await Promise.all([
        jobIds.length ? supabase.from('jobs').select('id,title,shoot_date').in('id', jobIds) : Promise.resolve({ data: [] }),
        list.length ? supabase.from('update_receipts').select('update_id,person_id').in('update_id', list.map((u) => u.id)) : Promise.resolve({ data: [] }),
        office && jobIds.length ? supabase.from('job_assignments').select('job_id,person_id').in('job_id', jobIds) : Promise.resolve({ data: [] }),
        office ? supabase.from('people').select('id,name') : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const names: Record<string, string> = {}
      for (const p of pplRes.data ?? []) names[p.id as string] = p.name as string
      setReceipts((recRes.data ?? []) as { update_id: string; person_id: string }[])
      setRows(
        list.map((u) => {
          const j = (jobRes.data ?? []).find((x) => x.id === u.job_id)
          return {
            ...u,
            title: (j?.title as string) ?? 'Job',
            shoot_date: (j?.shoot_date as string) ?? '',
            crew: (asgRes.data ?? []).filter((a) => a.job_id === u.job_id).map((a) => ({ person_id: a.person_id as string, name: names[a.person_id as string] ?? 'Someone' })),
          }
        }),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [office])

  if (!rows) return <p className="empty">Loading updates…</p>
  if (!rows.length)
    return <p className="empty">{office ? 'Nothing sent yet. Updates you send to the crew are logged here.' : 'No changes yet. When a job you are on changes, it shows up here.'}</p>

  const seen = (u: string, p: string) => receipts.some((r) => r.update_id === u && r.person_id === p)

  return (
    <div className="feed">
      {rows.map((u) => (
        <article key={u.id}>
          {office ? (
            <span className="meta">
              {u.crew.map((c, i) => (
                <span key={c.person_id}>
                  {i > 0 && ' · '}
                  {c.name}: <span className={seen(u.id, c.person_id) ? 'seen' : 'unseen'}>{seen(u.id, c.person_id) ? 'seen' : 'not seen'}</span>
                </span>
              ))}
            </span>
          ) : (
            !seen(u.id, person?.id ?? '') && <span><span className="pill">New</span></span>
          )}
          <span className="meta">{fmtStamp(u.sent_at)}</span>
          <h3>{u.title} {u.shoot_date && <span className="meta">{fmtDate(u.shoot_date)}</span>}</h3>
          <ul className="plain">{u.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div><Link to={`/jobs/${u.job_id}`}>Open call sheet</Link></div>
        </article>
      ))}
    </div>
  )
}
