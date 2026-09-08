alter table todos
  add column notes        text,
  add column assignee_id  uuid references users (id) on delete set null,
  add column due_date     date,
  add column created_by   uuid references users (id) on delete set null,
  add column completed_by uuid references users (id) on delete set null;

create index todos_due_idx on todos (list_id, due_date)
  where deleted_at is null and completed_at is null;

create index todos_assignee_idx on todos (assignee_id)
  where deleted_at is null and completed_at is null;
