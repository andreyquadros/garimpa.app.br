#!/usr/bin/env bash
# Sobe um PostgreSQL 16 local, sem Docker, para desenvolvimento e testes do Garimpa.
# Uso: scripts/local-postgres.sh start|stop|status|psql
# Variáveis: PGLOCAL_DIR (padrão garimpa/.pglocal), PGLOCAL_PORT (padrão 54329)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PGLOCAL_DIR:-$HERE/.pglocal}"
PORT="${PGLOCAL_PORT:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n1 || true)"
[ -n "$BIN" ] || { echo "PostgreSQL não encontrado em /usr/lib/postgresql"; exit 1; }
run_as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
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
    echo "postgres pronto: postgres://postgres@127.0.0.1:$PORT/garimpa (testes: /garimpa_test)";;
  stop) run_as_pg "$BIN/pg_ctl -D '$DIR/data' stop -m fast >/dev/null" && echo parado;;
  status) "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT";;
  psql) shift; exec "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres "${@:-garimpa}";;
  *) echo "uso: $0 start|stop|status|psql"; exit 2;;
esac
