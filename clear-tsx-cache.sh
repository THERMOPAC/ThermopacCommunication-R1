#!/bin/bash
# Clears all tsx compile caches to force fresh recompile on next start
rm -rf /tmp/tsx-1000
rm -rf /tmp/52403f511cc1d29265b79bf422168919
rm -rf /tmp/e9b407ffa6ec79597afccba1e983dd78
# Clear any other hash-named dirs (tsx cache pattern)
for d in /tmp/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]; do
  [ -d "$d" ] && rm -rf "$d"
done
echo "tsx cache cleared"
