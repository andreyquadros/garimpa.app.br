#!/usr/bin/env bash
# Sobe um Redis local (só Docker) para desenvolvimento e testes do cache do Garimpa (ADR-0006).
# Uso: scripts/local-redis.sh start|stop|status|cli
# Variáveis: REDISLOCAL_PORT (padrão 63799), REDISLOCAL_IMAGE (padrão redis:8.8.3-alpine) e
#            REDISLOCAL_CONTAINER (padrão garimpa-redis). Sem senha, só em 127.0.0.1.
set -euo pipefail
PORT="${REDISLOCAL_PORT:-63799}"
IMAGE="${REDISLOCAL_IMAGE:-redis:8.8.3-alpine}"
CONTAINER="${REDISLOCAL_CONTAINER:-garimpa-redis}"
URL="redis://127.0.0.1:$PORT (testes: REDIS_URL_TEST=redis://127.0.0.1:$PORT/2)"

command -v docker >/dev/null 2>&1 || { echo "Redis local precisa do Docker"; exit 1; }
case "${1:-start}" in
  start)
    if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
      docker start "$CONTAINER" >/dev/null
    else
      # Sem volume: é cache, perder os dados só esfria. Mesmos limites da produção (ver infra/docker-compose.yml).
      docker run -d --name "$CONTAINER" -p "127.0.0.1:$PORT:6379" "$IMAGE" \
        redis-server --maxmemory 256mb --maxmemory-policy volatile-lru --save "" --appendonly no >/dev/null
    fi
    ok=0
    for i in $(seq 1 50); do
      if [ "$(docker exec "$CONTAINER" redis-cli ping 2>/dev/null || true)" = "PONG" ]; then ok=1; break; fi
      sleep 0.2
    done
    [ "$ok" = 1 ] || { echo "redis não ficou pronto a tempo (docker logs $CONTAINER)"; exit 1; }
    echo "redis pronto: $URL";;
  stop) docker stop "$CONTAINER" >/dev/null && echo parado;;
  status) docker exec "$CONTAINER" redis-cli ping;;
  cli) shift; exec docker exec -it "$CONTAINER" redis-cli "$@";;
  *) echo "uso: $0 start|stop|status|cli"; exit 2;;
esac
