import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Person } from '../lib/types'

const blank = {
  title: '', client: '', shoot_type: '', shoot_date: '', start_time: '09:00', end_time: '12:00',
  address: '', setup: '', access: '', contact_name: '', contact_role: '', contact_phone: '', notes: '',
}
type Fields = typeof blank

// Supabase results carry their own error; turn it into a thrown one so save() can stop.
function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error
  return res
}

export default function JobForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [f, setF] = useState<Fields>(blank)
  const [equipment, setEquipment] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [crew, setCrew] = useState<string[]>([])
  const [lead, setLead] = useState('')
  const [assistants, setAssistants] = useState(['', ''])
  const [existing, setExisting] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const peopleRes = await supabase
        .from('people')
        .select('id,email,name,initials,role,active')
        .neq('role', 'office')
        .order('name')
      const all = (peopleRes.data ?? []) as Person[]
      if (cancelled) return
      setPeople(all)
      if (id) {
        const [jobRes, eqRes, asgRes] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
          supabase.from('job_equipment').select('name').eq('job_id', id).order('position'),
          supabase.from('job_assignments').select('person_id').eq('job_id', id),
        ])
        if (cancelled || !jobRes.data) return
        const j = jobRes.data
        const next = { ...blank }
        for (const k of Object.keys(blank) as (keyof Fields)[]) next[k] = String(j[k] ?? '')
        next.start_time = next.start_time.slice(0, 5)
        next.end_time = next.end_time.slice(0, 5)
        setF(next)
        setEquipment((eqRes.data ?? []).map((e) => e.name as string).join('\n'))
        const assigned = (asgRes.data ?? []).map((a) => a.person_id as string)
        setExisting(assigned)
        const roleOf = (pid: string) => all.find((p) => p.id === pid)?.role
        setCrew(assigned.filter((p) => roleOf(p) === 'photographer'))
        const a = assigned.filter((p) => roleOf(p) === 'assistant')
        setAssistants([a[0] ?? '', a[1] ?? ''])
        setLead((j.lead_id as string | null) ?? '')
      }
      setReady(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  // Someone whose access was removed stays selectable only on jobs they are already on.
  const pick = (role: Person['role']) => people.filter((p) => p.role === role && (p.active || existing.includes(p.id)))

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.title.trim() || !f.shoot_date || !f.start_time || !f.end_time) {
      setError('Add a job name, date, call time and wrap time before saving.')
      return
    }
    setBusy(true)
    try {
      const wanted = new Set(crew)
      if (lead) wanted.add(lead)
      assistants.forEach((a) => a && wanted.add(a))
      const row = { ...f, title: f.title.trim(), lead_id: lead || null, needs_details: false }

      let jobId = id
      if (id) {
        check(await supabase.from('jobs').update(row).eq('id', id))
      } else {
        const res = check(await supabase.from('jobs').insert(row).select('id').single())
        jobId = res.data!.id as string
      }

      check(await supabase.from('job_equipment').delete().eq('job_id', jobId))
      const items = equipment.split('\n').map((s) => s.trim()).filter(Boolean)
      if (items.length)
        check(await supabase.from('job_equipment').insert(items.map((name, position) => ({ job_id: jobId, name, position }))))

      // Leave existing assignments alone so nobody's accept or decline is reset.
      const remove = existing.filter((p) => !wanted.has(p))
      if (remove.length)
        check(await supabase.from('job_assignments').delete().eq('job_id', jobId).in('person_id', remove))
      const add = [...wanted].filter((p) => !existing.includes(p))
      if (add.length)
        check(await supabase.from('job_assignments').insert(add.map((person_id) => ({ job_id: jobId, person_id }))))

      navigate(`/jobs/${jobId}`)
    } catch {
      setError('The job was not fully saved. Check your connection and save again.')
      setBusy(false)
    }
  }

  if (!ready) return <p className="empty">Loading…</p>

  const text = (k: keyof Fields, label: string, type = 'text') => (
    <div className="field">
      <label className="label" htmlFor={k}>{label}</label>
      <input id={k} type={type} value={f[k]} onChange={set(k)} />
    </div>
  )
  const area = (k: keyof Fields, label: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>{label}</label>
      <textarea id={k} value={f[k]} onChange={set(k)} />
    </div>
  )

  return (
    <form className="form" onSubmit={save} noValidate>
      <div><Link to={id ? `/jobs/${id}` : '/'}>← Cancel</Link></div>
      <h1>{id ? 'Edit job' : 'New job'}</h1>
      {text('title', 'Job name')}
      <div className="grid2">{text('client', 'Client')}{text('shoot_type', 'Type of shoot')}</div>
      <div className="grid2">
        {text('shoot_date', 'Date', 'date')}
        {text('start_time', 'Call time', 'time')}
        {text('end_time', 'Wrap', 'time')}
      </div>
      {text('address', 'Address')}
      {area('setup', 'Where to set up')}
      {area('access', 'Parking and load-in')}
      <div className="grid2">
        {text('contact_name', 'Contact name')}
        {text('contact_role', 'Contact role')}
        {text('contact_phone', 'Contact phone', 'tel')}
      </div>
      <div className="field">
        <label className="label" htmlFor="equipment">Equipment</label>
        <textarea id="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        <span className="hint">One item per line.</span>
      </div>

      <fieldset>
        <legend className="label">Photographers</legend>
        {pick('photographer').length === 0 && <span className="hint">No photographers yet. Add them on the Team screen.</span>}
        {pick('photographer').map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={crew.includes(p.id)}
              onChange={(e) => setCrew(e.target.checked ? [...crew, p.id] : crew.filter((c) => c !== p.id))}
            />{' '}
            {p.name}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="lead">Lead photographer</label>
        <select id="lead" value={lead} onChange={(e) => setLead(e.target.value)}>
          <option value="">No lead</option>
          {pick('photographer').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid2">
        {assistants.map((val, i) => (
          <div className="field" key={i}>
            <label className="label" htmlFor={`asst${i}`}>{i === 0 ? 'Assistant' : 'Second assistant'}</label>
            <select
              id={`asst${i}`}
              value={val}
              onChange={(e) => setAssistants(assistants.map((a, n) => (n === i ? e.target.value : a)))}
            >
              <option value="">None</option>
              {pick('assistant').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ))}
      </div>

      {area('notes', 'Notes')}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save job'}</button>
        <Link className="btn ghost" to={id ? `/jobs/${id}` : '/'}>Cancel</Link>
      </div>
    </form>
  )
}
