#!/bin/sh
# Keeps Docker's build cache from filling the Docker disk. Each rebuild adds a few GB of cache, and Docker counts
# most of it as "in use", so `docker builder prune --max-used-space` reclaims nothing. Instead: once the cache is
# over 10 GB, clear it all (it's only a cache; the next build takes a little longer). Volumes are never touched.
size=$(docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk -F'\t' '$1 == "Build Cache" { print $2 }')
gb=$(printf '%s\n' "$size" | awk '{ v = $1 + 0; if ($1 ~ /GB/) print v; else if ($1 ~ /TB/) print v * 1024; else print 0 }')
if awk "BEGIN { exit !(${gb:-0} > 10) }"; then
  echo "Docker build cache is ${size}: clearing it."
  docker builder prune -af >/dev/null
fi
