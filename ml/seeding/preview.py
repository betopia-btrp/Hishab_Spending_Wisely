#!/usr/bin/env python3
"""
SpendWise — Data Preview Tool
Generate sample expenses with custom user personas, inspect the output.

Usage:
  python preview.py
  python preview.py --count 50
  python preview.py --seed 123
"""

import argparse, random, sys, os
from datetime import date, datetime, timedelta
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seeding.utils import load_yaml
from seeding.angles import assign_angles, compute_profiles, build_user_weight_list
from seeding.temporal import (
    build_weighted_date_list, assign_active_ranges, assign_velocity_profiles,
    apply_salary_day_weight, apply_velocity_weight, is_ramadan, apply_ramadan_hourly_weight,
)
from seeding.notes import generate_note

BASE = os.path.dirname(__file__)

# ═══════════════════════════════════════════════════════════════
#  USER PERSONAS — edit these to test different angle combos
# ═══════════════════════════════════════════════════════════════

USER_PERSONAS = [
    {
        "profession": "student",
        "gender": "male",
        "age_group": "teen_18_24",
        "income_tier": "low",
        "family_type": "single",
        "city_tier": "dhaka_core",
        "religion": "muslim",
        "lifestyle": "urban_professional",
        "transport_mode": "rideshare_user",
        "spending_personality": "experience_seeker",
        "tech_adoption": "app_native",
    },
    {
        "profession": "businessman",
        "gender": "female",
        "age_group": "adult_35_49",
        "income_tier": "high",
        "family_type": "family_kids",
        "city_tier": "dhaka_core",
        "religion": "hindu",
        "lifestyle": "social_extrovert",
        "transport_mode": "car_owner",
        "spending_personality": "impulse_buyer",
        "tech_adoption": "app_native",
    },
    {
        "profession": "teacher",
        "gender": "male",
        "age_group": "middle_50_64",
        "income_tier": "middle",
        "family_type": "family_kids",
        "city_tier": "small_town",
        "religion": "christian",
        "lifestyle": "family_centered",
        "transport_mode": "bike_owner",
        "spending_personality": "planned_budgeter",
        "tech_adoption": "hybrid",
    },
    {
        "profession": "freelancer",
        "gender": "female",
        "age_group": "young_25_34",
        "income_tier": "upper_middle",
        "family_type": "single",
        "city_tier": "chittagong",
        "religion": "muslim",
        "lifestyle": "homebody_introvert",
        "transport_mode": "rideshare_user",
        "spending_personality": "convenience_spender",
        "tech_adoption": "app_native",
    },
    {
        "profession": "shop_owner",
        "gender": "male",
        "age_group": "adult_35_49",
        "income_tier": "middle",
        "family_type": "shared_flat",
        "city_tier": "dhaka_suburb",
        "religion": "hindu",
        "lifestyle": "frugal_saver",
        "transport_mode": "public_transport",
        "spending_personality": "bargain_hunter",
        "tech_adoption": "traditional",
    },
]


def make_user_id(name):
    """Deterministic UUID from name."""
    import hashlib, uuid as _uuid
    return str(_uuid.UUID(hashlib.md5(name.encode()).hexdigest()[:32]))


def main():
    parser = argparse.ArgumentParser(description="Preview generated expenses")
    parser.add_argument("--count", type=int, default=30,
                       help="Number of expenses to generate")
    parser.add_argument("--seed", type=int, default=None,
                       help="Random seed for reproducibility")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    N = args.count

    # ── Load config & templates ──
    cfg = load_yaml(os.path.join(BASE, "config.yaml"))
    tpl_dir = os.path.join(BASE, "templates")
    bangla_words = load_yaml(os.path.join(tpl_dir, "bangla_words.yaml"))
    tpls = {
        "notes": load_yaml(os.path.join(tpl_dir, "notes.yaml")),
        "values": load_yaml(os.path.join(tpl_dir, "values.yaml")),
        "bangla_words": bangla_words,
        "bangla_notes": load_yaml(os.path.join(tpl_dir, "bangla_notes.yaml")),
        "receipts": load_yaml(os.path.join(tpl_dir, "receipts.yaml")),
        "ambiguous": load_yaml(os.path.join(tpl_dir, "ambiguous.yaml")),
        "venue_banks": load_yaml(os.path.join(tpl_dir, "venue_banks.yaml")),
    }
    merged_values = {**tpls["values"], **bangla_words}

    cat_names = list(cfg["category_weights"].keys())
    cat_amounts = {}
    for n in cat_names:
        ac = cfg["amount_distribution"].get(n, {"mean": 500, "min": 10, "max": 10000})
        cat_amounts[n] = ac

    shape_weights = cfg.get("note_shapes", {})
    dim_names = list(cfg["user_angles"].keys())

    # ── Build users from PERSONAS ──
    user_ids = []
    for p in USER_PERSONAS:
        uid = make_user_id(str(p))
        user_ids.append(uid)

    # Assign angles using the hardcoded personas instead of random
    angle_map = {}
    for uid, persona in zip(user_ids, USER_PERSONAS):
        angle_map[uid] = persona.copy()
        # Ensure all dimensions are present (fill missing with first value)
        for dim in dim_names:
            if dim not in angle_map[uid]:
                angle_map[uid][dim] = list(cfg["user_angles"][dim].keys())[0]

    profiles = compute_profiles(user_ids, angle_map, cfg["user_angles"])

    # ── Show profiles ──
    print("─" * 72)
    for uid, persona in zip(user_ids, USER_PERSONAS):
        p = profiles[uid]
        angle_str = " × ".join(f"{d}={persona[d]}" for d in dim_names if d in persona)
        print(f"  {persona.get('name', p.angles.get('profession','?'))}")
        print(f"    {angle_str}")
        print()
    print("─" * 72)
    print()

    # ── Pre-compute ──
    weighted_users, user_weights = build_user_weight_list(
        user_ids, profiles,
        cfg.get("user_assignment", {}).get("power_user_ratio", 0.20),
        cfg.get("user_assignment", {}).get("power_user_expense_share", 0.60),
    )

    end_date = date.today()
    start_date = end_date - timedelta(days=cfg["date_range_months"] * 30)
    all_dates, date_weights = build_weighted_date_list(start_date, end_date, cfg)
    sampled_dates = random.choices(all_dates, weights=date_weights, k=N)
    sampled_users = random.choices(weighted_users, weights=user_weights, k=N)
    velocity_map = assign_velocity_profiles(user_ids)
    active_ranges = assign_active_ranges(
        [{"id": uid, "created_at": end_date - timedelta(days=random.randint(30, 700))}
         for uid in user_ids],
        cfg["date_range_months"], start_date
    )

    sampled_amounts = {}
    for cat in cat_names:
        ac = cat_amounts[cat]
        mu = np.log(ac["mean"])
        samples = np.random.lognormal(mu, 0.5, max(N * 2, 1000))
        samples = np.clip(samples, ac["min"], ac["max"])
        samples = np.round(samples, 2)
        sampled_amounts[cat] = samples.tolist()
    sampled_amount_ptrs = {cat: 0 for cat in cat_names}

    user_cat_dists = {}
    for uid in user_ids:
        profile = profiles[uid]
        mults = np.array([profile.category_mult.get(c, 1.0) for c in cat_names])
        weights = mults * np.array([cfg["category_weights"].get(c, 1) for c in cat_names])
        eps = 0.001
        if weights.sum() < eps:
            weights = np.ones(len(cat_names))
        user_cat_dists[uid] = (weights / weights.sum()).tolist()

    # ── Generate ──
    for i in range(N):
        uid = sampled_users[i]
        profile = profiles[uid]

        exp_date = sampled_dates[i]
        if hasattr(exp_date, "date"):
            exp_date = exp_date.date()

        velocity = velocity_map.get(uid, "even")
        vel_mult = apply_velocity_weight(exp_date.day, velocity)
        if vel_mult < 1.0 and random.random() > vel_mult:
            for _ in range(5):
                exp_date = random.choice(all_dates)
                if hasattr(exp_date, "date"):
                    exp_date = exp_date.date()
                if apply_velocity_weight(exp_date.day, velocity) >= 0.8:
                    break

        salary_mult = apply_salary_day_weight(exp_date.day, cfg)
        festival = None
        for sp in cfg.get("seasonal_periods", []):
            try:
                y = exp_date.year
                sp_s = date(y, sp["start_month"], sp["start_day"])
                sp_e = date(y, sp["end_month"], sp["end_day"])
                if sp_s <= exp_date <= sp_e:
                    festival = sp
                    break
            except (ValueError, KeyError):
                pass

        user_religion = profile.angles.get("religion")
        festival_religion = festival.get("religion") if festival else None
        religion_map = {"muslim": "islam", "hindu": "hindu",
                        "buddhist": "buddhist", "christian": "christian"}
        religion_match = (festival_religion is None or
                          religion_map.get(user_religion) == festival_religion)

        cat_dists = user_cat_dists.get(uid)
        if cat_dists:
            adj = list(cat_dists)
            affected = cfg.get("salary_day_weights", {}).get("affected_categories", [])
            for ci, cn in enumerate(cat_names):
                if cn in affected and salary_mult > 1.0:
                    adj[ci] *= salary_mult
            if festival and religion_match and "categories_boost" in festival:
                for cn, boost in festival["categories_boost"].items():
                    if cn in cat_names:
                        ci = cat_names.index(cn)
                        adj[ci] *= boost
            total = sum(adj)
            adj = [d / total for d in adj]
            cat = random.choices(cat_names, weights=adj, k=1)[0]
        else:
            cat = cat_names[0]

        amt_pool = sampled_amounts.get(cat)
        if amt_pool:
            ptr = sampled_amount_ptrs[cat]
            amt = amt_pool[ptr % len(amt_pool)]
            sampled_amount_ptrs[cat] = ptr + 1
            amt = amt * profile.amount_mult
            if profile.amount_round_to > 0:
                if profile.amount_round_to >= 10:
                    amt = round(amt / profile.amount_round_to) * profile.amount_round_to
                else:
                    amt = round(amt, 2)
            ac = cat_amounts[cat]
            amt = max(ac["min"], min(amt, ac["max"]))
            amt = max(amt, 0.01)
        else:
            amt = 500.0

        hour_pool = list(cfg["hourly_weights"].keys())
        hour_wts = [cfg["hourly_weights"][h] for h in hour_pool]
        ramadan = is_ramadan(exp_date, cfg)
        if ramadan:
            for hi, h in enumerate(hour_pool):
                hour_wts[hi] *= apply_ramadan_hourly_weight(h, ramadan, cfg)
        for hi, h in enumerate(hour_pool):
            if h in profile.hours_peak:
                hour_wts[hi] *= 2.0
        hr = random.choices(hour_pool, weights=hour_wts, k=1)[0]
        mn = random.randint(0, 59)
        created_at = datetime(exp_date.year, exp_date.month, exp_date.day, hr, mn)

        festival_suffix = None
        if festival and religion_match:
            fname = festival.get("name", "").lower()
            if "durga puja" in fname: festival_suffix = "_durga_puja"
            elif "kali puja" in fname or "diwali" in fname: festival_suffix = "_puja_diwali"
            elif "christmas" in fname: festival_suffix = "_christmas"
            elif "easter" in fname: festival_suffix = "_christmas"
            elif "eid" in fname: festival_suffix = "_eid"
            elif "buddha" in fname: festival_suffix = "_buddha_purnima"

        original_cat = cat
        note, cat_override = generate_note(
            cat, amt, exp_date, profile, tpls,
            merged_values, cfg,
            shape_weights=shape_weights,
            festival_suffix=festival_suffix,
        )
        if cat_override is not None:
            cat = cat_override

        # ── Print: only note + amount ──
        amt_str = f"{amt:>10.2f}"
        note_str = (note[:90] + "…") if note and len(note) > 90 else (note or "NULL")
        print(f"  BDT{amt_str}  {note_str}")
    print()


if __name__ == "__main__":
    main()
