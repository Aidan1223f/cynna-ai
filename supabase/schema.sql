-- love-send schema. Run in Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists vector;

create table if not exists couples (
  id text primary key,
  partner_a text not null,
  partner_b text not null,
  -- Photon iMessage Space identifier (the chat guid). Set once both partners
  -- complete pairing and the worker creates the group; nullable while pending.
  photon_space_id text unique,
  created_at timestamptz default now()
);

-- Pending pairings: created when the onboarding form is submitted, consumed
-- when both partners text their PAIR-XXXX code to the bot. The worker
-- promotes a complete pairing into a couples row + iMessage group.
create table if not exists pairings (
  code text primary key,
  partner_a text not null,
  partner_b text not null,
  partner_a_confirmed_at timestamptz,
  partner_b_confirmed_at timestamptz,
  couple_id text references couples(id) on delete set null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists pairings_partner_a_idx on pairings (partner_a) where partner_a_confirmed_at is null;
create index if not exists pairings_partner_b_idx on pairings (partner_b) where partner_b_confirmed_at is null;

create table if not exists saves (
  id uuid primary key default gen_random_uuid(),
  couple_id text not null references couples(id) on delete cascade,
  -- Photon iMessage message id (was linq_message_id). Unique to dedupe replays.
  photon_message_id text unique,
  sender_handle text not null,
  kind text not null check (kind in ('text','link','image','voice')),
  raw_text text,
  source_url text,
  media_url text,
  transcript text,
  og_title text,
  og_description text,
  og_image text,
  embedding vector(1536),
  seen_by_partner boolean default false,
  subject_id uuid,
  created_at timestamptz default now()
);

create index if not exists saves_couple_created_idx on saves (couple_id, created_at desc);
create index if not exists saves_embedding_idx on saves using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists triggers (
  id uuid primary key default gen_random_uuid(),
  couple_id text not null references couples(id) on delete cascade,
  kind text not null,
  fire_at timestamptz not null,
  payload jsonb not null default '{}',
  fired_at timestamptz
);
create index if not exists triggers_due_idx on triggers (fire_at) where fired_at is null;

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  couple_id text not null references couples(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- RPC: vector similarity search scoped to one couple.
create or replace function match_saves(
  p_couple_id text,
  p_query vector(1536),
  p_limit int default 20
) returns table (
  id uuid,
  couple_id text,
  sender_handle text,
  kind text,
  raw_text text,
  source_url text,
  media_url text,
  transcript text,
  og_title text,
  og_description text,
  og_image text,
  created_at timestamptz,
  similarity float
)
language sql stable as $$
  select
    s.id, s.couple_id, s.sender_handle, s.kind, s.raw_text, s.source_url,
    s.media_url, s.transcript, s.og_title, s.og_description, s.og_image, s.created_at,
    1 - (s.embedding <=> p_query) as similarity
  from saves s
  where s.couple_id = p_couple_id
    and s.embedding is not null
  order by s.embedding <=> p_query
  limit p_limit;
$$;
