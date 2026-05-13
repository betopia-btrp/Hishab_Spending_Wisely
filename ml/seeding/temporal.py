"""
Temporal pattern functions — date sampling, velocity profiles,
salary day spikes, Ramadan patterns, seasonal adjustments.
"""

import random
from datetime import date, timedelta

from .utils import weighted_choice


def build_weighted_date_list(start_date, end_date, cfg):
    """
    Build a list of all dates in range with base weights from config.
    Weights combine day-of-week, month-period, and seasonal effects.
    Returns (dates, weights) for random.choices sampling.
    """
    all_dates, all_weights = [], []
    d = start_date
    while d <= end_date:
        w = cfg["day_of_week_weights"].get(d.strftime("%A"), 1.0)

        # Month period
        if d.day >= 25:
            w *= cfg["month_period_weights"]["month_end_25_31"]
        elif d.day <= 7:
            w *= cfg["month_period_weights"]["month_begin_1_7"]
        else:
            w *= cfg["month_period_weights"]["mid_month_10_20"]

        # Seasonal periods
        y = d.year
        for sp in cfg.get("seasonal_periods", []):
            try:
                sp_s = date(y, sp["start_month"], sp["start_day"])
                sp_e = date(y, sp["end_month"], sp["end_day"])
                if sp_s <= d <= sp_e:
                    w *= sp["weight"]
            except (ValueError, KeyError):
                pass

            # Special: named seasons by month
            if sp.get("name") == "Winter" and d.month in (11, 12, 1, 2):
                w *= sp.get("weight", 1.2)
            if sp.get("name") == "Monsoon" and d.month in (6, 7, 8, 9):
                w *= sp.get("weight", 0.8)

        all_dates.append(d)
        all_weights.append(w)
        d += timedelta(days=1)

    return all_dates, all_weights


def apply_salary_day_weight(day_of_month, cfg):
    """
    Boost weight on salary disbursement days (1st, 5th, 10th, 25th).
    """
    salary_cfg = cfg.get("salary_day_weights", {})
    if not salary_cfg:
        return 1.0

    salary_days = salary_cfg.get("days", [1, 5, 10, 25])
    spread = salary_cfg.get("spread_days", 3)
    mult = salary_cfg.get("weight_multiplier", 2.0)

    for sd in salary_days:
        # day_of_month is the day in the date
        diff = abs(day_of_month - sd)
        if diff == 0:
            return mult
        elif diff <= spread:
            # Linear decay from mult to 1.0 over spread days
            return 1.0 + (mult - 1.0) * (1.0 - diff / (spread + 1))

    return 1.0


def apply_velocity_weight(day_of_month, velocity_profile):
    """
    Adjust date weight based on user's spending velocity pattern.
    """
    if velocity_profile == "front_loaded":
        if day_of_month <= 10:
            return 1.6
        elif day_of_month <= 20:
            return 0.8
        else:
            return 0.6
    elif velocity_profile == "back_loaded":
        if day_of_month <= 10:
            return 0.5
        elif day_of_month <= 20:
            return 0.8
        else:
            return 1.7
    elif velocity_profile == "spikey":
        return 3.0 if random.random() < 0.08 else 0.5
    else:  # even
        return 1.0


def assign_active_ranges(users, date_range_months, start_date):
    """
    Each user gets a random contiguous active period within the full date range.
    This simulates users joining at different times and having varying history.
    Returns {user_id: (active_start, active_end)}.
    """
    active_ranges = {}
    for user in users:
        uid = user["id"] if isinstance(user, dict) else user
        min_months = random.randint(3, max(3, date_range_months))
        start_offset = random.randint(0, max(0, date_range_months - min_months))
        active_start = start_date + timedelta(days=start_offset * 30)
        active_end = min(active_start + timedelta(days=min_months * 30),
                         start_date + timedelta(days=date_range_months * 30))
        active_ranges[uid] = (active_start, active_end)
    return active_ranges


def assign_velocity_profiles(user_ids):
    """
    Assign a spending velocity profile to each user.
    Returns {user_id: velocity_profile_name}.
    """
    profiles = ["front_loaded", "even", "back_loaded", "spikey"]
    weights = [0.40, 0.30, 0.20, 0.10]
    return {uid: weighted_choice(profiles, weights) for uid in user_ids}


def is_ramadan(d, cfg):
    """
    Check if a date falls within an approximate Ramadan period.
    Returns True/False and which year's config matched.
    """
    ramadan = cfg.get("ramadan_pattern", {})
    for key, period in ramadan.items():
        if key.startswith("period_"):
            try:
                parts = period["start"].split("-")
                start = date(int(parts[0]), int(parts[1]), int(parts[2]))
                parts = period["end"].split("-")
                end = date(int(parts[0]), int(parts[1]), int(parts[2]))
                if start <= d <= end:
                    return True
            except (ValueError, KeyError, IndexError):
                pass
    return False


def apply_ramadan_hourly_weight(hour, is_ramadan, cfg):
    """
    Adjust hourly weight for Ramadan patterns (iftar spike, daytime suppression).
    """
    if not is_ramadan:
        return 1.0

    ramadan = cfg.get("ramadan_pattern", {})
    multipliers = ramadan.get("weight_multipliers", {})

    iftar = multipliers.get("iftar_hours", {})
    daytime = multipliers.get("daytime_hours", {})
    seheri = multipliers.get("seheri_hours", {})

    if hour in iftar.get("hours", [17, 18, 19]):
        return iftar.get("Food_Dining", 3.0)
    elif hour in seheri.get("hours", [3, 4, 5]):
        return seheri.get("Food_Dining", 1.5)
    elif 6 <= hour <= 16:
        return daytime.get("Food_Dining", 0.3)

    return 1.0
