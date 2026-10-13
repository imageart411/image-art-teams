import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { check, findConflicts, sendUpdate, signedUrls } from '../lib/data'
import type { Conflict } from '../lib/data'
import { addDays, calendarUrl, directionsUrl, fmtDate, fmtStamp, fmtTime, lines, todayISO } from '../lib/types'
import type { Assignment, CrewMember, Job, Person, Photo, Task, Update } from '../lib/types'

interface Option {
  id: string
  title: string
  shoot_date: string
  start_time: string
  end_time: string
  address: string
}

export default function JobPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { person } = useAuth()
  const office = person?.role === 'office'
  const me = person?.id ?? ''

  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [job, setJob] = useState<Job | null>(null)
  const [equipment, setEquipment] = useState<string[]>([])
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [updates, setUpdates] = useState<Update[]>([])
  const [receipts, setReceipts] = useState<{ update_id: string; person_id: string }[]>([])
  // Office only
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [catalog, setCatalog] = useState<string[]>([])
  const [wantTitles, setWantTitles] = useState<Record<string, string>>({})
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [taskText, setTaskText] = useState('')
  const [replacement, setReplacement] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string[] | null>(null)
  // Crew only
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [wants, setWants] = useState('')
  const [options, setOptions] = useState<Option[]>([])
  const [packed, setPacked] = useState<string[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const jobRes = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
    if (!jobRes.data) {
      setStatus('missing')
      return
    }
    const j = jobRes.data as Job
    const [eqRes, crewRes, photoRes, updRes] = await Promise.all([
      supabase.from('job_equipment').select('name').eq('job_id', id).order('position'),
      supabase.rpc('job_crew', { target: id }),
      supabase.from('job_photos').select('id,storage_path,caption').eq('job_id', id).order('position'),
      supabase.from('updates').select('id,job_id,changes,sent_at').eq('job_id', id).order('sent_at'),
    ])
    const ups = (updRes.data ?? []) as Update[]
    const pics = (photoRes.data ?? []) as Photo[]
    const crewList = (crewRes.data ?? []) as CrewMember[]
    const [recRes, signed] = await Promise.all([
      ups.length
        ? supabase.from('update_receipts').select('update_id,person_id').in('update_id', ups.map((u) => u.id))
        : Promise.resolve({ data: [] }),
      signedUrls(pics.map((p) => p.storage_path)),
    ])

    if (person?.role === 'office') {
      const [asgRes, pplRes, taskRes, catRes] = await Promise.all([
        supabase.from('job_assignments').select('person_id,status,decline_reason,wants_job_id,moved').eq('job_id', id),
        supabase.from('people').select('id,email,name,initials,role,active').order('name'),
        supabase.from('job_tasks').select('*').eq('job_id', id).order('position'),
        supabase.from('task_catalog').select('name').order('name'),
      ])
      const asg = (asgRes.data ?? []) as Assignment[]
      const wantIds = asg.map((a) => a.wants_job_id).filter((w): w is string => !!w)
      const titles: Record<string, string> = {}
      if (wantIds.length) {
        const { data } = await supabase.from('jobs').select('id,title,shoot_date').in('id', wantIds)
        for (const w of data ?? []) titles[w.id as string] = `${w.title}, ${fmtDate(w.shoot_date as string)}`
      }
      setAssignments(asg)
      setPeople((pplRes.data ?? []) as Person[])
      setTasks((taskRes.data ?? []) as Task[])
      setCatalog((catRes.data ?? []).map((c) => c.name as string))
      setWantTitles(titles)
      setConflicts(await findConflicts(asg.filter((a) => a.status !== 'declined').map((a) => a.person_id), j))
    }

    setJob(j)
    setEquipment((eqRes.data ?? []).map((e) => e.name as string))
    setCrew(crewList)
    setPhotos(pics)
    setUrls(signed)
    setUpdates(ups)
    setReceipts((recRes.data ?? []) as { update_id: string; person_id: string }[])
    setStatus('ready')
  }, [id, person?.role])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      setPacked(JSON.parse(localStorage.getItem(`packed:${id}`) ?? '[]') as string[])
    } catch {
      setPacked([])
    }
  }, [id])

  // Run an action against the database, then refresh the page's data.
  async function act(fn: () => Promise<void>) {
    setError('')
    try {
      await fn()
      await load()
    } catch {
      setError('That change was not saved. Check your connection and try again.')
    }
  }

  if (status === 'loading') return <p className="empty">Loading job…</p>
  if (status === 'missing' || !job)
    return <p className="empty">This job is not available to you. <Link to="/">Back to jobs</Link></p>

  const nameOf = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? crew.find((c) => c.person_id === pid)?.name ?? 'Someone'
  const mine = crew.find((c) => c.person_id === me)
  const sorted = [...crew].sort((a, b) => (a.role === b.role ? 0 : a.role === 'photographer' ? -1 : 1))
  const seenBy = (updateId: string, pid: string) => receipts.some((r) => r.update_id === updateId && r.person_id === pid)
  const unseen = office ? [] : updates.filter((u) => !seenBy(u.id, me))
  const last = updates[updates.length - 1]
  const today = todayISO()

  // Crew actions ------------------------------------------------------------
  const reply = (answer: 'accepted' | 'declined') =>
    act(async () => {
      check(await supabase.rpc('respond_to_job', { target: id, reply: answer, reason: answer === 'declined' ? reason : null, wants: answer === 'declined' && wants ? wants : null }))
      setDeclining(false)
      setReason('')
      setWants('')
    })
  async function startDecline() {
    setDeclining(true)
    const { data } = await supabase.rpc('jobs_i_could_take')
    setOptions(((data ?? []) as Option[]).filter((o) => o.id !== id))
  }
  const gotIt = () => act(async () => { check(await supabase.rpc('mark_job_seen', { target: id })) })
  function togglePacked(item: string, on: boolean) {
    const next = on ? [...packed, item] : packed.filter((p) => p !== item)
    setPacked(next)
    try {
      localStorage.setItem(`packed:${id}`, JSON.stringify(next))
    } catch {
      // Ticks are a convenience; carry on if the browser will not store them.
    }
  }

  // Office actions ----------------------------------------------------------
  const notify = () =>
    act(async () => {
      const changes = job.pending_changes.length ? job.pending_changes : ['Reminder: please review this call sheet']
      await sendUpdate(id, changes, me)
      check(await supabase.from('jobs').update({ pending_changes: [] }).eq('id', id))
      setSent(changes)
    })
  const reassign = (out: string) =>
    act(async () => {
      const inn = replacement[out] ?? freeFor(out)[0]?.id
      if (!inn) return
      check(await supabase.from('job_assignments').delete().eq('job_id', id).eq('person_id', out))
      check(await supabase.from('job_assignments').insert({ job_id: id, person_id: inn }))
      if (job.lead_id === out) check(await supabase.from('jobs').update({ lead_id: inn }).eq('id', id))
      const changes = [`${nameOf(inn)} added to the job`, `${nameOf(out)} removed from the job`]
      await sendUpdate(id, changes, me)
      setSent(changes)
    })
  const approveMove = (a: Assignment) =>
    act(async () => {
      if (!a.wants_job_id) return
      check(
        await supabase.from('job_assignments').upsert(
          { job_id: a.wants_job_id, person_id: a.person_id, status: 'accepted', responded_at: new Date().toISOString() },
          { onConflict: 'job_id,person_id' },
        ),
      )
      check(await supabase.from('job_assignments').update({ moved: true }).eq('job_id', id).eq('person_id', a.person_id))
      await sendUpdate(a.wants_job_id, [`${nameOf(a.person_id)} added to the job`], me)
    })
  const removeCrew = (pid: string) =>
    act(async () => {
      check(await supabase.from('job_assignments').delete().eq('job_id', id).eq('person_id', pid))
      if (job.lead_id === pid) check(await supabase.from('jobs').update({ lead_id: null }).eq('id', id))
      if (crew.length > 1) await sendUpdate(id, [`${nameOf(pid)} removed from the job`], me)
    })
  const toggleTask = (t: Task, done: boolean) =>
    act(async () => {
      check(await supabase.from('job_tasks').update({ done_on: done ? today : null, done_by: done ? me : null }).eq('id', t.id))
    })
  const setTaskDate = (t: Task, field: 'due_date' | 'done_on', value: string) =>
    act(async () => { check(await supabase.from('job_tasks').update({ [field]: value || null }).eq('id', t.id)) })
  const removeTask = (t: Task) => act(async () => { check(await supabase.from('job_tasks').delete().eq('id', t.id)) })
  const addTasks = () =>
    act(async () => {
      const have = tasks.map((t) => t.name.toLowerCase())
      const names = [...picked, ...lines(taskText)].filter((n, i, all) => !have.includes(n.toLowerCase()) && all.indexOf(n) === i)
      if (names.length)
        check(
          await supabase.from('job_tasks').insert(
            names.map((name, i) => ({ job_id: id, name, due_date: addDays(job.shoot_date, 14), position: tasks.length + i })),
          ),
        )
      setPicked([])
      setTaskText('')
    })

  const freeFor = (pid: string) => {
    const role = people.find((p) => p.id === pid)?.role
    return people.filter((p) => p.active && p.role === role && !crew.some((c) => c.person_id === p.id))
  }
  const tasksLeft = catalog.filter((n) => !tasks.some((t) => t.name.toLowerCase() === n.toLowerCase()))

  return (
    <article className="sheet">
      <div className="noprint"><Link to="/">← Back to jobs</Link></div>

      {office && sent && (
        <section className="preview noprint">
          <div><strong>Update saved.</strong> {sorted.map((c) => c.name).join(', ')} will see it in the app.</div>
          <ul className="plain">{sent.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="hint">Email, text and phone notifications are not connected yet, so for now this shows only inside the app.</p>
        </section>
      )}
      {office && job.pending_changes.length > 0 && (
        <section className="alert noprint">
          <strong>Saved but not sent yet</strong>
          <ul className="plain">{job.pending_changes.map((c) => <li key={c}>{c}</li>)}</ul>
          <span>{crew.length ? 'Use Notify photographers and staff below to send these.' : 'Nobody is assigned yet, so there is no one to notify.'}</span>
        </section>
      )}

      {unseen.length > 0 && (
        <section className="alert noprint">
          <strong>Changed since you last looked</strong>
          <ul className="plain">
            {unseen.flatMap((u) => u.changes.map((c) => <li key={u.id + c}>{c} <span className="meta">({fmtStamp(u.sent_at)})</span></li>))}
          </ul>
          <div><button className="btn small" onClick={gotIt}>Got it</button></div>
        </section>
      )}

      {!office && mine && declining && (
        <section className="alert noprint">
          <strong>Decline this job</strong>
          <div className="field">
            <label className="label" htmlFor="declineReason">Reason for the studio (optional)</label>
            <textarea id="declineReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <fieldset className="pick">
            <legend className="label">A job I could work instead (optional)</legend>
            <label><input type="radio" name="wants" checked={wants === ''} onChange={() => setWants('')} /><span>No request</span></label>
            {options.map((o) => (
              <label key={o.id}>
                <input type="radio" name="wants" checked={wants === o.id} onChange={() => setWants(o.id)} />
                <span>
                  <strong>{o.title}</strong><br />
                  <span className="time">{fmtDate(o.shoot_date)} · {fmtTime(o.start_time)} to {fmtTime(o.end_time)}</span><br />
                  <span className="meta">{o.address || 'Address not set yet'}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <span className="hint">The studio decides whether to move you.</span>
          <div className="actions">
            <button className="btn small" onClick={() => reply('declined')}>Send decline</button>
            <button className="btn ghost small" onClick={() => setDeclining(false)}>Cancel</button>
          </div>
        </section>
      )}
      {!office && mine && !declining && mine.status === 'pending' && (
        <section className="alert noprint">
          <strong>Can you take this job?</strong>
          <span>The studio is waiting for your reply.</span>
          <div className="actions">
            <button className="btn small" onClick={() => reply('accepted')}>Accept</button>
            <button className="btn ghost small" onClick={startDecline}>I can't do it</button>
          </div>
          <span className="hint">When you decline you can ask for a different job instead.</span>
        </section>
      )}
      {!office && mine && !declining && mine.status === 'declined' && (
        <section className="alert noprint">
          <strong>You declined this job</strong>
          <span>The studio has been told and will reassign it.</span>
          <div><button className="linkbtn" onClick={() => reply('accepted')}>I can do it after all</button></div>
        </section>
      )}
      {!office && mine && !declining && mine.status === 'accepted' && (
        <p className="meta noprint">
          <span className="seen">You accepted this job.</span>{' '}
          <button className="linkbtn" onClick={startDecline}>Decline or ask for a different job</button>
        </p>
      )}
      {error && <p className="alert noprint" role="alert">{error}</p>}

      <header className="sheet-head">
        <span className="label">{[office ? 'Office copy' : '', job.shoot_type, job.client].filter(Boolean).join(' · ')}</span>
        <h1>{job.title}</h1>
      </header>

      <div className="calltimes">
        <div><span className="label">Date</span><span className="v">{fmtDate(job.shoot_date)}</span></div>
        <div><span className="label">Call time</span><span className="v">{fmtTime(job.start_time)}</span></div>
        <div><span className="label">Wrap</span><span className="v">{fmtTime(job.end_time)}</span></div>
      </div>

      <div className="actions noprint">
        {job.address && <a className="btn" href={directionsUrl(job.address)} target="_blank" rel="noopener">Get directions</a>}
        <a className="btn ghost" href={calendarUrl(job)} target="_blank" rel="noopener">Add to Google Calendar</a>
        <button className="btn ghost" onClick={() => window.print()}>Print or save as PDF</button>
        {office && <Link className="btn ghost" to={`/jobs/${job.id}/edit`}>Edit job</Link>}
        {office && <button className="btn ghost" onClick={() => navigate(`/jobs/new?from=${job.id}`)}>Duplicate</button>}
        {office && crew.length > 0 && <button className="btn ghost" onClick={notify}>Notify photographers and staff</button>}
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
        {equipment.length === 0 && <p className="meta">No equipment listed yet.</p>}
        <ul className="checks">
          {equipment.map((e) => (
            <li key={e}>
              <label>
                <input type="checkbox" checked={packed.includes(e)} onChange={(ev) => togglePacked(e, ev.target.checked)} />
                <span>{e}</span>
              </label>
            </li>
          ))}
        </ul>
        {equipment.length > 0 && <p className="hint noprint">Tick items off as you pack. The ticks are saved on this device only.</p>}
      </section>

      <section className="sec">
        <h2>Who is on this job</h2>
        {sorted.length === 0 && <p className="meta">Nobody is assigned yet.</p>}
        <ul className="crew">
          {sorted.map((c) => {
            const a = assignments.find((x) => x.person_id === c.person_id)
            const clash = conflicts.filter((x) => x.person_id === c.person_id)
            const free = office && c.status === 'declined' ? freeFor(c.person_id) : []
            return (
              <li key={c.person_id}>
                <span>{c.name}{c.person_id === me ? ' (you)' : ''}</span>
                <span className="meta">{c.role === 'assistant' ? 'Assistant' : 'Photographer'}</span>
                {c.is_lead && <span className="pill quiet">Lead</span>}
                <span className={c.status === 'accepted' ? 'seen' : 'unseen'}>
                  {c.status === 'accepted' ? 'Accepted' : c.status === 'declined' ? 'Declined' : 'Awaiting reply'}
                  {office && a?.decline_reason ? `: ${a.decline_reason}` : ''}
                </span>
                {office && last && c.status !== 'declined' && (
                  <span className={seenBy(last.id, c.person_id) ? 'seen noprint' : 'unseen noprint'}>
                    {seenBy(last.id, c.person_id) ? 'Seen latest update' : 'Not seen latest update'}
                  </span>
                )}
                {clash.length > 0 && <span className="unseen">Conflict: {clash.map((x) => x.text).join('; ')}</span>}
                {office && a?.status === 'declined' && (
                  <span className="rowwrap noprint">
                    {a.wants_job_id && wantTitles[a.wants_job_id] && (
                      <span className="meta">{a.moved ? 'Moved to ' : 'Asked to work '}{wantTitles[a.wants_job_id]}{a.moved ? '' : ' instead'}</span>
                    )}
                    {a.wants_job_id && !a.moved && <button className="btn small" onClick={() => approveMove(a)}>Approve move</button>}
                    {free.length > 0 && (
                      <>
                        <select
                          aria-label={`Replacement for ${c.name}`}
                          value={replacement[c.person_id] ?? free[0].id}
                          onChange={(e) => setReplacement({ ...replacement, [c.person_id]: e.target.value })}
                        >
                          {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className="btn small" onClick={() => reassign(c.person_id)}>Reassign</button>
                      </>
                    )}
                    <button className="btn ghost small" onClick={() => removeCrew(c.person_id)}>Remove from job</button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {office && (
        <section className="sec">
          <h2>Tasks</h2>
          <p className="hint noprint">
            {tasks.filter((t) => t.done_on).length} of {tasks.length} complete. Ticking a task records today's date and your name. Change the date if it was finished on another day.
          </p>
          <ul className="rows">
            {tasks.map((t) => (
              <li key={t.id}>
                <label className="rowwrap">
                  <input type="checkbox" checked={!!t.done_on} onChange={(e) => toggleTask(t, e.target.checked)} />
                  <span>{t.name}</span>
                </label>
                {t.done_on ? (
                  <span className="rowwrap">
                    <input className="inp" type="date" aria-label={`Date completed for ${t.name}`} value={t.done_on} onChange={(e) => setTaskDate(t, 'done_on', e.target.value)} />
                    <span className="meta">{nameOf(t.done_by)}</span>
                  </span>
                ) : (
                  <span className="rowwrap">
                    <span className="meta">Due</span>
                    <input className="inp" type="date" aria-label={`Due date for ${t.name}`} value={t.due_date ?? ''} onChange={(e) => setTaskDate(t, 'due_date', e.target.value)} />
                    {t.due_date && t.due_date < today && <span className="pill">Overdue</span>}
                    <button className="linkbtn noprint" onClick={() => removeTask(t)}>Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="noprint form">
            {tasksLeft.length > 0 && (
              <fieldset className="pick">
                <legend className="label">Choose from your task list</legend>
                {tasksLeft.map((n) => (
                  <label key={n}>
                    <input type="checkbox" checked={picked.includes(n)} onChange={(e) => setPicked(e.target.checked ? [...picked, n] : picked.filter((x) => x !== n))} />
                    <span>{n}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="field">
              <label className="label" htmlFor="taskText">One-off tasks for this job</label>
              <textarea id="taskText" value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="One task per line. Paste a whole list to add them all at once." />
            </div>
            <div className="actions"><button className="btn small" onClick={addTasks}>Add to this job</button></div>
          </div>
        </section>
      )}

      <section className="sec">
        <h2>Notes</h2>
        <div className="note">{job.notes || 'No notes yet.'}</div>
      </section>

      <section className="sec">
        <h2>Sample photos</h2>
        {photos.length === 0 && <p className="meta">None added yet.</p>}
        <div className="photos">
          {photos.map((p) => (
            <figure className="photo" key={p.id}>
              {urls[p.storage_path] && <img src={urls[p.storage_path]} alt={p.caption} />}
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {office && (
        <div className="sign printonly">
          <span>Packed by</span><span>Date</span><span>Checked by</span>
        </div>
      )}
    </article>
  )
}
