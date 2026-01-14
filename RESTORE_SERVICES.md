# Przywracanie serwisów PM2

## Problem
Deploy script użył `pm2 delete all` co usunęło wszystkie serwisy.

## Rozwiązanie

### 1. Przywróć z zapisanego dump PM2

PM2 zapisuje stan w `/root/.pm2/dump.pm2`. Spróbuj przywrócić:

```bash
# Sprawdź czy jest zapisany dump
ls -la /root/.pm2/dump.pm2

# Przywróć wszystkie serwisy
pm2 resurrect

# Sprawdź status
pm2 status
```

### 2. Jeśli dump nie działa, ręczne przywrócenie

Sprawdź konfiguracje w `/root/.pm2/`:

```bash
# Zobacz co było zapisane
cat /root/.pm2/dump.pm2 | grep -A 5 "name"

# Lub sprawdź logi PM2
pm2 logs --lines 0
```

### 3. Lista serwisów które były uruchomione (z logów):

- wow-backend
- xiveron-www
- orbitradio
- wow-app
- musica
- oximo-gen
- pablogfx.com
- eon

### 4. Jeśli masz backup konfiguracji PM2

```bash
# Przywróć z backupu jeśli masz
cp /root/.pm2/dump.pm2.backup /root/.pm2/dump.pm2
pm2 resurrect
```

### 5. Ręczne uruchomienie (jeśli znasz ścieżki)

Musisz znaleźć ecosystem.config.js dla każdego serwisu i uruchomić je ponownie.

## Naprawiony deploy.sh

Zaktualizowałem deploy.sh żeby NIE usuwał innych serwisów - tylko we-backend i we-frontend.
