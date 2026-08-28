# FleetDeck

**Garajul tău digital.** Adaugi mașinile o singură dată, iar aplicația urmărește pentru tine tot ce expiră — ITP, RCA, rovinietă, CASCO — plus service-ul, alimentările și costurile. Te avertizează din timp, în aplicație și pe e-mail, ca să nu mai prinzi niciodată un ITP expirat.

Interfața este integral în română. Frontend: **React + Vite**. Backend: **API REST pe Netlify Functions**, cu datele în **Netlify Blobs** (fără bază de date externă, fără conturi suplimentare).

## Ce face

- **Garaj** — oricâte mașini: număr, marcă/model/an, combustibil, kilometraj, VIN opțional.
- **Stare** (ecranul principal al mașinii) — „🟢 Totul e în regulă” sau „2 lucruri necesită atenție”: următorul service (~km sau zile), ITP, RCA, rovinietă, CASCO, anvelope.
- **Notificări escaladate** — galben ≤30 zile → portocaliu ≤15 → roșu ≤5 (apoi zilnic) → expirat. Banda de alerte apare sus pe orice pagină și e clicabilă.
- **Lucrări** — input conversațional, nu formulare: „Service făcut ✅ → Când urmează următorul? → Cât a costat? → Adaugi factura? 📎”. Lucrările majore stau separat de cheltuielile mărunte, ca istoricul să rămână curat.
- **Alimentări** — doar suma e obligatorie; litri și km opțional. Consumul (L/100km) se calculează singur când există suficiente date.
- **Documente** — RCA, ITP, rovinietă, CASCO, garanție, leasing, cu „Reînnoiește →”; fiecare reînnoire intră automat în istoric.
- **Istoric** — cronologia mașinii se construiește singură din tot ce înregistrezi.
- **Costuri** — cât ai cheltuit anul acesta, defalcat pe categorii, plus €/km. Fără date suficiente afișează cinstit „Încă nu sunt destule date”.
- **Utilizatori** — login simplu cu nume + parola comună a echipei; fiecare utilizator își vede doar mașinile lui.

## Pornire rapidă (local)

Ai nevoie de [Node.js](https://nodejs.org) (v18+).

```bash
cd fleetdeck
npm install
npm run dev
```

Deschizi adresa afișată (de regulă `http://localhost:5173`). Fără backend, aplicația rulează în modul **💾 local**: orice parolă e acceptată, datele stau în browserul tău. Pentru a testa și backend-ul local (funcții + blobs):

```bash
npx netlify dev
```

La primul ecran: introdu orice nume și o parolă → butonul „încarcă o mașină demo” îți arată aplicația populată.

## Publicare pe Netlify

**Atenție: drag-and-drop NU este suficient** — proiectul are nevoie de build și de funcții. Două variante corecte:

**A. Prin Git (recomandat).** Urci folderul într-un repo GitHub → în Netlify: *Add new site → Import from Git* → alegi repo-ul → Deploy. Nu configurezi nimic: `netlify.toml` conține deja build-ul (`npm run build` → `dist/`) și funcțiile.

**B. Prin CLI.**
```bash
npm install -g netlify-cli
cd fleetdeck
npm install
netlify deploy --prod --build
```

După primul deploy, în Netlify → *Site configuration → Environment variables*:

| Variabilă | Rol |
|---|---|
| `APP_PASSWORD` | parola comună de login (implicit `fleetdeck` — schimb-o!) |
| `RESEND_API_KEY` | opțional, pentru e-mailurile zilnice ([resend.com](https://resend.com), gratuit) |
| `REMINDER_EMAIL` | unde ajung alertele (mai multe adrese, separate prin virgulă) |
| `REMINDER_FROM` | opțional, expeditorul |

După ce le adaugi: *Deploys → Trigger deploy*, ca să le prindă funcțiile.

**Verificare:** deschizi site-ul, te loghezi, iar în header trebuie să scrie **„☁ sincronizat”**. Dacă scrie „💾 local”, funcțiile nu s-au publicat (aproape sigur ai făcut drag-and-drop).

## Utilizatori și login (intenționat simplu)

„Useri ținuți pe o hârtie”: orice nume + parola comună a echipei. Fără înregistrare — primul login cu un nume nou îi creează automat garajul gol. Esențialul e pe server: **fiecare utilizator își vede doar mașinile lui** (chei separate în Blobs, verificate la fiecare request, nu doar ascunse în interfață).

- Numele se normalizează: `Dan Popoutanu` → `dan-popoutanu`.
- Autentificare: Basic auth pe fiecare request; sesiunea rămâne în browser („Ieși” în header).
- Datele din formatele vechi (fără useri) migrează automat în contul `admin`.

## E-mailuri de reamintire

`notify.mjs` rulează zilnic la 05:00 UTC și trimite un rezumat: la exact **30** și **15 zile** înainte de expirare, apoi **zilnic de la 5 zile în jos** și zilnic după expirare; pentru service: când mai sunt ≤800 km sau la aceleași praguri pe dată. Acoperă mașinile tuturor utilizatorilor, cu numele proprietarului pe fiecare rând. Test manual: Netlify → *Functions → notify*.

## API (backend)

Toate rutele `vehicles` cer autentificare (altfel 401).

```
POST   /api/login                        verifică user + parolă
GET    /api/vehicles                     lista mașinilor userului
POST   /api/vehicles                     creează (validare + id generat de server)
GET    /api/vehicles/:id                 o mașină
PATCH  /api/vehicles/:id                 actualizare (whitelist de câmpuri)
DELETE /api/vehicles/:id                 ștergere
POST   /api/vehicles/:id/events          eveniment { event, patch? } — atomic
DELETE /api/vehicles/:id/events/:eid     șterge un eveniment
PUT    /api/vehicles/:id/documents/:type adaugă/reînnoiește document + istoric — atomic
GET    /api/health                       ping
```

Stocare: un blob per mașină, în spațiul userului (`user:dan:vehicle:<id>`) — scrieri atomice, doi colegi nu-și suprascriu munca. Dacă aplicația crește, doar stratul de stocare se înlocuiește (ex. Postgres) — API-ul rămâne la fel.

## Structura proiectului

```
fleetdeck/
  index.html              intry-ul Vite
  netlify.toml            build + funcții (Netlify citește singur)
  package.json
  src/
    App.jsx               stare globală, rutare, sesiune, acțiuni
    styles.css            tot designul (responsive, mobile-first)
    components/
      Login.jsx           ecranul de autentificare
      Garage.jsx          grila de mașini + onboarding
      CarPage.jsx         Stare / Costuri / Documente / Istoric
      AlertStrip.jsx      banda de notificări
      modals.jsx          fluxurile conversaționale (wizard)
    lib/
      model.js            logica pură: praguri, alerte, costuri, formatare ro-RO
      api.js              client REST + fallback localStorage + sesiune
      nav.js              rutare pe hash
  netlify/functions/
    api.mjs               API-ul REST (auth + Netlify Blobs)
    notify.mjs            e-mailurile zilnice de reamintire
```

## Roadmap

OCR pe poza documentului (citește singur data de expirare), verificări RCA/ITP/rovinietă prin VIN, cumpărare RCA/rovinietă din aplicație, garaj comun pe firmă (toți colegii văd aceleași mașini), parole individuale, export Excel.
