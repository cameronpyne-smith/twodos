create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index api_keys_user_idx on api_keys (user_id, created_at desc);

create table best_commands (
  entry          uuid primary key default gen_random_uuid(),
  id             text not null,
  key_id         uuid not null references api_keys (id) on delete cascade,
  payload_hash   text,
  correlation_id text,
  status         int  not null,
  created_at     timestamptz not null default now()
);

create unique index best_commands_idempotency_idx
  on best_commands (key_id, id) where status = 201;

create index best_commands_correlation_idx
  on best_commands (correlation_id) where status = 201;

create index best_commands_rate_idx on best_commands (key_id, created_at);

alter table todos add column correlation_id text;

create index todos_correlation_idx on todos (correlation_id)
  where correlation_id is not null;
