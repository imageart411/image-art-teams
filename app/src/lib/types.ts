export type Role = 'office' | 'photographer' | 'assistant'
export type Reply = 'pending' | 'accepted' | 'declined'

export interface Person {
  id: string
  email: string
  name: string
  initials: string | null
  role: Role
  active: boolean
}

export interface Job {
  id: string
  title: string
  client: string
  shoot_type: string
  shoot_date: string
  start_time: string
  end_time: string
  address: string
  setup: string
  access: string
  contact_name: string
  contact_role: string
  contact_phone: string
  notes: string
  lead_id: string | null
  needs_details: boolean
  pending_changes: string[]
}

export interface CrewMember {
  person_id: string
  name: string
  role: Role
  status: Reply
  is_lead: boolean
}

export interface Assignment {
  person_id: string
  status: Reply
  decline_reason: string | null
  wants_job_id: string | null
  moved: boolean
}

export interface Task {
  id: string
  job_id: string
  name: string
  due_date: string | null
  done_on: string | null
  done_by: string | null
  position: number
}

export interface Update {
  id: string
  job_id: string
  changes: string[]
  sent_at: string
}

export interface Photo {
  id: string
  storage_path: string
  caption: string
}

export const ROLE_LABEL: Record<Role, string> = { office: 'Office', photographer: 'Photographer', assistant: 'Assistant' }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

// Dates arrive as YYYY-MM-DD; build them in local time so the day never shifts.
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function dateParts(iso: string) {
  const d = parseDate(iso)
  return { dow: DOW[d.getDay()], day: d.getDate(), mon: MON[d.getMonth()] }
}

export function fmtDate(iso: string): string {
  const p = dateParts(iso)
  return `${p.dow}, ${p.mon} ${p.day}`
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

export function fmtStamp(iso: string): string {
  const d = new Date(iso)
  return `${MON[d.getMonth()]} ${d.getDate()}, ${fmtTime(`${d.getHours()}:${d.getMinutes()}`)}`
}

export function directionsUrl(address: string): string {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address)
}

export function calendarUrl(j: Job): string {
  const day = j.shoot_date.replace(/-/g, '')
  const t = (s: string) => s.slice(0, 5).replace(':', '') + '00'
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: j.title,
    dates: `${day}T${t(j.start_time)}/${day}T${t(j.end_time)}`,
    location: j.address,
    details: `Set up: ${j.setup}\nOn-site contact: ${j.contact_name} ${j.contact_phone}`,
  })
  return 'https://calendar.google.com/calendar/render?' + q.toString()
}

export function lines(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

export function unique(list: string[]): string[] {
  return list.filter((c, i) => list.indexOf(c) === i)
}
