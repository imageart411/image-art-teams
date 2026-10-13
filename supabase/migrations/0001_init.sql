-- Image Art Teams: initial database schema.
-- Office staff manage everything. Photographers and assistants see only the
-- jobs they are assigned to, and never see tasks, catalogs or settings.

create extension if not exists citext;

create type person_role as enum ('office', 'photographer', 'assistant');
create type reply_status as enum ('pending', 'accepted', 'declined');

-- People -------------------------------------------------------------------
-- The office adds a row by email. The row links to a login the first time
-- that email signs in with Google.
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email citext not null unique,
  name text not null,
  initials text,
  phone text,
  role person_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create function link_person_to_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update people set user_id = new.id where email = new.email and user_id is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function link_person_to_login();

create function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where user_id = auth.uid() and active
$$;

create function is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where user_id = auth.uid() and active and role = 'office')
$$;

-- Jobs ---------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client text not null default '',
  shoot_type text not null default '',
  shoot_date date not null,
  start_time time not null,
  end_time time not null,
  address text not null default '',
  setup text not null default '',
  access text not null default '',
  contact_name text not null default '',
  contact_role text not null default '',
  contact_phone text not null default '',
  notes text not null default '',
  lead_id uuid references people (id) on delete set null,
  needs_details boolean not null default false,
  pending_changes text[] not null default '{}',
  google_event_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_shoot_date_idx on jobs (shoot_date);

create table job_assignments (
  job_id uuid not null references jobs (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  status reply_status not null default 'pending',
  decline_reason text,
  wants_job_id uuid references jobs (id) on delete set null,
  moved boolean not null default false,
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (job_id, person_id)
);
create index job_assignments_person_idx on job_assignments (person_id);

create function is_on_job(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from job_assignments
    where job_id = target and person_id = current_person_id()
  )
$$;

create table job_equipment (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  name text not null,
  position int not null default 0
);
create index job_equipment_job_idx on job_equipment (job_id);

create table job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  storage_path text not null,
  caption text not null default '',
  position int not null default 0
);
create index job_photos_job_idx on job_photos (job_id);

-- Office-only checklist of what is owed to the client.
create table job_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  name text not null,
  due_date date,
  done_on date,
  done_by uuid references people (id) on delete set null,
  position int not null default 0
);
create index job_tasks_job_idx on job_tasks (job_id);
create index job_tasks_open_idx on job_tasks (due_date) where done_on is null;

-- Master lists -------------------------------------------------------------
create table task_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table kits (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table kit_items (
  kit_id uuid not null references kits (id) on delete cascade,
  name text not null,
  position int not null default 0,
  primary key (kit_id, name)
);

-- Availability -------------------------------------------------------------
create table unavailability (
  person_id uuid not null references people (id) on delete cascade,
  day date not null,
  primary key (person_id, day)
);

-- Updates sent to the crew -------------------------------------------------
create table updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  changes text[] not null,
  sent_by uuid references people (id) on delete set null,
  sent_at timestamptz not null default now()
);
create index updates_job_idx on updates (job_id, sent_at desc);

create table update_receipts (
  update_id uuid not null references updates (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (update_id, person_id)
);

-- Reminder settings (single row) --------------------------------------------
create table settings (
  id boolean primary key default true check (id),
  remind_day_before boolean not null default true,
  remind_time time not null default '17:00',
  nudge_unanswered boolean not null default true,
  nudge_after_days int not null default 2
);
insert into settings default values;

-- Row level security ---------------------------------------------------------
alter table people enable row level security;
alter table jobs enable row level security;
alter table job_assignments enable row level security;
alter table job_equipment enable row level security;
alter table job_photos enable row level security;
alter table job_tasks enable row level security;
alter table task_catalog enable row level security;
alter table equipment_catalog enable row level security;
alter table kits enable row level security;
alter table kit_items enable row level security;
alter table unavailability enable row level security;
alter table updates enable row level security;
alter table update_receipts enable row level security;
alter table settings enable row level security;

-- Anyone on the team can see who is on the team; only the office edits it.
create policy people_read on people for select to authenticated
  using (current_person_id() is not null);
create policy people_office on people for all to authenticated
  using (is_office()) with check (is_office());

create policy jobs_read on jobs for select to authenticated
  using (is_office() or is_on_job(id));
create policy jobs_office on jobs for all to authenticated
  using (is_office()) with check (is_office());

-- Crew read only their own assignment rows here, so decline reasons stay
-- between that person and the office. job_crew() below lists teammates.
create policy assignments_read on job_assignments for select to authenticated
  using (is_office() or person_id = current_person_id());
create policy assignments_office on job_assignments for all to authenticated
  using (is_office()) with check (is_office());

create policy equipment_read on job_equipment for select to authenticated
  using (is_office() or is_on_job(job_id));
create policy equipment_office on job_equipment for all to authenticated
  using (is_office()) with check (is_office());

create policy photos_read on job_photos for select to authenticated
  using (is_office() or is_on_job(job_id));
create policy photos_office on job_photos for all to authenticated
  using (is_office()) with check (is_office());

create policy tasks_office on job_tasks for all to authenticated
  using (is_office()) with check (is_office());
create policy task_catalog_office on task_catalog for all to authenticated
  using (is_office()) with check (is_office());
create policy equipment_catalog_office on equipment_catalog for all to authenticated
  using (is_office()) with check (is_office());
create policy kits_office on kits for all to authenticated
  using (is_office()) with check (is_office());
create policy kit_items_office on kit_items for all to authenticated
  using (is_office()) with check (is_office());
create policy settings_office on settings for all to authenticated
  using (is_office()) with check (is_office());

create policy unavailability_read on unavailability for select to authenticated
  using (is_office() or person_id = current_person_id());
create policy unavailability_own on unavailability for all to authenticated
  using (person_id = current_person_id()) with check (person_id = current_person_id());

create policy updates_read on updates for select to authenticated
  using (is_office() or is_on_job(job_id));
create policy updates_office on updates for all to authenticated
  using (is_office()) with check (is_office());

create policy receipts_read on update_receipts for select to authenticated
  using (is_office() or person_id = current_person_id());
create policy receipts_own on update_receipts for insert to authenticated
  with check (person_id = current_person_id());

-- Crew actions ---------------------------------------------------------------
-- Teammates on a job, without anyone's decline reason.
create function job_crew(target uuid)
returns table (person_id uuid, name text, role person_role, status reply_status, is_lead boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, a.status, p.id = j.lead_id
  from job_assignments a
  join people p on p.id = a.person_id
  join jobs j on j.id = a.job_id
  where a.job_id = target and (is_office() or is_on_job(target))
$$;

-- Accept, decline, or decline and ask for another job.
create function respond_to_job(target uuid, reply reply_status, reason text default null, wants uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if reply = 'pending' then
    raise exception 'Reply must be accepted or declined';
  end if;
  update job_assignments
    set status = reply,
        decline_reason = case when reply = 'declined' then nullif(trim(reason), '') end,
        wants_job_id = case when reply = 'declined' then wants end,
        moved = false,
        responded_at = now()
    where job_id = target and person_id = current_person_id();
  if not found then
    raise exception 'You are not assigned to this job';
  end if;
end $$;

-- Upcoming jobs this person is not on, for "a job I could work instead".
create function jobs_i_could_take()
returns table (id uuid, title text, shoot_date date, start_time time, end_time time, address text)
language sql stable security definer set search_path = public as $$
  select j.id, j.title, j.shoot_date, j.start_time, j.end_time, j.address
  from jobs j
  where current_person_id() is not null
    and not j.needs_details
    and j.shoot_date >= current_date
    and not exists (
      select 1 from job_assignments a
      where a.job_id = j.id and a.person_id = current_person_id()
    )
  order by j.shoot_date, j.start_time
$$;

-- "Got it": mark every update on a job as seen by the current person.
create function mark_job_seen(target uuid) returns void
language sql security definer set search_path = public as $$
  insert into update_receipts (update_id, person_id)
  select u.id, current_person_id() from updates u
  where u.job_id = target and is_on_job(target)
  on conflict do nothing
$$;

revoke execute on function job_crew(uuid), respond_to_job(uuid, reply_status, text, uuid),
  jobs_i_could_take(), mark_job_seen(uuid) from public, anon;
grant execute on function job_crew(uuid), respond_to_job(uuid, reply_status, text, uuid),
  jobs_i_could_take(), mark_job_seen(uuid) to authenticated;

-- Sample photo storage ---------------------------------------------------------
-- Files are stored as <job id>/<file name> in a private bucket.
insert into storage.buckets (id, name, public) values ('samples', 'samples', false);

create policy samples_read on storage.objects for select to authenticated
  using (bucket_id = 'samples' and (is_office() or is_on_job(((storage.foldername(name))[1])::uuid)));
create policy samples_office_write on storage.objects for all to authenticated
  using (bucket_id = 'samples' and is_office())
  with check (bucket_id = 'samples' and is_office());
