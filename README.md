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
- **Utilizatori** — cont individual (nume + parola ta), creat automat la primul login; fiecare utilizator își vede doar mașinile lui.
- **Inteligență auto** — intervalele de service se recomandă automat după vârsta mașinii și combustibil; termenele ITP respectă legea RO (prima la 3 ani la mașină nouă, apoi la 2 ani, anual peste 12 ani vechime); costul de combustibil se estimează singur din km/an (fără să loghezi alimentări).
- **Scanare documente cu AI** — fotografiezi documentul (RCA, ITP, rovinietă…), AI-ul citește tipul, data de expirare, furnizorul și costul, iar poza rămâne atașată în istoric. Necesită `OPENAI_API_KEY`.
- **📊 Costuri flotă** — bar chart cu toate mașinile firmei, costuri pe categorii + combustibil estimat pe fiecare mașină, ca să le compari dintr-o privire.
- **Chips rapide la documente** — rovinietă: +30/+60 zile/+12 luni; RCA & CASCO: +6/+12 luni; ITP: termenul legal precompletat pentru mașina ta.

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
| `RESEND_API_KEY` | pentru e-mailurile zilnice ([resend.com](https://resend.com), gratuit) — fără ea aplicația merge, doar nu trimite mailuri |
| `REMINDER_FROM` | opțional, expeditorul (implicit `FleetDeck <onboarding@resend.dev>`) |
| `GEMINI_API_KEY` | scanarea documentelor cu AI, varianta **gratuită** ([aistudio.google.com](https://aistudio.google.com), fără card, 1.500 cereri/zi) |
| `GEMINI_MODEL` | opțional (implicit `gemini-2.5-flash`) |
| `OPENAI_API_KEY` | alternativă cu plată pentru scanare — folosită doar dacă lipsește cheia Gemini |
| `OPENAI_MODEL` | opțional (implicit `gpt-4o-mini`) |

Atât. **Nu există parolă globală** — fiecare utilizator își creează contul cu parola lui la primul login, iar destinatarul reminderelor e e-mailul pe care fiecare și-l setează singur din profil (👤).

După ce le adaugi: *Deploys → Trigger deploy*, ca să le prindă funcțiile.

Toate sunt **doar pentru backend** (funcții) — frontend-ul nu are nevoie de nicio variabilă. Pentru rulare locală cu `npx netlify dev`: copiază `.env.example` ca `.env` și completează-l (e ignorat de Git).

**Verificare:** deschizi site-ul, te loghezi, iar în header trebuie să scrie **„☁ sincronizat”**. Dacă scrie „💾 local”, funcțiile nu s-au publicat (aproape sigur ai făcut drag-and-drop).

## Utilizatori și login (intenționat simplu)

Fiecare utilizator are **contul lui, cu parola lui** — fără e-mail de confirmare, fără flow de înregistrare: primul login cu un nume nou creează contul cu parola introdusă atunci (minim 4 caractere; ține-o minte, nu există recuperare încă). Esențialul e pe server: **fiecare utilizator își vede doar mașinile lui** (chei separate în Blobs, verificate la fiecare request, nu doar ascunse în interfață).

- Numele se normalizează: `Dan Popoutanu` → `dan-popoutanu`.
- Parolele se stochează doar ca hash (SHA-256 + salt per cont), niciodată în clar.
- Autentificare: Basic auth pe fiecare request; sesiunea rămâne în browser („Ieși” în header).
- Din profil (**👤** în header) fiecare își setează **e-mailul de remindere** — acolo îi ajung alertele zilnice, doar pentru mașinile lui.

## E-mailuri de reamintire

`notify.mjs` rulează zilnic la 05:00 UTC. **Fiecare utilizator primește propriul e-mail, doar cu mașinile lui**, la adresa setată în profil (👤). Praguri: la exact **30** și **15 zile** înainte de expirare, apoi **zilnic de la 5 zile în jos** și zilnic după expirare; pentru service: când mai sunt ≤800 km sau la aceleași praguri pe dată. Utilizatorii fără e-mail setat nu primesc nimic (alertele rămân în aplicație). Test manual: Netlify → *Functions → notify*.

## API (backend)

Toate rutele `vehicles` cer autentificare (altfel 401).

```
POST   /api/login                        login SAU creare cont (nume nou)
GET    /api/account                      profilul userului { user, email }
PATCH  /api/account                      setează e-mailul de remindere
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
