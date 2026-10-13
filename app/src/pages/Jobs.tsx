import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateParts, fmtTime, todayISO } from '../lib/types'
import type { Job, Reply } from '../lib/types'

type JobRow = Pick<Job, 'id' | 'title' | 'shoot_type' | 'shoot_date' | 'start_time' | 'end_time' | 'address' | 'needs_details' | 'pending_changes'>

interface Extra {
  replies: { job_id: string; person_id: string; status: Reply }[]
  tasks: { job_id: string; due_date: string | null; done_on: string | null }[]
  unseenJobs: string[]
}

export default function Jobs() {
  const { person } = useAuth()
  const office = person?.role === 'office'
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [extra, setExtra] = useState<Extra>({ replies: [], tasks: [], unseenJobs: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      // The database only returns jobs, replies and tasks this person is allowed to see.
      const [jobRes, replyRes, taskRes, updRes, recRes] = await Promise.all([
        supabase.from('jobs').select('id,title,shoot_type,shoot_date,start_time,end_time,address,needs_details,pending_changes').order('shoot_date').order('start_time'),
        supabase.from('job_assignments').select('job_id,person_id,status'),
        office ? supabase.from('job_tasks').select('job_id,due_date,done_on') : Promise.resolve({ data: [] }),
        office ? Promise.resolve({ data: [] }) : supabase.from('updates').select('id,job_id'),
        office || !person ? Promise.resolve({ data: [] }) : supabase.from('update_receipts').select('update_id').eq('person_id', person.id),
      ])
      if (cancelled) return
      if (jobRes.error) {
        setError('Could not load jobs. Check your connection and reload the page.')
        return
      }
      const seen = (recRes.data ?? []).map((r) => r.update_id as string)
      setJobs(jobRes.data as JobRow[])
      setExtra({
        replies: (replyRes.data ?? []) as Extra['replies'],
        tasks: (taskRes.data ?? []) as Extra['tasks'],
        unseenJobs: (updRes.data ?? []).filter((u) => !seen.includes(u.id as string)).map((u) => u.job_id as string),
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [office, person])

  if (error) return <p className="empty" role="alert">{error}</p>
  if (!jobs) return <p className="empty">Loading jobs…</p>
  if (!jobs.length)
    return (
      <p className="empty">
        {office
          ? 'No jobs yet. Use New job to add the first one.'
          : 'No jobs assigned yet. New jobs appear here as soon as the studio adds you to one.'}
      </p>
    )

  const today = todayISO()
  const declinedJobs = office ? jobs.filter((j) => extra.replies.some((r) => r.job_id === j.id && r.status === 'declined')).length : 0

  return (
    <div className="list">
      {declinedJobs > 0 && (
        <section className="alert">
          <strong>{declinedJobs} {declinedJobs > 1 ? 'jobs need' : 'job needs'} a replacement</strong>
          <span>Open the job to see who declined and reassign it.</span>
        </section>
      )}
      {jobs.map((j) => {
        const d = dateParts(j.shoot_date)
        const replies = extra.replies.filter((r) => r.job_id === j.id)
        const mine = replies.find((r) => r.person_id === person?.id)?.status
        const tasks = extra.tasks.filter((t) => t.job_id === j.id)
        const overdue = tasks.filter((t) => !t.done_on && t.due_date && t.due_date < today).length
        const declined = replies.filter((r) => r.status === 'declined').length
        const waiting = replies.filter((r) => r.status === 'pending').length
        return (
          <Link className="job" to={`/jobs/${j.id}`} key={j.id}>
            <span className="dateblock">
              <span className="dow">{d.dow}</span>
              <span className="day">{d.day}</span>
              <span className="mon">{d.mon}</span>
            </span>
            <span className="jobmain">
              <span className="rowwrap">
                <h3>{j.title}</h3>
                {office && j.needs_details && <span className="pill">Details needed</span>}
                {office && j.pending_changes.length > 0 && <span className="pill">Unsent changes</span>}
                {office && tasks.length > 0 && <span className="pill quiet">{tasks.filter((t) => t.done_on).length} of {tasks.length} tasks</span>}
                {office && overdue > 0 && <span className="pill">{overdue} overdue</span>}
                {office && declined > 0 && <span className="pill">{declined} declined</span>}
                {office && waiting > 0 && <span className="pill quiet">{waiting} awaiting reply</span>}
                {!office && extra.unseenJobs.includes(j.id) && <span className="pill">Updated</span>}
                {!office && mine === 'pending' && <span className="pill">Reply needed</span>}
                {!office && mine === 'declined' && <span className="pill quiet">You declined</span>}
              </span>
              <span className="time">{fmtTime(j.start_time)} to {fmtTime(j.end_time)}</span>
              <span className="meta">{[j.shoot_type, j.address].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
