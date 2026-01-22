# Przywracanie pozostałych serwisów

## Diagnostyka Nginx

```bash
# 1. Sprawdź błędy Nginx
tail -50 /var/log/nginx/error.log | grep "502\|upstream"

# 2. Sprawdź wszystkie konfiguracje Nginx
ls -la /etc/nginx/sites-enabled/

# 3. Dla każdego serwisu sprawdź upstream port
grep -r "proxy_pass\|upstream" /etc/nginx/sites-available/ | grep -v "#"
```

## Przywracanie serwisów PM2

```bash
# 1. Znajdź wszystkie ecosystem.config.js
find /var/www -name "ecosystem.config.js" -type f

# 2. Dla każdego serwisu:
cd /var/www/path-to-service
pm2 start ecosystem.config.js
pm2 save
```

## Lista serwisów do przywrócenia (z wcześniejszych logów):

- orbitradio.cloud (port 3000)
- xiveron.com (port 6114)
- eon.pablogfx.com (port 3355)
- ghostiee
- pablogfx.com
- oximo-gen
- wow1.pablogfx.com
- musica
- inne...

## Sprawdź porty

```bash
# Sprawdź jakie porty są używane
netstat -tlnp | grep LISTEN | grep -E "3000|3355|6114"
```
