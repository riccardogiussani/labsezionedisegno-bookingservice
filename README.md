# Lab Calendar

Vista settimanale del calendario del laboratorio. Richiede Node.js 22 o successivo.

```powershell
npm ci
npm run demo
```

Apri [localhost:3000](http://localhost:3000) per vedere gli eventi di esempio. Su schermi piccoli la vista mostra un giorno alla volta.

## Prova locale con Outlook.com

1. In Outlook, apri **Impostazioni → Calendario → Calendari condivisi → Pubblica un calendario**. Seleziona il calendario del laboratorio e copia il link ICS. Il livello di dettaglio scelto in Outlook determina anche quali titoli sono disponibili alla pagina.
2. Crea `.env` da `.env.example` e incolla il link dopo `OUTLOOK_ICS_URL=`. Il file `.env` è escluso da Git.
3. Ferma la demo e avvia `npm start`. Apri o aggiorna la pagina e controlla che gli eventi corrispondano a Outlook.

## Pubblicazione con Cloudflare e GitHub Pages

1. In `wrangler.jsonc`, imposta `ALLOWED_ORIGINS` con l'origine GitHub Pages (`https://riccardogiussani.github.io` se usi lo stesso account di dtwnty). Usa solo l'origine, senza `/lab-calendar/`. Per provare il Worker in locale, metti `OUTLOOK_ICS_URL` in `.dev.vars`, avvia `npm run worker:dev` e apri `http://localhost:8787/api/events?start=2026-11-09&end=2026-11-16` con date adatte al calendario. L'API restituisce gli eventi in JSON.
2. Collega Wrangler a Cloudflare con `npx wrangler login`, pubblica l'API e inserisci il link ICS nel prompt del comando per il segreto.

   ```powershell
   npm run worker:deploy
   npx wrangler secret put OUTLOOK_ICS_URL
   ```

3. In GitHub, seleziona **Settings → Pages → Source → GitHub Actions**. In **Settings → Secrets and variables → Actions → Variables**, crea `CALENDAR_API_URL` con l'origine HTTPS pubblica del Worker, per esempio `https://lab-calendar.<sottodominio>.workers.dev`.
4. Carica il progetto su GitHub. Il workflow **Deploy GitHub Pages** pubblica `dist/` quando aggiorni il branch predefinito. Puoi anche eseguirlo a mano dallo stesso branch. Apri la pagina e verifica che mostri gli eventi e l'orario dell'ultima lettura.

Il Worker legge l'ICS su richiesta e usa un solo Durable Object SQLite per condividere il limite di una lettura Outlook ogni 60 secondi. Il limite si applica anche ai tentativi falliti. Se Outlook risponde con un errore, la pagina mostra l'ultima copia valida e l'ora della lettura. Il link e il feed restano lato server. La pagina e l'API rendono pubblici i titoli e gli orari restituiti da Outlook. La frequenza con cui le modifiche appaiono nel feed dipende da Outlook.
