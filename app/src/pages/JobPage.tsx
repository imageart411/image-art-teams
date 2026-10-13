import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { directionsUrl, fmtDate, fmtTime } from '../lib/types'
import type { CrewMember, Job } from '../lib/types'

export default function JobPage() {
  const { id } = useParams()
  const { person } = useAuth()
  const office = person?.role === 'office'
  const [job, setJob] = useState<Job | null>(null)
  const [equipment, setEquipment] = useState<string[]>([])
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const [jobRes, eqRes, crewRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('job_equipment').select('name').eq('job_id', id).order('position'),
      supabase.rpc('job_crew', { target: id }),
    ])
    if (!jobRes.data) {
      setState('missing')
      return
    }
    setJob(jobRes.data as Job)
    setEquipment((eqRes.data ?? []).map((e) => e.name as string))
    setCrew((crewRes.data ?? []) as CrewMember[])
    setState('ready')
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function reply(answer: 'accepted' | 'declined') {
    setError('')
    const { error: err } = await supabase.rpc('respond_to_job', { target: id, reply: answer })
    if (err) setError('Your reply was not saved. Check your connection and try again.')
    else load()
  }

  if (state === 'loading') return <p className="empty">Loading job…</p>
  if (state === 'missing' || !job)
    return (
      <p className="empty">
        This job is not available to you. <Link to="/">Back to jobs</Link>
      </p>
    )

  const mine = crew.find((c) => c.person_id === person?.id)
  const sorted = [...crew].sort((a, b) => (a.role === b.role ? 0 : a.role === 'photographer' ? -1 : 1))

  return (
    <article className="sheet">
      <div>
        <Link to="/">← Back to jobs</Link>
      </div>

      {!office && mine?.status === 'pending' && (
        <section className="alert">
          <strong>Can you take this job?</strong>
          <span>The studio is waiting for your reply.</span>
          <div className="actions">
            <button className="btn small" onClick={() => reply('accepted')}>Accept</button>
            <button className="btn ghost small" onClick={() => reply('declined')}>I can't do it</button>
          </div>
        </section>
      )}
      {!office && mine?.status === 'declined' && (
        <section className="alert">
          <strong>You declined this job</strong>
          <span>The studio has been told and will reassign it.</span>
          <div>
            <button className="linkbtn" onClick={() => reply('accepted')}>I can do it after all</button>
          </div>
        </section>
      )}
      {!office && mine?.status === 'accepted' && (
        <p className="meta">
          <span className="seen">You accepted this job.</span>{' '}
          <button className="linkbtn" onClick={() => reply('declined')}>I can't do it anymore</button>
        </p>
      )}
      {error && <p className="alert" role="alert">{error}</p>}

      <header className="sheet-head">
        <span className="label">{[job.shoot_type, job.client].filter(Boolean).join(' · ')}</span>
        <h1>{job.title}</h1>
      </header>

      <div className="calltimes">
        <div><span className="label">Date</span><span className="v">{fmtDate(job.shoot_date)}</span></div>
        <div><span className="label">Call time</span><span className="v">{fmtTime(job.start_time)}</span></div>
        <div><span className="label">Wrap</span><span className="v">{fmtTime(job.end_time)}</span></div>
      </div>

      <div className="actions">
        {job.address && (
          <a className="btn" href={directionsUrl(job.address)} target="_blank" rel="noopener">Get directions</a>
        )}
        {office && <Link className="btn ghost" to={`/jobs/${job.id}/edit`}>Edit job</Link>}
      </div>

      <section className="sec">
        <h2>Where</h2>
        <dl className="kv">
          <dt>Address</dt><dd>{job.address}</dd>
          <dt>Set up</dt><dd>{job.setup}</dd>
          <dt>Parking and load-in</dt><dd>{job.access}</dd>
        </dl>
      </section>

      <section className="sec">
        <h2>On-site contact</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{[job.contact_name, job.contact_role].filter(Boolean).join(', ')}</dd>
          <dt>Phone</dt><dd className="sel">{job.contact_phone}</dd>
        </dl>
      </section>

      <section className="sec">
        <h2>Equipment</h2>
        {equipment.length ? (
          <ul className="plain">{equipment.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <p className="meta">No equipment listed yet.</p>
        )}
      </section>

      <section className="sec">
        <h2>Who is on this job</h2>
        {sorted.length ? (
          <ul className="crew">
            {sorted.map((c) => (
              <li key={c.person_id}>
                <span>{c.name}{c.person_id === person?.id ? ' (you)' : ''}</span>
                <span className="meta">{c.role === 'assistant' ? 'Assistant' : 'Photographer'}</span>
                {c.is_lead && <span className="pill quiet">Lead</span>}
                <span className={c.status === 'accepted' ? 'seen' : 'unseen'}>
                  {c.status === 'accepted' ? 'Accepted' : c.status === 'declined' ? 'Declined' : 'Awaiting reply'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">Nobody is assigned yet.</p>
        )}
      </section>

      <section className="sec">
        <h2>Notes</h2>
        <div className="note">{job.notes || 'No notes yet.'}</div>
      </section>
    </article>
  )
}
