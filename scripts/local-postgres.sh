#!/usr/bin/env bash
# Sobe um PostgreSQL 18 local para desenvolvimento e testes do Garimpa.
# Usa os binários instalados (/usr/lib/postgresql, /usr/pgsql-* ou pg_ctl no PATH); sem eles, usa Docker.
# Uso: scripts/local-postgres.sh start|stop|status|psql
# Variáveis: PGLOCAL_DIR (padrão garimpa/.pglocal, só no modo binários), PGLOCAL_PORT (padrão 54329),
#            PGLOCAL_IMAGE (padrão postgres:18-alpine) e PGLOCAL_CONTAINER (padrão garimpa-pg18), só no modo Docker
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PGLOCAL_DIR:-$HERE/.pglocal}"
PORT="${PGLOCAL_PORT:-54329}"
IMAGE="${PGLOCAL_IMAGE:-postgres:18-alpine}"
CONTAINER="${PGLOCAL_CONTAINER:-garimpa-pg18}"
URL="postgres://postgres@127.0.0.1:$PORT/garimpa (testes: /garimpa_test)"

BIN="$(ls -d /usr/lib/postgresql/*/bin /usr/pgsql-*/bin 2>/dev/null | sort -V | tail -n1 || true)"
if [ -z "$BIN" ] && command -v pg_ctl >/dev/null 2>&1; then BIN="$(dirname "$(command -v pg_ctl)")"; fi

run_as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ -n "$BIN" ]; then
  # Modo binários instalados
  case "${1:-start}" in
    start)
      if [ ! -f "$DIR/data/PG_VERSION" ]; then
        mkdir -p "$DIR/data" "$DIR/run"; [ "$(id -u)" = 0 ] && chown -R postgres:postgres "$DIR"
        run_as_pg "$BIN/initdb -D '$DIR/data' --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null"
      fi
      run_as_pg "$BIN/pg_ctl -D '$DIR/data' -o '-p $PORT -k $DIR/run -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off' -l '$DIR/postgres.log' start >/dev/null"
      for i in $(seq 1 30); do "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q && break; sleep 0.3; done
      for db in garimpa garimpa_test; do
        "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 || "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$db"
      done
      echo "postgres pronto: $URL";;
    stop) run_as_pg "$BIN/pg_ctl -D '$DIR/data' stop -m fast >/dev/null" && echo parado;;
    status) "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT";;
    psql) shift; exec "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres "${@:-garimpa}";;
    *) echo "uso: $0 start|stop|status|psql"; exit 2;;
  esac
else
  # Modo Docker: o volume nomeado mantém os dados entre stop e start
  command -v docker >/dev/null 2>&1 || { echo "PostgreSQL não encontrado: instale os binários ou o Docker"; exit 1; }
  case "${1:-start}" in
    start)
      if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
        docker start "$CONTAINER" >/dev/null
      else
        docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust \
          -p "127.0.0.1:$PORT:5432" -v garimpa-pgdata-local:/var/lib/postgresql "$IMAGE" >/dev/null
      fi
      # A imagem reinicia o servidor uma vez após o initdb; por isso exige respostas seguidas antes de seguir
      ok=0
      for i in $(seq 1 100); do
        if docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null; then
          ok=$((ok + 1)); [ "$ok" -ge 3 ] && break
        else
          ok=0
        fi
        sleep 0.3
      done
      [ "$ok" -ge 3 ] || { echo "postgres não ficou pronto a tempo (docker logs $CONTAINER)"; exit 1; }
      for db in garimpa garimpa_test; do
        docker exec "$CONTAINER" psql -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
          || docker exec "$CONTAINER" createdb -U postgres "$db"
      done
      echo "postgres pronto: $URL";;
    stop) docker stop "$CONTAINER" >/dev/null && echo parado;;
    status) docker exec "$CONTAINER" pg_isready -U postgres;;
    psql) shift; exec docker exec -it "$CONTAINER" psql -U postgres "${@:-garimpa}";;
    *) echo "uso: $0 start|stop|status|psql"; exit 2;;
  esac
fi
