-- =====================================================================
--  ISSB Green Academy — Secure Sheet System (Supabase setup)
--
--  Kaise chalana hai:
--   1. Supabase project kholein → SQL Editor → New query
--   2. Yeh poori file paste karein
--   3. Sab se neeche wali line mein 'APNA-PASSWORD-YAHAN' ki jagah
--      apna admin password likhein (kam az kam 8 characters)
--   4. RUN dabayein. "Success" aana chahiye.
--
--  File dobara chalana safe hai (data delete nahi hota).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

create table if not exists public.gs_buyers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  phone                  text not null unique,
  code                   text not null,
  status                 text not null default 'active' check (status in ('active', 'blocked')),
  device_id              text,
  device_fp              text,
  device_label           text,
  failed_attempts        int not null default 0,
  last_failed_at         timestamptz,
  other_device_attempts  int not null default 0,
  view_count             int not null default 0,
  first_login_at         timestamptz,
  last_seen_at           timestamptz,
  note                   text,
  created_at             timestamptz not null default now()
);

create table if not exists public.gs_sessions (
  token       text primary key,
  buyer_id    uuid not null references public.gs_buyers (id) on delete cascade,
  device_id   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists gs_sessions_buyer_idx on public.gs_sessions (buyer_id);

-- Sirf ek sheet (id = 1). Nayi upload purani ko replace kar deti hai.
create table if not exists public.gs_documents (
  id          int primary key default 1 check (id = 1),
  title       text not null,
  html        text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.gs_events (
  id            bigint generated always as identity primary key,
  buyer_id      uuid references public.gs_buyers (id) on delete cascade,
  kind          text not null,
  device_label  text,
  created_at    timestamptz not null default now()
);
create index if not exists gs_events_created_idx on public.gs_events (created_at desc);

create table if not exists public.gs_config (
  key    text primary key,
  value  text not null
);

-- RLS on + koi policy nahi = browser se seedha table koi nahi parh sakta.
-- Sab kaam neeche wale functions ke zariye hota hai.
alter table public.gs_buyers    enable row level security;
alter table public.gs_sessions  enable row level security;
alter table public.gs_documents enable row level security;
alter table public.gs_events    enable row level security;
alter table public.gs_config    enable row level security;

revoke all on table public.gs_buyers, public.gs_sessions, public.gs_documents,
                    public.gs_events, public.gs_config
  from anon, authenticated;

-- ---------------------------------------------------------------------
--  Helpers (browser se call nahi ho sakte)
-- ---------------------------------------------------------------------

-- 0300-1234567, +92 300 1234567, 923001234567 → 03001234567
create or replace function public.gs_normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^0092[0-9]{10}$' then '0' || substr(d, 5)
    when d ~ '^92[0-9]{10}$'   then '0' || substr(d, 3)
    when d ~ '^3[0-9]{9}$'     then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s
$$;

-- 6 characters, confusing letters (0/O, 1/I/L) nahi
create or replace function public.gs_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(6);
  result text := '';
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end
$$;

create or replace function public.gs_admin_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gs_config
    where key = 'admin_hash'
      and value = extensions.crypt(coalesce(p_key, ''), value)
  )
$$;

create or replace function public.gs_set_admin_password(p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 8 or p_password = 'APNA-PASSWORD-YAHAN' then
    raise exception 'Admin password kam az kam 8 characters ka rakhein, aur APNA-PASSWORD-YAHAN ki jagah apna password likhein';
  end if;
  insert into public.gs_config (key, value)
  values ('admin_hash', extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
  return 'Admin password set ho gaya';
end
$$;

-- ---------------------------------------------------------------------
--  Student: login (device lock yahin hota hai)
-- ---------------------------------------------------------------------

create or replace function public.gs_login(
  p_phone        text,
  p_code         text,
  p_device_id    text,
  p_device_fp    text,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.gs_buyers;
  v_token text;
begin
  if coalesce(length(p_device_id), 0) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select * into b from public.gs_buyers where phone = public.gs_normalize_phone(p_phone);
  if not found then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  if b.failed_attempts >= 10 and b.last_failed_at > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if upper(btrim(coalesce(p_code, ''))) <> b.code then
    update public.gs_buyers
      set failed_attempts = failed_attempts + 1, last_failed_at = now()
      where id = b.id;
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  if b.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  if b.device_id is null then
    -- Pehli dafa: sheet isi device se lock ho jati hai
    update public.gs_buyers
      set device_id = p_device_id, device_fp = p_device_fp, device_label = p_device_label,
          first_login_at = coalesce(first_login_at, now())
      where id = b.id;
    insert into public.gs_events (buyer_id, kind, device_label) values (b.id, 'first_login', p_device_label);

  elsif b.device_id = p_device_id then
    update public.gs_buyers
      set device_fp = p_device_fp, device_label = p_device_label
      where id = b.id;
    insert into public.gs_events (buyer_id, kind, device_label) values (b.id, 'login', p_device_label);

  elsif b.device_fp is not null and b.device_fp = p_device_fp
        and (b.last_seen_at is null or b.last_seen_at < now() - interval '3 days') then
    -- Wohi phone, lekin browser ka data saaf ho gaya tha (iPhone par aksar hota hai)
    update public.gs_buyers
      set device_id = p_device_id, device_label = p_device_label
      where id = b.id;
    insert into public.gs_events (buyer_id, kind, device_label) values (b.id, 'same_phone_relogin', p_device_label);

  else
    update public.gs_buyers
      set other_device_attempts = other_device_attempts + 1
      where id = b.id;
    insert into public.gs_events (buyer_id, kind, device_label) values (b.id, 'other_device_blocked', p_device_label);
    return jsonb_build_object('ok', false, 'error', 'other_device');
  end if;

  update public.gs_buyers set failed_attempts = 0, last_seen_at = now() where id = b.id;

  -- Ek waqt mein sirf ek session
  delete from public.gs_sessions where buyer_id = b.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.gs_sessions (token, buyer_id, device_id, expires_at)
  values (v_token, b.id, p_device_id, now() + interval '90 days');

  return jsonb_build_object('ok', true, 'token', v_token, 'name', b.name);
end
$$;

-- ---------------------------------------------------------------------
--  Student: sheet parhna
-- ---------------------------------------------------------------------

create or replace function public.gs_content(p_token text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.gs_sessions;
  b public.gs_buyers;
  d public.gs_documents;
begin
  select * into s from public.gs_sessions where token = coalesce(p_token, '');
  if not found or s.expires_at < now() or s.device_id <> coalesce(p_device_id, '') then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;

  select * into b from public.gs_buyers where id = s.buyer_id;
  if b.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  if b.device_id is distinct from s.device_id then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;

  select * into d from public.gs_documents where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_doc');
  end if;

  update public.gs_buyers set last_seen_at = now(), view_count = view_count + 1 where id = b.id;

  return jsonb_build_object(
    'ok', true,
    'title', d.title,
    'html', d.html,
    'updated_at', d.updated_at,
    'name', b.name,
    'phone', b.phone
  );
end
$$;

-- ---------------------------------------------------------------------
--  Admin panel (har call par admin password check hota hai)
-- ---------------------------------------------------------------------

create or replace function public.gs_admin(p_key text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text;
  v_name text;
  v_code text;
  v_row public.gs_buyers;
  v_result jsonb;
begin
  if not public.gs_admin_ok(p_key) then
    perform pg_sleep(1);
    return jsonb_build_object('ok', false, 'error', 'admin_auth');
  end if;

  p_data := coalesce(p_data, '{}'::jsonb);
  if p_data ? 'id' then
    v_id := (p_data ->> 'id')::uuid;
  end if;

  case p_action

  when 'ping' then
    return jsonb_build_object('ok', true);

  when 'list' then
    select jsonb_build_object(
      'ok', true,
      'buyers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'phone', phone, 'code', code, 'status', status,
          'device_label', device_label, 'device_bound', device_id is not null,
          'other_device_attempts', other_device_attempts, 'view_count', view_count,
          'first_login_at', first_login_at, 'last_seen_at', last_seen_at,
          'note', note, 'created_at', created_at
        ) order by created_at desc)
        from public.gs_buyers
      ), '[]'::jsonb),
      'doc', (
        select jsonb_build_object('title', title, 'updated_at', updated_at, 'size', length(html))
        from public.gs_documents where id = 1
      )
    ) into v_result;
    return v_result;

  when 'add' then
    v_name := btrim(coalesce(p_data ->> 'name', ''));
    v_phone := public.gs_normalize_phone(p_data ->> 'phone');
    if v_name = '' then
      return jsonb_build_object('ok', false, 'error', 'name_required');
    end if;
    if v_phone !~ '^03[0-9]{9}$' then
      return jsonb_build_object('ok', false, 'error', 'bad_phone');
    end if;
    if exists (select 1 from public.gs_buyers where phone = v_phone) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into public.gs_buyers (name, phone, code, note)
    values (v_name, v_phone, public.gs_new_code(), nullif(btrim(coalesce(p_data ->> 'note', '')), ''))
    returning * into v_row;
    insert into public.gs_events (buyer_id, kind) values (v_row.id, 'added');
    return jsonb_build_object('ok', true, 'buyer', jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'phone', v_row.phone, 'code', v_row.code));

  when 'reset_device' then
    update public.gs_buyers
      set device_id = null, device_fp = null, device_label = null
      where id = v_id;
    delete from public.gs_sessions where buyer_id = v_id;
    insert into public.gs_events (buyer_id, kind) values (v_id, 'device_reset');
    return jsonb_build_object('ok', true);

  when 'new_code' then
    v_code := public.gs_new_code();
    update public.gs_buyers
      set code = v_code, device_id = null, device_fp = null, device_label = null, failed_attempts = 0
      where id = v_id;
    delete from public.gs_sessions where buyer_id = v_id;
    insert into public.gs_events (buyer_id, kind) values (v_id, 'new_code');
    return jsonb_build_object('ok', true, 'code', v_code);

  when 'block' then
    -- Session rehne dete hain taake student ko "account band hai" ka message mile
    update public.gs_buyers set status = 'blocked' where id = v_id;
    insert into public.gs_events (buyer_id, kind) values (v_id, 'blocked');
    return jsonb_build_object('ok', true);

  when 'unblock' then
    update public.gs_buyers set status = 'active', failed_attempts = 0 where id = v_id;
    insert into public.gs_events (buyer_id, kind) values (v_id, 'unblocked');
    return jsonb_build_object('ok', true);

  when 'delete' then
    delete from public.gs_buyers where id = v_id;
    return jsonb_build_object('ok', true);

  when 'set_doc' then
    if coalesce(length(p_data ->> 'html'), 0) < 20 then
      return jsonb_build_object('ok', false, 'error', 'empty_doc');
    end if;
    insert into public.gs_documents (id, title, html, updated_at)
    values (1, coalesce(nullif(btrim(p_data ->> 'title'), ''), 'MCQs Sheet'), p_data ->> 'html', now())
    on conflict (id) do update
      set title = excluded.title, html = excluded.html, updated_at = now();
    return jsonb_build_object('ok', true);

  when 'events' then
    select jsonb_build_object('ok', true, 'events', coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb))
    into v_result
    from (
      select ev.kind, ev.device_label, ev.created_at, b.name, b.phone
      from public.gs_events ev
      left join public.gs_buyers b on b.id = ev.buyer_id
      order by ev.created_at desc
      limit 150
    ) e;
    return v_result;

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;
end
$$;

-- ---------------------------------------------------------------------
--  Permissions: browser sirf yeh 3 functions chala sakta hai
-- ---------------------------------------------------------------------

revoke execute on function public.gs_normalize_phone(text)          from public, anon, authenticated;
revoke execute on function public.gs_new_code()                     from public, anon, authenticated;
revoke execute on function public.gs_admin_ok(text)                 from public, anon, authenticated;
revoke execute on function public.gs_set_admin_password(text)       from public, anon, authenticated;
revoke execute on function public.gs_login(text, text, text, text, text) from public, authenticated;
revoke execute on function public.gs_content(text, text)            from public, authenticated;
revoke execute on function public.gs_admin(text, text, jsonb)       from public, authenticated;

grant execute on function public.gs_login(text, text, text, text, text) to anon;
grant execute on function public.gs_content(text, text)                to anon;
grant execute on function public.gs_admin(text, text, jsonb)           to anon;

-- ---------------------------------------------------------------------
--  ⬇⬇  APNA ADMIN PASSWORD YAHAN LIKHEIN  ⬇⬇
-- ---------------------------------------------------------------------
select public.gs_set_admin_password('APNA-PASSWORD-YAHAN');
