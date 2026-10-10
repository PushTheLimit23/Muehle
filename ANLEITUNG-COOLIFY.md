# Mühle mit Coolify online bringen

Dauer: ca. 15 Minuten. Es ist derselbe Ablauf wie bei Vier Gewinnt – nur mit neuem Namen.

**Prinzip:** Code auf GitHub → Coolify baut daraus einen Container → läuft unter `muehle.deine-domain.de` mit HTTPS.

---

## 1. Neues GitHub-Repository

1. Auf github.com oben rechts **„+“ → „New repository“**
   - Name: `muehle`
   - **Public**, Häkchen bei „Add a README“ → **Create repository**
2. **„Add file“ → „Upload files“**
3. Die **Inhalte** des entpackten Ordners `muehle` hineinziehen:
   `Dockerfile`, `.dockerignore`, `package.json`, `server.js` und den Ordner `public`
4. **„Commit changes“**

Prüfen: Im Ordner `public` liegen **5 Dateien**: `index.html`, `app.js`, `rules.js`, `style.css`, `favicon.svg`.

> `.dockerignore` ist auf dem Mac versteckt (Punkt am Anfang). Fehlt sie, ist das kein Problem.

## 2. Subdomain anlegen (bei IONOS → Domains → DNS)

| Typ | Name | Wert |
|---|---|---|
| A | `muehle` | DEINE-SERVER-IP (dieselbe wie bei `vier`) |

Wirksam nach 5–60 Minuten.

## 3. In Coolify anlegen

1. **Projects** → dein Projekt (z. B. „Spiele“) → **production**
2. **„+ New“** → **„Public Repository“** → `https://github.com/DEIN-NAME/muehle` → **Check repository**
3. **Build Pack: „Dockerfile“** → **Continue**

## 4. Einstellungen

**Configuration → General**

| Feld | Wert |
|---|---|
| Domains | `https://muehle.deine-domain.de` |
| Ports Exposes | `3000` |

→ **Save**

**Persistent Storage → „+ Add“ → Volume Mount**
- Name: `muehle-daten`
- Destination Path: `/app/data`
- → **Save**

## 5. Deploy

**„Deploy“** klicken, 1–3 Minuten warten, dann `https://muehle.deine-domain.de` öffnen.

Test: `https://muehle.deine-domain.de/health` muss `ok` zeigen.

---

## Spätere Änderungen

Geänderte Datei auf GitHub hochladen → **Commit** → in Coolify **Redeploy** → im Browser neu laden (Cmd + Shift + R).

## Wenn etwas hakt

| Symptom | Wahrscheinliche Ursache | Lösung |
|---|---|---|
| Seite lädt nicht | DNS noch nicht wirksam | 30 Min warten; `/health` testen |
| „No available server“ | Port fehlt | Ports Exposes = `3000`, Redeploy |
| Brett da, aber „verbinde neu …“ | Domain ohne `https://` eingetragen | Domain korrigieren, Redeploy |
| Historie nach Update weg | Persistent Storage fehlt | Schritt 4 nachholen |
| Vier Gewinnt geht plötzlich nicht mehr | gleiche Domain zweimal vergeben | jede Ressource braucht eine eigene Subdomain |
