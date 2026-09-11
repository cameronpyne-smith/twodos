alter table todos
  add column points        int not null default 1,
  add column scored_points int;

alter table todos add constraint todos_points_range check (points between 1 and 99);

update todos set scored_points = points where completed_at is not null;

create index todos_score_idx on todos (list_id, completed_by, completed_at)
  where deleted_at is null and completed_at is not null;
