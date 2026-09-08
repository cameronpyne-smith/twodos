alter table users add column colour text not null default 'amber';

with ordered as (
  select id, row_number() over (order by created_at) - 1 as n from users
)
update users u
set colour = (
  array['amber','teal','indigo','rose','olive','plum','slate','rust','pink','ice']
)[(o.n % 10) + 1]
from ordered o
where o.id = u.id;
