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
}

export interface CrewMember {
  person_id: string
  name: string
  role: Role
  status: Reply
  is_lead: boolean
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Dates arrive as YYYY-MM-DD; build them in local time so the day never shifts.
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
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
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function directionsUrl(address: string): string {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address)
}
