"""Shared market feeds: commodity prices + weather (both personas)."""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Depends

from .. import store
from ..config import settings
from ..deps import get_current_user
from ..mongo import User

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/prices")
def price_feed(commodity: str | None = None, days: int = 180,
               user: User = Depends(get_current_user)):
    px = store.prices()
    end = pd.Timestamp(settings.DEMO_TODAY)
    px = px[(px.date > end - pd.Timedelta(days=days)) & (px.date <= end)]
    if commodity:
        px = px[px.commodity == commodity]
    out = {}
    for com, g in px.groupby("commodity"):
        g = g.sort_values("date")
        cur = float(g.modal_price.iloc[-1])
        prev30 = float(g[g.date <= end - pd.Timedelta(days=30)].modal_price.iloc[-1]) if len(g[g.date <= end - pd.Timedelta(days=30)]) else cur
        out[com] = {
            "current": round(cur, 1),
            "change_30d_pct": round((cur / prev30 - 1) * 100, 1) if prev30 else 0,
            "series": [{"date": str(r.date.date()), "price": round(r.modal_price, 1)}
                       for r in g.iloc[::3].itertuples()],  # thin to ~every 3rd day
        }
    return out


@router.get("/weather")
def weather_feed(district: str | None = None, user: User = Depends(get_current_user)):
    wx = store.weather()
    end = pd.Timestamp(settings.DEMO_TODAY)
    recent = wx[(wx.date > end - pd.Timedelta(days=90)) & (wx.date <= end)]
    out = {}
    for d, g in recent.groupby("district"):
        if district and d != district:
            continue
        g = g.sort_values("date")
        last30 = g[g.date > end - pd.Timedelta(days=30)]
        monsoon = wx[(wx.district == d) & (wx.date >= pd.Timestamp(end.year, 6, 1)) & (wx.date <= end)]
        out[d] = {
            "rain_30d": round(float(last30.rainfall_mm.sum()), 1),
            "rain_30d_normal": round(float(last30.rainfall_normal_mm.sum()), 1),
            "monsoon_dev_pct": round(
                (float(monsoon.rainfall_mm.sum()) / max(float(monsoon.rainfall_normal_mm.sum()), 1) - 1) * 100, 1),
            "heat_days_30d": int((last30.tmax > 40).sum()),
            "tmax_today": round(float(g.tmax.iloc[-1]), 1),
            "series": [{"date": str(r.date.date()), "rain": round(r.rainfall_mm, 1),
                        "normal": round(r.rainfall_normal_mm, 1), "tmax": round(r.tmax, 1)}
                       for r in g.iloc[::3].itertuples()],
        }
    return out
