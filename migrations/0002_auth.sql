create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

create table password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_resets_token_idx on password_resets (token_hash);

create table login_attempts (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  ip           text not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_lookup_idx on login_attempts (email, ip, attempted_at desc);
