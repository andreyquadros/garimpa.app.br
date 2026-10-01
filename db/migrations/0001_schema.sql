-- Garimpa · esquema inicial (PostgreSQL 16)
-- Geo: cube + earthdistance (distâncias em metros, índice GiST). Busca: pg_trgm + unaccent + tsvector 'portuguese'.
create extension if not exists cube;
create extension if not exists earthdistance;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists citext;

-- unaccent não é IMMUTABLE por padrão; o wrapper permite usá-lo em colunas geradas e índices.
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict as $$ select public.unaccent('public.unaccent', $1) $$;

-- Normalização única usada no servidor para comparar títulos, nomes de lojas e detectar repetição.
create or replace function norm_text(text) returns text
  language sql immutable parallel safe strict as
  $$ select trim(regexp_replace(lower(f_unaccent($1)), '[^a-z0-9]+', ' ', 'g')) $$;

create table cities (
  id          text primary key,                 -- 'ariquemes'
  name        text not null,
  state       text not null,
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 15000,   -- raio aceito para lugares e perguntas
  tz          text not null default 'America/Porto_Velho',
  created_at  timestamptz not null default now()
);

create table users (
  id               uuid primary key default gen_random_uuid(),
  google_sub       text unique,
  email            citext unique,
  name             text not null,
  handle           citext unique not null,
  avatar_url       text,
  city_id          text references cities(id),
  xp               integer not null default 0,
  credits          integer not null default 0,     -- pepitas disponíveis
  credits_pending  integer not null default 0,     -- pepitas em carência (antiplágio/antifraude)
  trust            numeric(4,2) not null default 0.50 check (trust between 0 and 1),
  streak_days      integer not null default 0,
  last_active_on   date,
  role             text not null default 'user' check (role in ('user','moderator','admin')),
  banned_at        timestamptz,
  created_at       timestamptz not null default now()
);

-- Sinais de dispositivo/rede por usuário: base para detectar conluio (quem pergunta e quem responde no mesmo aparelho).
create table user_signals (
  user_id     uuid not null references users(id) on delete cascade,
  ip_hash     text not null,
  device_hash text not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  hits        integer not null default 1,
  primary key (user_id, ip_hash, device_hash)
);
create index user_signals_device on user_signals(device_hash);
create index user_signals_ip on user_signals(ip_hash);

create table places (
  id            uuid primary key default gen_random_uuid(),
  city_id       text not null references cities(id),
  name          text not null check (length(name) between 2 and 120),
  name_norm     text generated always as (norm_text(name)) stored,
  address       text,
  lat           double precision not null,
  lng           double precision not null,
  kind          text not null default 'loja'
                check (kind in ('loja','mercado','farmacia','feira','servico','outro')),
  phone         text,
  whatsapp      text,
  source        text not null default 'user' check (source in ('user','osm','partner','import','seed')),
  osm_id        text,
  partner_tier  text check (partner_tier in ('bronze','prata','ouro')),
  partner_until timestamptz,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);
create index places_earth on places using gist (ll_to_earth(lat, lng));
create index places_name_trgm on places using gin (name_norm gin_trgm_ops);
create index places_city on places(city_id);

create table questions (
  id                 uuid primary key default gen_random_uuid(),
  city_id            text not null references cities(id),
  author_id          uuid not null references users(id),
  title              text not null check (length(title) between 3 and 140),
  details            text check (length(details) <= 1000),
  category           text not null default 'outros'
                     check (category in ('casa','eletronicos','ferramentas','saude','alimentos','pets','roupas','papelaria','auto','bebe','esporte','outros')),
  title_norm         text generated always as (norm_text(title)) stored,
  tsv                tsvector generated always as
                     (to_tsvector('portuguese', f_unaccent(coalesce(title,'') || ' ' || coalesce(details,'')))) stored,
  lat                double precision,
  lng                double precision,
  status             text not null default 'aberta'
                     check (status in ('aberta','respondida','resolvida','fechada')),
  bounty             integer not null default 0 check (bounty between 0 and 500),
  tip_budget_left    integer not null default 20 check (tip_budget_left >= 0),
  followers_count    integer not null default 0,
  answers_count      integer not null default 0,
  photo_path         text,
  accepted_answer_id uuid,
  created_at         timestamptz not null default now(),
  solved_at          timestamptz
);
create index questions_tsv on questions using gin (tsv);
create index questions_title_trgm on questions using gin (title_norm gin_trgm_ops);
create index questions_city_status on questions(city_id, status, created_at desc);
create index questions_author on questions(author_id);

create table question_followers (
  question_id uuid not null references questions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table answers (
  id                 uuid primary key default gen_random_uuid(),
  question_id        uuid not null references questions(id) on delete cascade,
  author_id          uuid not null references users(id),
  place_id           uuid not null references places(id),
  note               text check (length(note) <= 600),
  note_norm          text generated always as (norm_text(coalesce(note,''))) stored,
  price_cents        integer check (price_cents is null or price_cents >= 0),
  seen_on            date,
  status             text not null default 'pendente'
                     check (status in ('pendente','aceita','confirmada','rejeitada','oculta')),
  evidence_score     integer not null default 0 check (evidence_score between 0 and 100),
  is_first_for_place boolean not null default false,
  confirms           integer not null default 0,
  denies             integer not null default 0,
  created_at         timestamptz not null default now()
);
-- Antiplágio: só uma resposta por (pergunta, lugar) é o "primeiro achado"; as seguintes entram como confirmação.
create unique index answers_first_for_place on answers(question_id, place_id) where is_first_for_place;
create unique index answers_one_per_user_place on answers(question_id, author_id, place_id);
create index answers_question on answers(question_id, created_at);
create index answers_place on answers(place_id) where status in ('aceita','confirmada');
create index answers_author on answers(author_id);
alter table questions add constraint questions_accepted_fk
  foreign key (accepted_answer_id) references answers(id) deferrable initially deferred;

create table evidences (
  id                uuid primary key default gen_random_uuid(),
  answer_id         uuid references answers(id) on delete cascade,  -- nulo enquanto o envio ainda não virou resposta
  uploader_id       uuid not null references users(id),
  kind              text not null default 'foto_produto'
                    check (kind in ('foto_produto','foto_fachada','nota_fiscal','recibo','print','outro')),
  file_path         text not null,
  mime              text,
  width             integer,
  height            integer,
  bytes             integer,
  sha256            text not null,
  dhash             bit(64),                          -- hash perceptual (diferença de gradiente 8x8)
  exif_taken_at     timestamptz,
  exif_lat          double precision,
  exif_lng          double precision,
  device_lat        double precision,                 -- geolocalização do navegador no momento do envio
  device_lng        double precision,
  distance_exif_m   integer,
  distance_device_m integer,
  flags             text[] not null default '{}',
  score             integer not null default 0 check (score between 0 and 100),
  created_at        timestamptz not null default now()
);
create index evidences_sha on evidences(sha256);
create index evidences_answer on evidences(answer_id);
create index evidences_uploader on evidences(uploader_id, created_at desc);

create table confirmations (
  answer_id   uuid not null references answers(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  vote        smallint not null check (vote in (-1, 1)),
  comment     text check (length(comment) <= 300),
  device_lat  double precision,
  device_lng  double precision,
  weight      numeric(4,2) not null default 1.0,     -- peso pela confiança de quem confirma
  created_at  timestamptz not null default now(),
  primary key (answer_id, user_id)
);

-- Livro-razão: única fonte de verdade de XP e pepitas. Saldos em users são caches mantidos pelas funções.
create table ledger (
  id          bigserial primary key,
  user_id     uuid not null references users(id),
  kind        text not null,
  xp          integer not null default 0,
  credits     integer not null default 0,
  state       text not null default 'disponivel' check (state in ('disponivel','carencia','estornado')),
  vests_at    timestamptz,
  ref_type    text,
  ref_id      uuid,
  meta        jsonb not null default '{}'::jsonb,
  reversal_of bigint references ledger(id),
  created_at  timestamptz not null default now()
);
create index ledger_user on ledger(user_id, created_at desc);
create index ledger_vesting on ledger(vests_at) where state = 'carencia';
create index ledger_ref on ledger(ref_type, ref_id);

create table tips (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references users(id),
  to_user    uuid not null references users(id),
  answer_id  uuid not null references answers(id) on delete cascade,
  amount     integer not null check (amount > 0),
  source     text not null check (source in ('orcamento','saldo')),
  minted     boolean not null default true,   -- falso quando o antifraude decide não cunhar (conluio)
  created_at timestamptz not null default now()
);
create index tips_to on tips(to_user, created_at desc);

create table badges (
  slug        text primary key,
  name        text not null,
  description text not null,
  icon        text not null,
  xp_bonus    integer not null default 0
);
create table user_badges (
  user_id    uuid not null references users(id) on delete cascade,
  badge_slug text not null references badges(slug),
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_slug)
);

create table flags (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('pergunta','resposta','evidencia','lugar','usuario')),
  target_id   uuid not null,
  reporter_id uuid not null references users(id),
  reason      text not null check (reason in ('plagio','foto_falsa','lugar_errado','spam','ofensivo','outro')),
  details     text,
  status      text not null default 'aberta' check (status in ('aberta','procede','improcede')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  unique (target_type, target_id, reporter_id)
);

create table daily_caps (
  user_id uuid not null references users(id) on delete cascade,
  day     date not null,
  kind    text not null,
  count   integer not null default 0,
  primary key (user_id, day, kind)
);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Fase 2 · parceiros comerciais e o Cofre que paga os usuários
create table partners (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null unique references places(id),
  legal_name    text not null,
  cnpj          text,
  contact       text,
  plan          text not null check (plan in ('bronze','prata','ouro')),
  monthly_cents integer not null check (monthly_cents >= 0),
  started_at    timestamptz not null default now(),
  ends_at       timestamptz,
  active        boolean not null default true
);
create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  terms        text[] not null,              -- termos de produto que a loja quer destacar
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  budget_cents integer not null,
  spent_cents  integer not null default 0,
  status       text not null default 'ativa' check (status in ('ativa','pausada','encerrada'))
);
create table fund_ledger (                   -- o Cofre: entradas de parceiros, saídas para usuários
  id           bigserial primary key,
  kind         text not null check (kind in ('aporte_parceiro','resgate_usuario','ajuste')),
  amount_cents integer not null,
  ref_type     text,
  ref_id       uuid,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create table payouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  credits      integer not null check (credits > 0),
  amount_cents integer not null check (amount_cents > 0),
  pix_key      text not null,
  status       text not null default 'solicitado' check (status in ('solicitado','pago','negado')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz,
  note         text
);

-- Pinos do mapa: lugares com achados confirmados (resposta aceita pelo autor ou confirmada pela comunidade).
create view v_place_finds as
select p.id as place_id, p.city_id, p.name, p.kind, p.lat, p.lng, p.address, p.partner_tier,
       count(a.id)::int as finds,
       max(a.created_at) as last_find_at,
       (array_agg(q.title order by a.created_at desc))[1:5] as titles
from places p
join answers a on a.place_id = p.id and a.status in ('aceita','confirmada')
join questions q on q.id = a.question_id
group by p.id;
