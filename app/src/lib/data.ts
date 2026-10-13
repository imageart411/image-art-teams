import { supabase } from './supabase'
import { fmtDate, fmtTime } from './types'

// Supabase results carry their own error; turn it into a thrown one so callers can stop.
export function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error
  return res
}

// Sample photos live in a private bucket, so pages show them through short-lived links.
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!paths.length) return out
  const { data } = await supabase.storage.from('samples').createSignedUrls(paths, 3600)
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  }
  return out
}

export async function sendUpdate(jobId: string, changes: string[], senderId: string | undefined) {
  check(await supabase.from('updates').insert({ job_id: jobId, changes, sent_by: senderId ?? null }))
}

export interface Conflict {
  person_id: string
  text: string
}

interface Slot {
  id?: string
  shoot_date: string
  start_time: string
  end_time: string
}

// Who among `ids` is marked unavailable that day or already on an overlapping job.
export async function findConflicts(ids: string[], job: Slot): Promise<Conflict[]> {
  const out: Conflict[] = []
  if (!ids.length || !job.shoot_date) return out
  const [offRes, jobsRes] = await Promise.all([
    supabase.from('unavailability').select('person_id').eq('day', job.shoot_date).in('person_id', ids),
    supabase.from('jobs').select('id,title,start_time,end_time').eq('shoot_date', job.shoot_date),
  ])
  for (const r of offRes.data ?? []) {
    out.push({ person_id: r.person_id as string, text: `marked unavailable on ${fmtDate(job.shoot_date)}` })
  }
  const hm = (t: string) => t.slice(0, 5)
  const others = (jobsRes.data ?? []).filter(
    (o) => o.id !== job.id && hm(o.start_time) < hm(job.end_time) && hm(job.start_time) < hm(o.end_time),
  )
  if (others.length) {
    const { data } = await supabase
      .from('job_assignments')
      .select('job_id,person_id')
      .in('job_id', others.map((o) => o.id))
      .in('person_id', ids)
      .neq('status', 'declined')
    for (const a of data ?? []) {
      const o = others.find((x) => x.id === a.job_id)
      if (o) out.push({ person_id: a.person_id as string, text: `also on ${o.title}, ${fmtTime(o.start_time)} to ${fmtTime(o.end_time)}` })
    }
  }
  return out
}
