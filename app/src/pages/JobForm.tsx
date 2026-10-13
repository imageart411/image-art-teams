import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { check, findConflicts, sendUpdate, signedUrls } from '../lib/data'
import type { Conflict } from '../lib/data'
import { addDays, fmtDate, fmtTime, lines, unique } from '../lib/types'
import type { Person, Photo } from '../lib/types'

const blank = {
  title: '', client: '', shoot_type: '', shoot_date: '', start_time: '09:00', end_time: '12:00',
  address: '', setup: '', access: '', contact_name: '', contact_role: '', contact_phone: '', notes: '',
}
type Fields = typeof blank

interface Kit {
  name: string
  items: string[]
}
interface NewPhoto {
  file: File
  caption: string
  preview: string
}
interface Original {
  f: Fields
  equipment: string[]
  assigned: string[]
  lead: string
  photos: number
  pending: string[]
}

export default function JobForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const from = id ? null : params.get('from')
  const navigate = useNavigate()
  const { person: me } = useAuth()

  const [f, setF] = useState<Fields>(blank)
  const [equipment, setEquipment] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [crew, setCrew] = useState<string[]>([])
  const [lead, setLead] = useState('')
  const [assistants, setAssistants] = useState(['', ''])
  const [orig, setOrig] = useState<Original | null>(null)
  const [copiedFrom, setCopiedFrom] = useState('')

  const [equipCatalog, setEquipCatalog] = useState<string[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [kitIndex, setKitIndex] = useState(0)
  const [equipPicked, setEquipPicked] = useState<string[]>([])

  const [taskCatalog, setTaskCatalog] = useState<string[]>([])
  const [taskNames, setTaskNames] = useState<string[]>([])
  const [carryTasks, setCarryTasks] = useState<string[]>([])
  const [taskPicked, setTaskPicked] = useState<string[]>([])
  const [taskText, setTaskText] = useState('')

  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [removedPhotos, setRemovedPhotos] = useState<Photo[]>([])
  const [carryPhotos, setCarryPhotos] = useState<Photo[]>([])
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([])

  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [peopleRes, eqCatRes, kitRes, kitItemRes, taskCatRes] = await Promise.all([
        supabase.from('people').select('id,email,name,initials,role,active').neq('role', 'office').order('name'),
        supabase.from('equipment_catalog').select('name').order('name'),
        supabase.from('kits').select('id,name').order('name'),
        supabase.from('kit_items').select('kit_id,name').order('position'),
        supabase.from('task_catalog').select('name').order('name'),
      ])
      if (cancelled) return
      const all = (peopleRes.data ?? []) as Person[]
      setPeople(all)
      setEquipCatalog((eqCatRes.data ?? []).map((r) => r.name as string))
      setKits(
        (kitRes.data ?? []).map((k) => ({
          name: k.name as string,
          items: (kitItemRes.data ?? []).filter((i) => i.kit_id === k.id).map((i) => i.name as string),
        })),
      )
      setTaskCatalog((taskCatRes.data ?? []).map((r) => r.name as string))

      const sourceId = id ?? from
      if (sourceId) {
        const [jobRes, eqRes, asgRes, taskRes, photoRes] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', sourceId).maybeSingle(),
          supabase.from('job_equipment').select('name').eq('job_id', sourceId).order('position'),
          supabase.from('job_assignments').select('person_id').eq('job_id', sourceId),
          supabase.from('job_tasks').select('name').eq('job_id', sourceId).order('position'),
          supabase.from('job_photos').select('id,storage_path,caption').eq('job_id', sourceId).order('position'),
        ])
        if (cancelled || !jobRes.data) return
        const j = jobRes.data
        const next = { ...blank }
        for (const k of Object.keys(blank) as (keyof Fields)[]) next[k] = String(j[k] ?? '')
        next.start_time = next.start_time.slice(0, 5)
        next.end_time = next.end_time.slice(0, 5)
        const eq = (eqRes.data ?? []).map((e) => e.name as string)
        const assigned = (asgRes.data ?? []).map((a) => a.person_id as string)
        const tasks = (taskRes.data ?? []).map((t) => t.name as string)
        const pics = (photoRes.data ?? []) as Photo[]
        const roleOf = (pid: string) => all.find((p) => p.id === pid)?.role
        const a = assigned.filter((p) => roleOf(p) === 'assistant')
        setCrew(assigned.filter((p) => roleOf(p) === 'photographer'))
        setAssistants([a[0] ?? '', a[1] ?? ''])
        setLead((j.lead_id as string | null) ?? '')
        setEquipment(eq.join('\n'))
        const urls = await signedUrls(pics.map((p) => p.storage_path))
        if (cancelled) return
        setPhotoUrls(urls)
        if (id) {
          setF(next)
          setTaskNames(tasks)
          setPhotos(pics)
          setOrig({ f: next, equipment: eq, assigned, lead: (j.lead_id as string | null) ?? '', photos: pics.length, pending: (j.pending_changes as string[]) ?? [] })
        } else {
          // Duplicating: everything carries over except the date, and tasks start unticked.
          setCopiedFrom(next.title)
          setF({ ...next, title: `${next.title} (copy)`, shoot_date: '' })
          setCarryTasks(tasks)
          setCarryPhotos(pics)
        }
      }
      setReady(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, from])

  const wantedIds = unique([...crew, lead, ...assistants].filter(Boolean))
  const wantedKey = wantedIds.join(',')
  useEffect(() => {
    let cancelled = false
    findConflicts(wantedKey ? wantedKey.split(',') : [], {
      id,
      shoot_date: f.shoot_date,
      start_time: f.start_time,
      end_time: f.end_time,
    }).then((c) => {
      if (!cancelled) setConflicts(c)
    })
    return () => {
      cancelled = true
    }
  }, [wantedKey, id, f.shoot_date, f.start_time, f.end_time])

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const nameOf = (pid: string) => people.find((p) => p.id === pid)?.name ?? 'Someone'
  // Someone whose access was removed stays selectable only on jobs they are already on.
  const pick = (role: Person['role']) =>
    people.filter((p) => p.role === role && (p.active || orig?.assigned.includes(p.id)))

  function appendEquipment(items: string[]) {
    const cur = lines(equipment)
    for (const n of items) {
      if (!cur.some((c) => c.toLowerCase() === n.toLowerCase())) cur.push(n)
    }
    setEquipment(cur.join('\n'))
  }

  function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setNewPhotos([
      ...newPhotos,
      ...files.map((file) => ({ file, caption: file.name.replace(/\.[^.]+$/, ''), preview: URL.createObjectURL(file) })),
    ])
    e.target.value = ''
  }

  function describeChanges(items: string[]): string[] {
    if (!orig) return ['New job assigned to you']
    const c: string[] = []
    const t = (label: string, a: string, b: string) => {
      if (a !== b) c.push(`${label}: ${a || 'none'} → ${b || 'none'}`)
    }
    t('Job name', orig.f.title, f.title.trim())
    t('Date', fmtDate(orig.f.shoot_date), fmtDate(f.shoot_date))
    t('Call time', fmtTime(orig.f.start_time), fmtTime(f.start_time))
    t('Wrap', fmtTime(orig.f.end_time), fmtTime(f.end_time))
    t('Address', orig.f.address, f.address)
    if (orig.f.setup !== f.setup) c.push('Set-up location changed')
    if (orig.f.access !== f.access) c.push('Parking and load-in changed')
    t('Contact', orig.f.contact_name, f.contact_name)
    t('Contact phone', orig.f.contact_phone, f.contact_phone)
    for (const e of items) if (!orig.equipment.includes(e)) c.push(`Equipment added: ${e}`)
    for (const e of orig.equipment) if (!items.includes(e)) c.push(`Equipment removed: ${e}`)
    for (const p of wantedIds) if (!orig.assigned.includes(p)) c.push(`${nameOf(p)} added to the job`)
    for (const p of orig.assigned) if (!wantedIds.includes(p)) c.push(`${nameOf(p)} removed from the job`)
    if (orig.lead !== lead && lead) c.push(`Lead photographer: ${nameOf(lead)}`)
    if (orig.f.notes !== f.notes) c.push('Notes changed')
    const photoCount = photos.length + newPhotos.length
    if (photoCount > orig.photos) c.push(`${photoCount - orig.photos} sample photo(s) added`)
    if (photoCount < orig.photos) c.push(`${orig.photos - photoCount} sample photo(s) removed`)
    return c
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const notify = submitter?.value === 'notify'
    setError('')
    if (!f.title.trim() || !f.shoot_date || !f.start_time || !f.end_time) {
      setError('Add a job name, date, call time and wrap time before saving.')
      return
    }
    setBusy(true)
    try {
      const items = lines(equipment)
      const changes = unique([...(orig?.pending ?? []), ...describeChanges(items)])
      const sendNow = notify && changes.length > 0 && wantedIds.length > 0
      const row = {
        ...f,
        title: f.title.trim(),
        lead_id: lead || null,
        needs_details: false,
        pending_changes: sendNow ? [] : changes,
        updated_at: new Date().toISOString(),
      }

      let jobId = id ?? ''
      if (id) {
        check(await supabase.from('jobs').update(row).eq('id', id))
      } else {
        const res = check(await supabase.from('jobs').insert(row).select('id').single())
        jobId = res.data!.id as string
      }

      check(await supabase.from('job_equipment').delete().eq('job_id', jobId))
      if (items.length)
        check(await supabase.from('job_equipment').insert(items.map((name, position) => ({ job_id: jobId, name, position }))))

      // Leave existing assignments alone so nobody's accept or decline is reset.
      const had = orig?.assigned ?? []
      const remove = had.filter((p) => !wantedIds.includes(p))
      if (remove.length)
        check(await supabase.from('job_assignments').delete().eq('job_id', jobId).in('person_id', remove))
      const add = wantedIds.filter((p) => !had.includes(p))
      if (add.length)
        check(await supabase.from('job_assignments').insert(add.map((person_id) => ({ job_id: jobId, person_id }))))

      const have = taskNames.map((n) => n.toLowerCase())
      const newTasks = unique([...carryTasks, ...taskPicked, ...lines(taskText)]).filter((n) => !have.includes(n.toLowerCase()))
      if (newTasks.length)
        check(
          await supabase.from('job_tasks').insert(
            newTasks.map((name, i) => ({ job_id: jobId, name, due_date: addDays(f.shoot_date, 14), position: taskNames.length + i })),
          ),
        )

      for (const p of removedPhotos) {
        await supabase.storage.from('samples').remove([p.storage_path])
        check(await supabase.from('job_photos').delete().eq('id', p.id))
      }
      for (const p of photos) {
        check(await supabase.from('job_photos').update({ caption: p.caption }).eq('id', p.id))
      }
      let position = photos.length
      for (const p of carryPhotos) {
        const path = `${jobId}/${crypto.randomUUID()}-${p.storage_path.split('/').pop()}`
        const copied = await supabase.storage.from('samples').copy(p.storage_path, path)
        if (!copied.error)
          check(await supabase.from('job_photos').insert({ job_id: jobId, storage_path: path, caption: p.caption, position: position++ }))
      }
      for (const p of newPhotos) {
        const safe = p.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
        const path = `${jobId}/${crypto.randomUUID()}-${safe}`
        check(await supabase.storage.from('samples').upload(path, p.file))
        check(await supabase.from('job_photos').insert({ job_id: jobId, storage_path: path, caption: p.caption, position: position++ }))
      }

      if (sendNow) await sendUpdate(jobId, changes, me?.id)
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
  const toggle = (list: string[], setList: (v: string[]) => void, v: string, on: boolean) =>
    setList(on ? [...list, v] : list.filter((x) => x !== v))
  const onJob = [...taskNames, ...carryTasks].map((n) => n.toLowerCase())
  const tasksLeft = taskCatalog.filter((n) => !onJob.includes(n.toLowerCase()))

  return (
    <form className="form" onSubmit={save} noValidate>
      <div><Link to={id ? `/jobs/${id}` : '/'}>← Cancel</Link></div>
      <h1>{id ? 'Edit job' : 'New job'}</h1>
      {copiedFrom && <p className="hint">Copied from {copiedFrom}. Set the new date, then change anything that differs.</p>}
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
      {(equipCatalog.length > 0 || kits.length > 0) && (
        <details className="pickbox">
          <summary>Pick from your equipment list</summary>
          {kits.length > 0 && (
            <div className="rowwrap">
              <select aria-label="Kit" value={kitIndex} onChange={(e) => setKitIndex(Number(e.target.value))}>
                {kits.map((k, i) => <option key={k.name} value={i}>{k.name}</option>)}
              </select>
              <button type="button" className="btn ghost small" onClick={() => appendEquipment(kits[kitIndex]?.items ?? [])}>Add kit</button>
            </div>
          )}
          {equipCatalog.length > 0 && (
            <>
              <fieldset className="pick">
                <legend className="label">Single items</legend>
                {equipCatalog.map((n) => (
                  <label key={n}>
                    <input type="checkbox" checked={equipPicked.includes(n)} onChange={(e) => toggle(equipPicked, setEquipPicked, n, e.target.checked)} />
                    <span>{n}</span>
                  </label>
                ))}
              </fieldset>
              <div>
                <button type="button" className="btn ghost small" onClick={() => { appendEquipment(equipPicked); setEquipPicked([]) }}>Add ticked items</button>
              </div>
            </>
          )}
        </details>
      )}

      <fieldset>
        <legend className="label">Photographers</legend>
        {pick('photographer').length === 0 && <span className="hint">No photographers yet. Add them on the Team screen.</span>}
        {pick('photographer').map((p) => (
          <label key={p.id}>
            <input type="checkbox" checked={crew.includes(p.id)} onChange={(e) => toggle(crew, setCrew, p.id, e.target.checked)} />{' '}
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
            <select id={`asst${i}`} value={val} onChange={(e) => setAssistants(assistants.map((a, n) => (n === i ? e.target.value : a)))}>
              <option value="">None</option>
              {pick('assistant').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      {conflicts.length > 0 && (
        <section className="alert">
          <strong>Scheduling conflict</strong>
          <ul className="plain">
            {conflicts.map((c, i) => <li key={i}><strong>{nameOf(c.person_id)}</strong> is {c.text}</li>)}
          </ul>
          <span>You can still save, but check with them first.</span>
        </section>
      )}

      {tasksLeft.length > 0 && (
        <fieldset className="pick">
          <legend className="label">Tasks from your task list</legend>
          {tasksLeft.map((n) => (
            <label key={n}>
              <input type="checkbox" checked={taskPicked.includes(n)} onChange={(e) => toggle(taskPicked, setTaskPicked, n, e.target.checked)} />
              <span>{n}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="field">
        <label className="label" htmlFor="taskText">One-off tasks for this job</label>
        <textarea id="taskText" value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="One task per line. Paste a whole list to add them all at once." />
        {onJob.length > 0 && <span className="hint">Already on this job: {[...taskNames, ...carryTasks].join(', ')}.</span>}
      </div>

      {area('notes', 'Notes')}

      <div className="field">
        <span className="label">Sample photos</span>
        <div className="photos">
          {photos.map((p) => (
            <figure className="photo" key={p.id}>
              {photoUrls[p.storage_path] && <img src={photoUrls[p.storage_path]} alt={p.caption} />}
              <input aria-label="Caption" value={p.caption} onChange={(e) => setPhotos(photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))} />
              <button type="button" className="linkbtn" onClick={() => { setPhotos(photos.filter((x) => x.id !== p.id)); setRemovedPhotos([...removedPhotos, p]) }}>Remove</button>
            </figure>
          ))}
          {carryPhotos.map((p) => (
            <figure className="photo" key={p.id}>
              {photoUrls[p.storage_path] && <img src={photoUrls[p.storage_path]} alt={p.caption} />}
              <figcaption>{p.caption}</figcaption>
              <button type="button" className="linkbtn" onClick={() => setCarryPhotos(carryPhotos.filter((x) => x.id !== p.id))}>Remove</button>
            </figure>
          ))}
          {newPhotos.map((p, i) => (
            <figure className="photo" key={p.preview}>
              <img src={p.preview} alt={p.caption} />
              <input aria-label="Caption" value={p.caption} onChange={(e) => setNewPhotos(newPhotos.map((x, n) => (n === i ? { ...x, caption: e.target.value } : x)))} />
              <button type="button" className="linkbtn" onClick={() => setNewPhotos(newPhotos.filter((_, n) => n !== i))}>Remove</button>
            </figure>
          ))}
        </div>
        <label className="btn ghost small filebtn" htmlFor="photoFiles">Add photos</label>
        <input id="photoFiles" type="file" accept="image/*" multiple hidden onChange={addFiles} />
      </div>

      {error && <p className="alert" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="submit" value="save" disabled={busy}>Save job</button>
        <button className="btn" type="submit" value="notify" disabled={busy}>Save and notify photographers and staff</button>
        <Link className="btn ghost" to={id ? `/jobs/${id}` : '/'}>Cancel</Link>
      </div>
      <p className="hint">Save job sends nothing. The changes are held until you notify from the job page or use Save and notify.</p>
    </form>
  )
}
