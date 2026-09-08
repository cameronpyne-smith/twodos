alter table todos add column important boolean not null default false;

create index todos_important_idx on todos (list_id, important)
  where deleted_at is null and completed_at is null and important;
