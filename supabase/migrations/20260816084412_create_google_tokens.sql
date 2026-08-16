create table google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table google_tokens enable row level security;

-- Deliberately no policies for anon/authenticated roles: this table is only
-- ever read or written by the google-token Edge Function via the
-- service-role client, which bypasses RLS. No client should ever be able to
-- read a raw Google refresh token.
