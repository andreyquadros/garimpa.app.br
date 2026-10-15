-- PostGIS: colunas geography geradas a partir de lat/lng, com índice GiST.
create extension if not exists postgis;

alter table places
  add column geog geography(Point, 4326)
  generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) stored;
create index places_geog_idx on places using gist (geog);

alter table questions
  add column geog geography(Point, 4326)
  generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) stored;
create index questions_geog_idx on questions using gist (geog);

-- A view ganha p.geog; o resto é idêntico ao da 0001.
drop view v_place_finds;
create view v_place_finds as
select p.id as place_id, p.city_id, p.name, p.kind, p.lat, p.lng, p.address, p.partner_tier, p.geog,
       count(a.id)::int as finds,
       max(a.created_at) as last_find_at,
       (array_agg(q.title order by a.created_at desc))[1:5] as titles
from places p
join answers a on a.place_id = p.id and a.status in ('aceita','confirmada')
join questions q on q.id = a.question_id
group by p.id;
