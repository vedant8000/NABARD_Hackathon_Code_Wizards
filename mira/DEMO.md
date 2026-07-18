# MIRA: 6-minute demo script (3 stories)

**Setup:** double-click `start.bat` (or `cd backend && uvicorn app.main:app`).
Open http://localhost:8000: all logins use password `mira2026`.
Demo "today" is **15 Jul 2026**: inside the engineered feed-price spike + Betulpur drought.

## Story 1: UDYAMI (the enterprise owner) · ~2 min
1. On the login page, tap the **red enterprise chip** (Rajesh Murgi SHG: poultry, feed-shock storyline).
2. Health Card: score in the red band, one-line reason from the model driver, savings + EMI chips.
3. Tap **Add today's entry** → Income → type ₹2,500 → 🥚 → confetti. *"30 seconds, offline-safe."*
4. Toggle **भाषा**: the whole app flips to Hindi.
5. Alerts screen: feed-price alert with a concrete action. Tap 🔊 (TTS) for low-literacy users.
6. Open **MitraBot** → chip "मेरा स्कोर क्यों कम है?" → grounded streaming answer with their real numbers.

## Story 2: ADHIKARI (the field officer) · ~2 min
1. Log out → **Field officer** chip.
2. Overview: KPI tiles, risk donut, sector×band matrix, **3D village map** (hover a red hut → tooltip; click → 360°).
3. **Risk panel**: EWS-06 feed-price shock grouped: several poultry units flagged *before any missed EMI*.
4. Enterprise 360°: sub-score bars, SHAP driver chips, forecast band, ack an alert, add an intervention note.
5. **Credit Passport PDF** button → opens the bank-ready document.

## Story 3: WHAT-IF + OFFLINE · ~2 min
1. **What-if**: rainfall −30%, prices +20% → run → red count jumps (2 → ~10), band-change list animates.
2. Tap **Ask MitraBot to explain** → the bot narrates the scenario from real model output.
3. DevTools → Network → **Offline** → app keeps rendering (cached data), add a ledger entry →
   go online → watch it sync (server dedupes by client_uuid). *"The app never shows a dead screen."*

## Close
- "Forecasts beat the seasonal-naive baseline by 23-41% (backtest in the model card)."
- "Transparent scorecard + SHAP reasons: decision support, not a black-box credit decision."
- "PWA: installs to the home screen of a ₹6,000 Android phone."
