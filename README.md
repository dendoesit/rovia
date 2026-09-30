# FleetDeck

**Garajul tău digital.** Adaugi mașinile o singură dată, iar FleetDeck urmărește pentru tine tot ce expiră — ITP, RCA, rovinietă, CASCO, garanție, leasing — plus service-ul, alimentările, kilometrajul și costurile. Te avertizează din timp, în aplicație și pe e-mail.

Interfața este integral în română. Frontend: **React 18 + Vite 6**. Backend: **API REST pe Netlify Functions**, cu datele în **Netlify Blobs** (fără bază de date externă).

## Ce face

- **Garaj** — carduri pentru fiecare mașină (număr, marcă/model, an, categorie, șofer, km, stare). Căutare după număr, marcă, model sau șofer; filtre *Toate / Necesită atenție / Lipsesc documente* și pe categorie (autoturism, utilitară, camion, remorcă, motocicletă) când flota are mai multe; sortare după stare, nume sau kilometraj.
- **Stare** — „🟢 Totul e în regulă” sau „2 lucruri necesită atenție”: următorul service (km sau dată), fiecare document, anvelopele. Documentele obligatorii care lipsesc (ITP, RCA, rovinietă; la remorci doar ITP și RCA) sunt semnalate separat.
- **Alerte escaladate** — galben ≤30 zile → portocaliu ≤15 → roșu ≤5 → expirat. Banda de alerte apare sus pe orice pagină; peste 4 alerte se strânge într-un rezumat („3 expirate · 2 în ≤5 zile · 4 în ≤30 zile”) care se deschide la cerere.
- **Acțiuni rapide** pe pagina mașinii (pe mobil, fixate jos): 🔧 Lucrare, ⛽ Alimentare, 💶 Cheltuială, 📄 Document, 📍 Kilometraj. Toate sunt fluxuri scurte, pas cu pas: Enter trece mai departe, „← Înapoi” corectează, iar închiderea cu date completate cere confirmare. Dacă salvarea eșuează, fereastra rămâne deschisă cu datele introduse.
- **Lucrări** — revizie, distribuție, ambreiaj, frâne, anvelope, baterie, reparație; cu data, km-ul la momentul lucrării, costul, o notă și poza facturii. După o revizie se recalculează ambele ținte (km și dată) pe baza intervalului recomandat pentru vârsta și combustibilul mașinii; o revizie mai veche decât ultima înregistrată intră doar în istoric.
- **Alimentări** — doar suma e obligatorie; cu litri afișează prețul pe litru, iar cu km la fiecare plin calculează consumul real (L/100 km).
- **Cheltuieli mărunte** — spălătorie, parcare, amendă, taxă de drum, accesorii, altele; separate de lucrări ca istoricul să rămână curat.
- **Kilometraj** — fiecare actualizare e o citire în istoric; o valoare mai mică decât cea actuală cere confirmare (corectură).
- **Documente** — adăugare, reînnoire („Reînnoiește →”) și ștergere. Butoanele rapide de durată pornesc din ziua de după expirarea actuală (nu din trecut) și se opresc în ultima zi valabilă — un RCA de 12 luni început pe 16 noiembrie ține până pe 15 noiembrie; ITP-ul respectă termenul legal după vârsta mașinii (prima la 3 ani, apoi la 2 ani, anual peste 12 ani). Fiecare reînnoire intră automat în istoric.
- **Poze** — la orice intrare se poate atașa o poză (bon, factură, document), redimensionată în browser și păstrată separat de datele mașinii.
- **Scanare documente cu AI** — fotografiezi RCA-ul, ITP-ul sau rovinieta, iar AI-ul completează tipul, data de expirare, furnizorul și costul; dacă numărul de pe document nu e al mașinii, aplicația te avertizează înainte de salvare, iar un cost în altă monedă decât a contului nu se completează singur. Butonul apare doar când e configurată o cheie AI.
- **Istoric** — cronologia mașinii grupată pe luni, cu totalul lunar; primele 50 de intrări, apoi „Arată mai multe”.
- **Costuri și grafice** — pe fiecare mașină și în **📊 Dashboard flotă**: cheltuit pe categorii (combustibil, mentenanță, documente, altele), evoluție pe luni, clasamentul mașinilor, cost pe km, estimarea combustibilului din km/an. Estimările sunt afișate separat de sumele înregistrate.
- **Import / export Excel** — din Garaj (📥 Import Excel) încarci flota dintr-un fișier Excel; coloanele sunt recunoscute după nume, iar mașinile existente (după număr) sunt completate, nu dublate. Flota se poate exporta înapoi în Excel.
- **Monedă** — lei (implicit) sau euro, din profil. Schimbarea monedei schimbă doar afișarea, nu convertește sumele.

## Conturi și sesiuni

- Cont cu **e-mail + parolă** (minim 8 caractere), de tip **🏢 Firmă** sau **👤 Personal**. Fiecare cont își vede doar mașinile lui — separarea e făcută pe server, la fiecare cerere.
- Parolele se păstrează doar ca hash **PBKDF2-SHA256** (600.000 de iterații, salt per cont). După 5 încercări greșite, identificatorul e blocat 15 minute.
- Sesiunea stă într-un cookie **HttpOnly, SameSite=Lax, Secure** (`fd_session`); parola nu ajunge niciodată în `localStorage`. Cu „Ține-mă minte” sesiunea durează 30 de zile și se prelungește singură; altfel, o zi.
- Schimbarea sau resetarea parolei deconectează celelalte dispozitive. Resetarea se face printr-un link trimis pe e-mail, valabil o oră (necesită `RESEND_API_KEY`).
- Remindere: implicit la adresa de login; o altă adresă primește întâi un link de confirmare (valabil 3 zile).
- Conturile vechi (nume de utilizator + parolă) intră în continuare cu numele lor, sunt trecute pe PBKDF2 la primul login și, dacă parola e slabă, trebuie să o schimbe. Mașinile rămase doar în browser din versiunea veche sunt oferite spre mutare în cont.
- Scrierile venite de pe altă origine sunt refuzate (verificarea antetului `Origin`), iar `public/_headers` setează un Content-Security-Policy strict în producție.

## Profilul firmei și căutarea la ANAF

Din **👤 / 🏢** (header) completezi CUI-ul și apeși **Caută la ANAF**: denumirea, adresa sediului și nr. de înregistrare la Registrul Comerțului se completează din serviciul public ANAF (fără cheie), împreună cu informația dacă firma e plătitoare de TVA. Datele firmei apar în profil și sunt pregătite pentru facturi (rovinietă, RCA) și rapoarte.

## E-mailuri de reamintire

`netlify/functions/notify.mjs` rulează zilnic la 05:00 UTC (≈ 07:00–08:00 în România). Fiecare cont primește un singur e-mail, doar cu mașinile lui, la adresa de remindere. Documente: exact la **30** și **15 zile** înainte, apoi **zilnic de la 5 zile în jos** și după expirare. Service: zilnic când mai sunt ≤800 km sau ≤5 zile. Conturile fără adresă de remindere nu primesc nimic (alertele rămân în aplicație). Test manual: Netlify → *Functions → notify*.

Pentru utilizatori reali ai nevoie de un **domeniu verificat în Resend** și de `REMINDER_FROM` pe acel domeniu — expeditorul implicit `onboarding@resend.dev` trimite doar către proprietarul contului Resend.

## Variabile de mediu

Toate sunt **doar pentru backend** și toate sunt opționale; lista completă, comentată, e în [`.env.example`](.env.example).

| Variabilă | Rol |
|---|---|
| `RESEND_API_KEY` | trimiterea e-mailurilor: remindere zilnice, confirmarea adresei de remindere, resetarea parolei ([resend.com](https://resend.com)) |
| `REMINDER_FROM` | expeditorul, ex. `FleetDeck <remindere@firma-ta.ro>`; domeniul trebuie verificat în Resend (implicit `FleetDeck <onboarding@resend.dev>`, doar pentru test) |
| `GEMINI_API_KEY` | scanarea documentelor cu AI, varianta gratuită ([aistudio.google.com](https://aistudio.google.com), fără card); maxim 60 de citiri pe zi pentru fiecare cont |
| `GEMINI_MODEL` | opțional, implicit `gemini-2.5-flash` |
| `OPENAI_API_KEY` | alternativă cu plată pentru scanare, folosită doar dacă lipsește cheia Gemini |
| `OPENAI_MODEL` | opțional, implicit `gpt-4o-mini` |

După ce le setezi în Netlify: *Deploys → Trigger deploy*, ca să le prindă funcțiile.

## Rulare locală

Ai nevoie de **Node.js ≥ 22.12** (versiunea din `.nvmrc`: `nvm use`).

```bash
npm install
cp .env.example .env            # opțional, doar dacă vrei e-mailuri / AI local
npm run dev:netlify   # frontend + funcții + Blobs locale, fără cont Netlify (șterge întâi dist/, ca CSP-ul de producție să nu se aplice în dezvoltare)
```

Deschizi adresa afișată (de regulă `http://localhost:8888`), îți faci un cont și apeși „încarcă o mașină demo” ca să vezi aplicația populată. Datele locale stau în sandbox-ul de Blobs al Netlify CLI, separat de producție.

`npm run dev` pornește doar Vite (fără API) — util pentru lucru pe CSS, dar aplicația nu poate intra în cont fără funcții.

## Teste

```bash
npm test         # node --test "tests/**/*.test.mjs"
npm run build    # build-ul de producție în dist/
```

Testele rulează fără rețea și fără Netlify: API-ul (`netlify/functions/api.mjs`) e apelat direct cu un Blobs în memorie (`tests/memory-store.mjs`), iar logica pură din `src/lib` și `shared/` e testată separat.

## Publicare pe Netlify

Proiectul are nevoie de build și de funcții, deci **drag-and-drop nu este suficient**.

- **Prin Git (recomandat):** *Add new site → Import from Git*. `netlify.toml` conține deja build-ul (`npm run build` → `dist/`), versiunea de Node și funcțiile.
- **Prin CLI:** `npx netlify-cli deploy --prod --build`.

## API

Toate rutele sunt sub `/api` și răspund JSON. În afară de cele publice, cer cookie-ul de sesiune (altfel `401`).

| Metodă | Rută | Rol |
|---|---|---|
| GET | `/api/health` | ping (public) |
| POST | `/api/auth/register` | cont nou `{ email, password, kind, company? }` + sesiune (public) |
| POST | `/api/auth/login` | intrare `{ identifier, password, remember }` — e-mail sau nume vechi (public) |
| POST | `/api/auth/logout` | închide sesiunea (public) |
| POST | `/api/auth/forgot` | trimite linkul de resetare a parolei (public) |
| POST | `/api/auth/reset` | parolă nouă din link `{ token, password }` + sesiune (public) |
| POST | `/api/auth/confirm-reminder` | confirmă adresa de remindere `{ token }` (public) |
| GET | `/api/auth/me` | contul curent + `features { ai, mail }` |
| PATCH | `/api/account` | profil: nume, tip, firmă, monedă, e-mail de login, e-mail de remindere |
| POST | `/api/account/password` | schimbă parola `{ current, next }`; celelalte sesiuni expiră |
| GET | `/api/company?cui=` | datele firmei de la ANAF |
| POST | `/api/scan` | citește un document din poză `{ image }` → `{ type, expires, provider, cost, currency, plate }` |
| GET | `/api/vehicles` | mașinile contului |
| POST | `/api/vehicles` | mașină nouă (numărul trebuie să fie unic în cont) |
| POST | `/api/vehicles/import` | import în masă `{ vehicles, mode: "merge" \| "skip" }` → `{ created, updated, skipped, errors }` (maxim 300) |
| GET | `/api/vehicles/:id` | o mașină |
| PATCH | `/api/vehicles/:id` | actualizare (doar câmpurile permise) |
| DELETE | `/api/vehicles/:id` | șterge mașina și pozele ei |
| POST | `/api/vehicles/:id/events` | intrare în istoric `{ event, patch? }` — atomic; `event.photo` opțional |
| DELETE | `/api/vehicles/:id/events/:eid` | șterge o intrare și poza ei |
| GET | `/api/vehicles/:id/photos/:eid` | poza atașată unei intrări |
| PUT | `/api/vehicles/:id/documents/:type` | adaugă / reînnoiește un document `{ expires, provider, cost, photo }` + intrare în istoric |
| DELETE | `/api/vehicles/:id/documents/:type` | șterge documentul (istoricul rămâne) |

Tipuri de intrări (`event.kind`): `fuel`, `maintenance`, `expense`, `document`, `odometer`. O intrare cu km mai mare decât kilometrajul mașinii îl actualizează automat.

**Stocare:** fiecare mașină e un blob (`user:<cont>:vehicle:<id>`), pozele sunt blob-uri separate (`user:<cont>:photo:<mașină>:<intrare>`), iar scrierile sunt condiționate de versiune (se reiau dacă altcineva a scris între timp), ca doi colegi să nu-și suprascrie munca. Conturile, sesiunile și tokenurile de resetare/confirmare stau sub `account:`, `email:`, `session:`, `reset:`, `verify:` (tokenurile doar ca hash).

## Structura proiectului

```
index.html                 intrarea Vite
netlify.toml               build, versiunea de Node, funcții
public/_headers            antete de securitate (CSP) în producție
shared/                    reguli comune client + server
  domain.js                tipuri de documente, lucrări, categorii, validare
  dates.js                 date în ora României
  alerts.js                praguri și alerte (aceleași în aplicație și în e-mail)
src/
  App.jsx                  sesiune, rutare, acțiuni
  styles.css               designul (mobile-first)
  components/
    Login.jsx              intrare, cont nou, parolă uitată / nouă
    Garage.jsx             garajul: căutare, filtre, sortare
    CarPage.jsx            Stare / Costuri / Documente / Istoric
    CarCosts.jsx           costurile unei mașini
    FleetOverview.jsx      dashboard-ul flotei
    AlertStrip.jsx         banda de alerte
    modals.jsx             fluxurile pas cu pas (lucrare, alimentare, document…)
    AccountModal.jsx       profil, firmă, parolă
    ImportModal.jsx        importul din Excel
    ui.jsx                 fereastră modală accesibilă, câmpuri, citirea pozelor
  lib/
    model.js               logică pură: stare, costuri, istoric, filtre, formatare ro-RO
    api.js                 client REST
    nav.js                 rutare pe hash
netlify/
  functions/api.mjs        API-ul REST (tabelul de mai sus)
  functions/notify.mjs     e-mailurile zilnice
  lib/                     conturi și sesiuni, mașini, e-mail, AI + ANAF
tests/                     node:test
```

## Roadmap

Reînnoirea RCA / rovinietei direct din aplicație, cu datele mașinii precompletate și factura pe datele firmei din profil; verificări RCA/ITP/rovinietă după număr sau VIN; garaj comun pe firmă (mai mulți colegi pe aceleași mașini).
