create extension if not exists pgcrypto;

create table todos (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  completed_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index todos_active_idx on todos (created_at desc) where deleted_at is null;
