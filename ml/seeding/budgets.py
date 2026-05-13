"""
Profile-aware budget generation with 3 budget types matching the app.

Types:
  1. BASE  (category_id=null, description=null) — overall monthly cap
  2. CATEGORY (category_id=set, description=null) — per-category cap
  3. TAGGED (description=string) — labeled extras like "Travel fund"

Scenario-based overspend/underspend alignment for forecast alert testing.
Amounts are scaled by the context owner's profile (income, family type, etc.).
"""

import random
from datetime import date, datetime, timedelta

from .utils import uuid4, weighted_choice


DEFAULT_SCENARIOS = [
    {"name": "well_budgeted", "ratio": 0.40, "range": [1.0, 1.3]},
    {"name": "tight_budget", "ratio": 0.25, "range": [0.7, 0.95]},
    {"name": "projected_exceed", "ratio": 0.15, "range": [0.8, 1.0]},
    {"name": "very_loose", "ratio": 0.10, "range": [2.0, 3.0]},
    {"name": "barely_under", "ratio": 0.10, "range": [0.5, 0.7]},
]


TAGGED_DESCRIPTIONS = [
    "Shopping buffer", "Travel fund", "Emergency fund",
    "Gift budget", "Savings goal", "Subscription pool",
    "Home maintenance", "Pet care", "Medical buffer", "Education fund",
]


def _get_scenario_range(scenario_name, scenarios=None):
    if scenarios is None:
        scenarios = DEFAULT_SCENARIOS
    for s in scenarios:
        if s["name"] == scenario_name:
            return s["range"]
    return [0.8, 1.4]


def _pick_scenario_for_personality(personality, scenarios, overrides=None):
    """
    Pick a budget scenario weighted by the user's spending personality.
    Falls back to global ratios if no override exists for this personality.
    """
    names = [s["name"] for s in scenarios]
    if overrides and personality in overrides:
        p_weights = overrides[personality]
        weights = [p_weights.get(n, s["ratio"]) for n, s in zip(names, scenarios)]
    else:
        weights = [s["ratio"] for s in scenarios]
    return weighted_choice(names, weights)


def generate_budgets(cursor, contexts, categories, cat_names, cat_amounts,
                     start_date, end_date, budget_weights,
                     scenarios=None, profiles=None, config=None):
    """
    Generate budgets matching the app's 3-type system.
    """
    if scenarios is None:
        scenarios = DEFAULT_SCENARIOS

    overrides = (config or {}).get("personality_scenario_overrides", {})
    tagged_pool = (config or {}).get("tagged_budget_descriptions", TAGGED_DESCRIPTIONS)

    # Build weighted category pool
    budget_cat_pool = []
    for cat in cat_names:
        bw = budget_weights.get(cat, 5)
        budget_cat_pool.extend([cat] * int(bw * 10))
    if not budget_cat_pool:
        budget_cat_pool = cat_names

    # All year-month pairs
    year_months = set()
    d = start_date.replace(day=1)
    while d <= end_date:
        year_months.add((d.year, d.month))
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)

    # Build context → owner profile lookup
    owner_profile = {}
    for ctx in contexts:
        owner_id = ctx.get("owner_id")
        if owner_id and profiles and owner_id in profiles:
            owner_profile[ctx["id"]] = profiles[owner_id]

    count = 0
    now = datetime.now()

    for ctx in contexts:
        cid = ctx["id"]
        profile = owner_profile.get(cid)
        personality = profile.angles.get("spending_personality") if profile else None

        # Category budget: pick 2-6 weighted categories for this context
        ctx_cats = list(set(random.choices(budget_cat_pool, k=random.randint(2, 6))))

        # Estimate total monthly spend for this context (for base budget)
        estimated_category_total = 0
        category_amounts = {}  # cat_name → computed budget amount

        for cat in ctx_cats:
            ac = cat_amounts.get(cat, {"mean": 500})
            base_mean = ac["mean"]

            # Scale by profile
            if profile:
                mult = profile.category_mult.get(cat, 1.0)
                base_mean *= mult
                base_mean *= profile.amount_mult
                # Family size scaling for relevant categories
                family_mult = 1.0
                if cat == "Groceries":
                    family_mult = {
                        "single": 0.4, "couple": 0.8, "family_kids": 1.5,
                        "joint_family": 2.5, "shared_flat": 0.5,
                    }.get(profile.angles.get("family_type", "single"), 1.0)
                    base_mean *= family_mult
                elif cat == "Rent & Housing":
                    rent_mult = {
                        "single": 0.6, "couple": 1.0, "family_kids": 1.3,
                        "joint_family": 1.8, "shared_flat": 0.4,
                    }.get(profile.angles.get("family_type", "single"), 1.0)
                    base_mean *= rent_mult
                    base_mean = min(base_mean, profile.rent_cap)
                elif cat == "Utilities":
                    util_mult = {
                        "single": 0.4, "couple": 0.8, "family_kids": 1.5,
                        "joint_family": 2.0, "shared_flat": 0.5,
                    }.get(profile.angles.get("family_type", "single"), 1.0)
                    base_mean *= util_mult
                elif cat == "Education":
                    edu_mult = {
                        "single": 0.0, "couple": 0.0, "family_kids": 2.0,
                        "joint_family": 1.0, "shared_flat": 0.0,
                    }.get(profile.angles.get("family_type", "single"), 1.0)
                    base_mean *= edu_mult

            # Pick scenario
            scenario_name = _pick_scenario_for_personality(personality, scenarios, overrides)
            scenario_range = _get_scenario_range(scenario_name, scenarios)
            factor = random.uniform(*scenario_range)
            budget_amt = round(base_mean * factor, -1)
            budget_amt = max(budget_amt, 10)

            category_amounts[cat] = budget_amt
            estimated_category_total += budget_amt

        # Write budgets for each month
        for year, month in sorted(year_months):
            # 1. BASE BUDGET (category_id=null, description=null)
            # 20% chance to skip (not all contexts have budgets every month)
            if random.random() < 0.20:
                pass  # still create category budgets below
            else:
                base_amt = round(estimated_category_total * random.uniform(0.85, 1.15), -1)
                base_amt = max(base_amt, 50)
                # ON CONFLICT handles duplicate base budgets from prior runs
                cursor.execute(
                    "INSERT INTO budgets (id, context_id, category_id, month, year, amount, description, created_at, updated_at) "
                    "VALUES (%s,%s,NULL,%s,%s,%s,NULL,%s,%s) ON CONFLICT (context_id, month, year, description) DO NOTHING",
                    (uuid4(), cid, month, year, base_amt, now, now),
                )
                count += 1

            # 2. CATEGORY BUDGETS
            for cat, budget_amt in category_amounts.items():
                if budget_amt <= 0:
                    continue
                cursor.execute(
                    "INSERT INTO budgets (id, context_id, category_id, month, year, amount, description, created_at, updated_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,NULL,%s,%s) ON CONFLICT (context_id, month, year, description) DO NOTHING",
                    (uuid4(), cid, categories[cat], month, year, budget_amt, now, now),
                )
                count += 1

            # 3. TAGGED BUDGET (10-20% of contexts get one tag per month)
            if random.random() < 0.15 and tagged_pool:
                # Re-use scenarios (1 description per context per month)
                tag = random.choice(tagged_pool)
                tag_amt = round(random.uniform(500, 5000) * random.uniform(0.5, 1.5), -1)
                tag_amt = max(tag_amt, 50)
                cursor.execute(
                    "INSERT INTO budgets (id, context_id, category_id, month, year, amount, description, created_at, updated_at) "
                    "VALUES (%s,%s,NULL,%s,%s,%s,%s,%s,%s) ON CONFLICT (context_id, month, year, description) DO NOTHING",
                    (uuid4(), cid, month, year, tag_amt, tag, now, now),
                )
                count += 1

    return count
