# Przywracanie konfiguracji Nginx

## Problem
Deploy script mógł nadpisać lub usunąć konfiguracje Nginx dla innych serwisów.

## Diagnostyka

```bash
# 1. Sprawdź błędy Nginx
nginx -t
tail -100 /var/log/nginx/error.log

# 2. Zobacz wszystkie dostępne konfiguracje
ls -la /etc/nginx/sites-available/

# 3. Zobacz aktywne konfiguracje
ls -la /etc/nginx/sites-enabled/

# 4. Sprawdź co było w default (jeśli usunęliśmy)
ls -la /etc/nginx/sites-available/default
```

## Przywracanie

### Jeśli default został usunięty:

```bash
# Przywróć default jeśli był potrzebny
if [ -f "/etc/nginx/sites-available/default" ]; then
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
fi
```

### Sprawdź inne serwisy:

Z logów widziałem te serwisy:
- ghostiee
- orbitradio.cloud
- paperboxdesigner.com
- pablogfx.com (prawdopodobnie)
- inne...

```bash
# Włącz wszystkie dostępne konfiguracje
for site in /etc/nginx/sites-available/*; do
    site_name=$(basename "$site")
    if [ "$site_name" != "we.pablogfx.com" ]; then
        echo "Enabling: $site_name"
        ln -sf "$site" "/etc/nginx/sites-enabled/$site_name"
    fi
done

# Test
nginx -t

# Reload
systemctl reload nginx
```

## Napraw konfigurację we.pablogfx.com

Upewnij się że nie koliduje z innymi:

```bash
cat /etc/nginx/sites-available/we.pablogfx.com
```

## Jeśli masz backup

```bash
# Sprawdź czy jest backup
ls -la /etc/nginx/sites-available/*.bak
ls -la /etc/nginx/sites-available/*~

# Przywróć z backupu jeśli jest
```
