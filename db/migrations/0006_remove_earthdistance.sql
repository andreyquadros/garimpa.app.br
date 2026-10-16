-- Remove a geo antiga (cube + earthdistance): as consultas usam PostGIS desde a 0005.
-- O índice vai antes da extensão, e earthdistance antes de cube, que ela depende.
drop index if exists places_earth;
drop extension if exists earthdistance;
drop extension if exists cube;
