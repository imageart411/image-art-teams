import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateParts, fmtTime } from '../lib/types'
import type { Job, Reply } from '../lib/types'

type JobRow = Pick<Job, 'id' | 'title' | 'shoot_type' | 'shoot_date' | 'start_time' | 'end_time' | 'address' | 'needs_details'>

export default function Jobs() {
  const { person } = useAuth()
  const office = person?.role === 'office'
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [replies, setReplies] = useState<Record<string, Reply>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      // The database only returns jobs this person is allowed to see.
      const { data, error: err } = await supabase
        .from('jobs')
        .select('id,title,shoot_type,shoot_date,start_time,end_time,address,needs_details')
        .order('shoot_date')
        .order('start_time')
      if (cancelled) return
      if (err) {
        setError('Could not load jobs. Check your connection and reload the page.')
        return
      }
      setJobs(data as JobRow[])
      if (!office && person) {
        const { data: mine } = await supabase
          .from('job_assignments')
          .select('job_id,status')
          .eq('person_id', person.id)
        if (cancelled || !mine) return
        setReplies(Object.fromEntries(mine.map((r) => [r.job_id as string, r.status as Reply])))
      }
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
          ? 'No jobs yet. Jobs you add will be listed here.'
          : 'No jobs assigned yet. New jobs appear here as soon as the studio adds you to one.'}
      </p>
    )

  return (
    <div className="list">
      {jobs.map((j) => {
        const d = dateParts(j.shoot_date)
        const reply = replies[j.id]
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
                {reply === 'pending' && <span className="pill">Reply needed</span>}
                {reply === 'declined' && <span className="pill quiet">You declined</span>}
              </span>
              <span className="time">
                {fmtTime(j.start_time)} to {fmtTime(j.end_time)}
              </span>
              <span className="meta">{[j.shoot_type, j.address].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
