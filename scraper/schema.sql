-- Run this in your Supabase SQL editor to set up the tables

create table if not exists professors (
  id          serial primary key,
  culpa_id    integer unique,
  first_name  text not null,
  last_name   text not null,
  nugget      text default 'None',  -- 'Gold', 'Silver', or 'None'
  review_count integer default 0,
  culpa_url   text,
  updated_at  timestamptz default now()
);

create table if not exists reviews (
  id           serial primary key,
  professor_id integer references professors(id) on delete cascade,
  review_text  text,
  workload     text,
  review_date  date,
  created_at   timestamptz default now()
);

-- Index for fast name lookups from the extension
create index if not exists idx_professors_last_name  on professors (lower(last_name));
create index if not exists idx_professors_first_name on professors (lower(first_name));
