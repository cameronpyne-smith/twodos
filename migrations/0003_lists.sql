create table lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create table memberships (
  user_id   uuid not null references users (id) on delete cascade,
  list_id   uuid not null references lists (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, list_id)
);

create index memberships_list_idx on memberships (list_id);

create table invites (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references lists (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references users (id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references users (id),
  created_at timestamptz not null default now()
);

create index invites_token_idx on invites (token_hash);

alter table todos add column list_id uuid references lists (id) on delete cascade;

do $$
declare
  fallback_user uuid;
  fallback_list uuid;
begin
  if exists (select 1 from todos where list_id is null) then
    select id into fallback_user from users order by created_at limit 1;

    if fallback_user is null then
      delete from todos where list_id is null;
    else
      insert into lists (name, created_by) values ('Home', fallback_user)
        returning id into fallback_list;
      insert into memberships (user_id, list_id) values (fallback_user, fallback_list);
      update todos set list_id = fallback_list where list_id is null;
    end if;
  end if;
end $$;

alter table todos alter column list_id set not null;

drop index todos_active_idx;

create index todos_list_idx on todos (list_id, created_at desc) where deleted_at is null;
