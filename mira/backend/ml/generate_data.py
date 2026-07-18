"""
MIRA — mock data generator (Phase 1).

Generates 30 months of daily, seeded, schema-faithful data for 64 rural micro
enterprises across 5 sectors and 4 districts, with engineered Green/Amber/Red
storylines, then writes CSVs into backend/data/.

Run:  python ml/generate_data.py
"""
from __future__ import annotations

import os
from datetime import date, timedelta

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")
PLOTS_DIR = os.path.join(DATA_DIR, "plots")

START = date(2024, 1, 1)
DEMO_TODAY = date(2026, 7, 15)  # "now" for the demo — sits inside the shock window
DAYS = pd.date_range(START, DEMO_TODAY, freq="D")

DISTRICTS = {
    "Rampur": {"profile": "normal"},
    "Sundarganj": {"profile": "normal"},
    "Betulpur": {"profile": "drought"},   # monsoon 2026 deficit ~45%
    "Nadiya": {"profile": "flood"},       # extreme-rain event Sep 2025
}
VILLAGES = {
    "Rampur": ["Amarpur", "Bhilai Kalan", "Devgaon"],
    "Sundarganj": ["Chandpur", "Gopalpura", "Hariharpur"],
    "Betulpur": ["Jamunia", "Khairwada", "Lodhipura"],
    "Nadiya": ["Madhopur", "Nayagaon", "Piparia"],
}

SECTORS = ["dairy", "poultry", "food_processing", "handicrafts", "rural_retail"]

FIRST_NAMES = [
    "Lakshmi", "Savitri", "Meera", "Radha", "Kamla", "Sunita", "Geeta", "Anita",
    "Rekha", "Pushpa", "Ramesh", "Suresh", "Mahesh", "Dinesh", "Kailash",
    "Santosh", "Prakash", "Mukesh", "Rajesh", "Ganesh",
]
SECTOR_WORDS = {
    "dairy": ("Dugdh", "Dairy"),
    "poultry": ("Murgi", "Poultry Farm"),
    "food_processing": ("Swad", "Food Works"),
    "handicrafts": ("Kala", "Handicrafts"),
    "rural_retail": ("Kirana", "General Store"),
}

# monthly seasonality multipliers per sector (Jan..Dec)
SEASONALITY = {
    "dairy":           [1.15, 1.18, 1.05, 0.85, 0.80, 0.82, 0.90, 0.95, 1.00, 1.05, 1.12, 1.18],
    "poultry":         [1.05, 1.05, 1.00, 0.95, 0.90, 0.95, 1.00, 1.00, 1.05, 1.10, 1.10, 1.05],
    "food_processing": [0.95, 0.95, 1.05, 1.00, 0.95, 0.90, 0.95, 1.10, 1.15, 1.30, 1.25, 1.05],
    "handicrafts":     [0.80, 0.85, 0.95, 1.00, 1.05, 0.85, 0.90, 1.15, 1.25, 1.40, 1.30, 1.10],
    "rural_retail":    [1.00, 0.98, 1.05, 1.10, 1.00, 0.90, 0.88, 0.95, 1.05, 1.20, 1.15, 1.05],
}
BASE_DAILY_INCOME = {
    "dairy": 1800, "poultry": 2600, "food_processing": 2200,
    "handicrafts": 1500, "rural_retail": 3200,
}
# share of income spent on the sector's tracked input commodity
INPUT_COST_SHARE = {
    "dairy": 0.45, "poultry": 0.62, "food_processing": 0.50,
    "handicrafts": 0.35, "rural_retail": 0.72,
}
SECTOR_INPUT = {
    "dairy": "fodder", "poultry": "feed", "food_processing": "veg_index",
    "handicrafts": "raw_craft", "rural_retail": "wholesale_index",
}
SECTOR_OUTPUT = {
    "dairy": "milk", "poultry": "broiler", "food_processing": "processed_food",
    "handicrafts": "craft_goods", "rural_retail": "retail_basket",
}

# ---------------------------------------------------------------- enterprises
def gen_enterprises() -> pd.DataFrame:
    rows = []
    eid = 0
    district_cycle = list(DISTRICTS.keys())
    for sector in SECTORS:
        for k in range(13 if sector != "rural_retail" else 12):  # 64 total
            eid += 1
            district = district_cycle[(eid + k) % 4]
            village = VILLAGES[district][eid % 3]
            etype = ["SHG", "FPO", "Individual"][eid % 3]
            fn = FIRST_NAMES[eid % len(FIRST_NAMES)]
            hw, ew = SECTOR_WORDS[sector]
            name = f"{fn} {hw} {ew}" if etype != "SHG" else f"{fn} {hw} SHG"
            rows.append({
                "id": eid,
                "name": name,
                "type": etype,
                "sector": sector,
                "village": village,
                "district": district,
                "size_factor": round(float(RNG.uniform(0.6, 1.8)), 2),
                "established_date": str(START - timedelta(days=int(RNG.integers(200, 2000)))),
                "members_count": int(RNG.integers(8, 18)) if etype == "SHG" else (int(RNG.integers(40, 220)) if etype == "FPO" else 1),
                "loan_principal": int(RNG.choice([60000, 100000, 150000, 250000])),
            })
    df = pd.DataFrame(rows)

    # ---- engineered storylines -------------------------------------------
    df["shock"] = "none"
    poultry_ids = df[df.sector == "poultry"].id.tolist()
    df.loc[df.id.isin(poultry_ids[:5]), "shock"] = "feed_spike"          # Red: input cost shock
    # drought victims: pick 4 dairy/retail enterprises and RELOCATE them to
    # Betulpur (guarantees the climate storyline exists regardless of the
    # district rotation above)
    cand = df[(df.shock == "none") & (df.sector.isin(["dairy", "rural_retail"]))].id.to_numpy()
    drought_ids = RNG.choice(cand, size=4, replace=False)
    df.loc[df.id.isin(drought_ids), ["shock", "district"]] = ["drought", "Betulpur"]
    df.loc[df.id.isin(drought_ids), "village"] = [VILLAGES["Betulpur"][i % 3] for i in range(4)]
    healthy = df[df.shock == "none"]
    idio = RNG.choice(healthy.id.to_numpy(), size=3, replace=False)
    df.loc[df.id.isin(idio), "shock"] = "idiosyncratic"                  # Red: expense spike + slippage
    healthy = df[df.shock == "none"]
    border = RNG.choice(healthy.id.to_numpy(), size=10, replace=False)
    df.loc[df.id.isin(border), "shock"] = "borderline"                   # Amber: one weak signal
    return df


# ---------------------------------------------------------------- weather
def gen_weather() -> pd.DataFrame:
    # monthly rainfall normals (mm/day equivalent) — central-India-like monsoon
    normal_mm = [0.4, 0.3, 0.5, 0.7, 1.2, 6.0, 10.5, 9.5, 5.5, 1.8, 0.5, 0.3]
    tmax_norm = [26, 29, 34, 39, 42, 39, 33, 32, 33, 33, 29, 26]
    rows = []
    for district, cfg in DISTRICTS.items():
        for d in DAYS:
            m = d.month - 1
            base = normal_mm[m]
            rain = max(0.0, float(RNG.gamma(0.9, base * 1.1)))
            # drought: 2026 monsoon at ~45% of normal in Betulpur
            if cfg["profile"] == "drought" and d.year == 2026 and d.month in (6, 7):
                rain *= 0.42
            # flood: Nadiya, two extreme weeks in Sep 2025
            if cfg["profile"] == "flood" and date(2025, 9, 8) <= d.date() <= date(2025, 9, 21):
                rain += float(RNG.uniform(35, 90))
            tmax = float(tmax_norm[m] + RNG.normal(0, 1.6))
            # heatwave spell May–June 2026 everywhere (stronger in Betulpur)
            if date(2026, 5, 20) <= d.date() <= date(2026, 6, 10):
                tmax += 3.5 if district != "Betulpur" else 5.0
            rows.append({
                "district": district, "date": d.date(), "rainfall_mm": round(rain, 1),
                "rainfall_normal_mm": normal_mm[m], "tmax": round(tmax, 1),
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- prices
def _walk(n: int, start: float, drift: float, vol: float, season: np.ndarray | None = None) -> np.ndarray:
    steps = RNG.normal(drift, vol, n)
    series = start * np.exp(np.cumsum(steps))
    if season is not None:
        series = series * season
    return series


def gen_prices() -> pd.DataFrame:
    n = len(DAYS)
    months = np.array([d.month - 1 for d in DAYS])
    veg_season = 1 + 0.12 * np.sin((months / 12) * 2 * np.pi + 1.5)

    maize = _walk(n, 2050, 0.00008, 0.006)
    soymeal = _walk(n, 4200, 0.00008, 0.007)
    # engineered feed spike: +18% ramp from 2026-05-15 to DEMO_TODAY
    spike_start = (date(2026, 5, 15) - START).days
    ramp = np.ones(n)
    ramp[spike_start:] = np.linspace(1.0, 1.18, n - spike_start)
    maize, soymeal = maize * ramp, soymeal * ramp

    fodder = _walk(n, 900, 0.00012, 0.004)
    # drought pushes fodder up from Jun 2026
    fodder_ramp = np.ones(n)
    fs = (date(2026, 6, 1) - START).days
    fodder_ramp[fs:] = np.linspace(1.0, 1.12, n - fs)
    fodder = fodder * fodder_ramp

    milk = np.round(_walk(n, 38, 0.00010, 0.002), 1)
    veg = _walk(n, 1600, 0.00009, 0.008, veg_season)
    broiler = _walk(n, 118, 0.00006, 0.008)
    craft = _walk(n, 750, 0.00007, 0.003)
    wholesale = _walk(n, 1000, 0.00010, 0.003)

    feed = 0.65 * maize / maize[0] + 0.35 * soymeal / soymeal[0]
    feed = feed * 3000  # composite feed index in Rs/quintal terms

    frames = []
    for name, series in [
        ("maize", maize), ("soymeal", soymeal), ("feed", feed), ("fodder", fodder),
        ("milk", milk), ("veg_index", veg), ("broiler", broiler),
        ("raw_craft", craft), ("wholesale_index", wholesale),
        ("processed_food", veg * 1.6), ("craft_goods", craft * 2.1),
        ("retail_basket", wholesale * 1.25),
    ]:
        frames.append(pd.DataFrame({
            "commodity": name, "date": [d.date() for d in DAYS],
            "modal_price": np.round(series, 2),
        }))
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------- ledger + digital
def gen_ledger(ents: pd.DataFrame, weather: pd.DataFrame, prices: pd.DataFrame):
    wx = weather.set_index(["district", "date"])
    px = prices.pivot(index="date", columns="commodity", values="modal_price")
    px_norm = px / px.iloc[0]  # normalized price indices

    ledger_rows, digital_rows = [], []
    n = len(DAYS)

    for _, e in ents.iterrows():
        sector, dist, size, shock = e.sector, e.district, e.size_factor, e.shock
        base = BASE_DAILY_INCOME[sector] * size
        trend = np.linspace(1.0, float(RNG.uniform(1.02, 1.15)), n)
        emi = int(e.loan_principal * 0.032)  # ~ flat EMI
        noise = RNG.normal(1, 0.13, n).clip(0.5, 1.6)

        # realistic "bad spells": every enterprise hits 1–2 spells of two
        # consecutive weak months over 30 months (illness, local disruption,
        # slow market) — gives the stress label a healthy base rate
        bad_month_mult = np.ones(n)
        all_months = pd.period_range(START, DEMO_TODAY, freq="M")
        day_month = np.array([d.to_period("M") for d in DAYS])
        for _ in range(int(RNG.integers(1, 3))):
            start_idx = int(RNG.integers(0, len(all_months) - 2))
            spell = {all_months[start_idx], all_months[start_idx + 1]}
            dip = float(RNG.uniform(0.45, 0.65))
            mask = np.isin(day_month, list(spell))
            bad_month_mult[mask] = np.minimum(bad_month_mult[mask], dip)

        # --- daily income --------------------------------------------------
        income = np.zeros(n)
        out_key = SECTOR_OUTPUT[sector]
        out_idx = px_norm[out_key].to_numpy() if out_key in px_norm else np.ones(n)
        for i, d in enumerate(DAYS):
            dd, m = d.date(), d.month - 1
            season = SEASONALITY[sector][m]
            amt = base * season * trend[i] * noise[i] * out_idx[i] * bad_month_mult[i]
            w = wx.loc[(dist, dd)]
            if sector == "dairy" and w.tmax > 40:
                amt *= 0.82  # heat stress cuts yield
            if sector == "rural_retail" and w.rainfall_mm > 30:
                amt *= 0.75  # heavy rain cuts footfall
            # drought storyline: income slide during deficit monsoon
            if shock == "drought" and dd >= date(2026, 6, 1):
                amt *= 0.68
            # flood district disruption (all enterprises there, Sep 2025)
            if dist == "Nadiya" and date(2025, 9, 8) <= dd <= date(2025, 9, 28):
                amt *= 0.55
            income[i] = amt

        # poultry: convert to 6-week batch lumps (keep 15% daily egg/misc sales)
        if sector == "poultry":
            daily_part = income * 0.15
            lump = np.zeros(n)
            acc = 0.0
            offset = int(RNG.integers(0, 42))
            for i in range(n):
                acc += income[i] * 0.85
                if (i + offset) % 42 == 0 and i > 0:
                    lump[i] = acc
                    acc = 0.0
            income = daily_part + lump

        # handicrafts: lumpy orders ~ every 8–20 days scaled by season
        if sector == "handicrafts":
            daily_part = income * 0.10
            lump = np.zeros(n)
            i = int(RNG.integers(3, 15))
            while i < n:
                window = income[max(0, i - 12):i + 1]
                lump[i] = float(window.sum()) * 0.9
                i += int(RNG.integers(8, 21))
            income = daily_part + lump

        # idiosyncratic: 2-month income dip Apr–May 2026
        if shock == "idiosyncratic":
            for i, d in enumerate(DAYS):
                if date(2026, 4, 1) <= d.date() <= date(2026, 5, 31):
                    income[i] *= 0.55

        # --- daily expenses -------------------------------------------------
        in_key = SECTOR_INPUT[sector]
        in_idx = px_norm[in_key].to_numpy()
        share = INPUT_COST_SHARE[sector]
        # feed_spike victims run a thinner margin + higher feed dependence
        if shock == "feed_spike":
            share = 0.78
        mean_income = float(np.mean(income))
        var_exp = mean_income * share * in_idx * RNG.normal(1, 0.08, n).clip(0.6, 1.4)
        fixed = mean_income * 0.12
        expenses = var_exp + fixed
        if shock == "idiosyncratic":
            # medical/repair expense spike mid-April 2026
            spike_day = (date(2026, 4, 12) - START).days
            expenses[spike_day] += mean_income * 22

        # --- assemble ledger entries ---------------------------------------
        cash = float(RNG.uniform(15000, 60000))  # opening savings buffer
        missed_emis = []
        for i, d in enumerate(DAYS):
            dd = d.date()
            if income[i] > 1:
                ledger_rows.append((e.id, dd, "income", round(income[i]), "sales", "upi" if RNG.random() < 0.55 else "cash"))
            if expenses[i] > 1:
                ledger_rows.append((e.id, dd, "expense", round(expenses[i]), "inputs", "cash"))
            cash += income[i] - expenses[i]
            # weekly savings deposit on Mondays if there is surplus
            if d.weekday() == 0:
                surplus_ok = cash > mean_income * 3
                skip = False
                if shock == "borderline" and RNG.random() < 0.45:
                    skip = True  # irregular savings — the Amber signal
                if shock in ("feed_spike", "drought", "idiosyncratic") and dd >= date(2026, 5, 1):
                    skip = cash < mean_income * 6
                if surplus_ok and not skip:
                    dep = round(mean_income * float(RNG.uniform(0.5, 1.2)))
                    ledger_rows.append((e.id, dd, "savings_deposit", dep, "group_savings", "cash"))
                    cash -= dep
            # EMI on the 5th
            if dd.day == 5:
                stressed_now = shock in ("feed_spike", "drought", "idiosyncratic") and dd >= date(2026, 6, 1)
                idio_miss = shock == "idiosyncratic" and dd.month in (5, 6) and dd.year == 2026
                if (stressed_now and cash < emi * 2 and RNG.random() < 0.7) or idio_miss:
                    missed_emis.append(dd)
                else:
                    ledger_rows.append((e.id, dd, "loan_repayment", emi, "emi", "bank"))
                    cash -= emi

        # --- digital activity (3-week LEAD on stress) ------------------------
        inc_norm = income / (np.mean(income) + 1e-9)
        lead = np.roll(inc_norm, -21)  # activity today mirrors income 3 weeks ahead
        lead[-21:] = lead[-22]
        base_txn = {"dairy": 14, "poultry": 8, "food_processing": 11,
                    "handicrafts": 5, "rural_retail": 32}[sector] * size
        for i, d in enumerate(DAYS):
            k = float(np.clip(0.5 * inc_norm[i] + 0.5 * lead[i], 0.1, 3.0))
            digital_rows.append((
                e.id, d.date(),
                max(0, int(RNG.poisson(base_txn * k))),
                round(float(np.clip(k * RNG.normal(1, 0.1), 0.1, 3.0)), 3),
                round(float(np.clip(1.05 * k, 0.2, 2.5)), 3),
                round(float(np.clip(RNG.normal(0.6, 0.1) * min(k, 1.4), 0.05, 1.0)), 3),
            ))

    ledger = pd.DataFrame(ledger_rows, columns=["enterprise_id", "date", "kind", "amount", "category", "channel"])
    digital = pd.DataFrame(digital_rows, columns=["enterprise_id", "date", "txn_count", "value_index", "inflow_outflow", "payer_diversity"])
    return ledger, digital


# ---------------------------------------------------------------- labels
def gen_labels(ledger: pd.DataFrame) -> pd.DataFrame:
    led = ledger.copy()
    led["month"] = pd.to_datetime(led.date).dt.to_period("M")
    pivot = led.pivot_table(index=["enterprise_id", "month"], columns="kind",
                            values="amount", aggfunc="sum", fill_value=0).reset_index()
    for col in ("income", "expense", "loan_repayment"):
        if col not in pivot:
            pivot[col] = 0
    pivot["net_cf"] = pivot["income"] - pivot["expense"]
    # expected EMI months: an enterprise with a loan should repay monthly
    rows = []
    for eid, grp in pivot.groupby("enterprise_id"):
        grp = grp.sort_values("month").reset_index(drop=True)
        emi_expected = grp["loan_repayment"].max() > 0
        for i in range(len(grp)):
            fut = grp.iloc[i + 1:i + 4]
            if len(fut) < 3:
                continue
            neg = int((fut["net_cf"] < 0).sum() >= 2)
            missed = int(emi_expected and (fut["loan_repayment"] == 0).any())
            rows.append({"enterprise_id": eid, "month": str(grp.iloc[i]["month"]),
                         "stressed": int(neg or missed)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- main
def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PLOTS_DIR, exist_ok=True)

    print("Generating enterprises…")
    ents = gen_enterprises()
    ents.to_csv(os.path.join(DATA_DIR, "enterprises.csv"), index=False)

    print("Generating weather…")
    weather = gen_weather()
    weather.to_csv(os.path.join(DATA_DIR, "weather.csv"), index=False)

    print("Generating prices…")
    prices = gen_prices()
    prices.to_csv(os.path.join(DATA_DIR, "prices.csv"), index=False)

    print("Generating ledgers + digital activity (takes ~a minute)…")
    ledger, digital = gen_ledger(ents, weather, prices)
    ledger.to_csv(os.path.join(DATA_DIR, "ledger.csv"), index=False)
    digital.to_csv(os.path.join(DATA_DIR, "digital_activity.csv"), index=False)

    print("Generating stress labels…")
    labels = gen_labels(ledger)
    labels.to_csv(os.path.join(DATA_DIR, "labels.csv"), index=False)

    # sanity plots
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 2, figsize=(14, 8))
        for c in ("maize", "soymeal", "fodder"):
            s = prices[prices.commodity == c]
            axes[0, 0].plot(pd.to_datetime(s.date), s.modal_price / s.modal_price.iloc[0], label=c)
        axes[0, 0].set_title("Input price indices (feed spike visible 2026)"); axes[0, 0].legend()

        w = weather[weather.district == "Betulpur"].copy()
        w["month"] = pd.to_datetime(w.date).dt.to_period("M")
        mm = w.groupby("month")[["rainfall_mm", "rainfall_normal_mm"]].sum()
        mm.plot(ax=axes[0, 1], title="Betulpur rainfall vs normal (drought 2026)")

        led = ledger.copy(); led["month"] = pd.to_datetime(led.date).dt.to_period("M")
        for sec in SECTORS:
            ids = ents[ents.sector == sec].id
            s = led[(led.enterprise_id.isin(ids)) & (led.kind == "income")]
            m = s.groupby("month").amount.sum() / len(ids)
            axes[1, 0].plot(m.index.to_timestamp(), m.values, label=sec)
        axes[1, 0].set_title("Avg monthly income per sector"); axes[1, 0].legend(fontsize=7)

        lab = labels.groupby("month").stressed.mean()
        axes[1, 1].plot(pd.PeriodIndex(lab.index, freq="M").to_timestamp(), lab.values)
        axes[1, 1].set_title("Share of enterprises stressed (label base rate)")
        fig.tight_layout()
        fig.savefig(os.path.join(PLOTS_DIR, "sanity.png"), dpi=110)
        print("Sanity plot -> data/plots/sanity.png")
    except Exception as ex:  # plots are optional
        print("plot skipped:", ex)

    print("\nSUMMARY")
    print(f"  enterprises: {len(ents)}  (shocks: {ents.shock.value_counts().to_dict()})")
    print(f"  ledger rows: {len(ledger):,}")
    print(f"  digital rows: {len(digital):,}")
    print(f"  label rows: {len(labels):,}  (positive rate {labels.stressed.mean():.2%})")
    print("DONE — CSVs in backend/data/")


if __name__ == "__main__":
    main()
