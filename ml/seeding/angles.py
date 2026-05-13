"""
Multi-angle user persona system for realistic expense generation.

Each user is a combination of 8 orthogonal dimensions (angles).
Angles multiply together to shape category preferences, amounts,
templates, temporal patterns, and behavior.
"""

import random
from dataclasses import dataclass, field

from .utils import weighted_choice


@dataclass
class UserProfile:
    """Computed multipliers and behavioral rules for one user."""
    user_id: str
    angles: dict  # raw angle assignments {dimension: value_name}

    # Per-category multipliers (cumulative product of all angles)
    category_mult: dict = field(default_factory=dict)

    # Amount control
    amount_mult: float = 1.0      # income-based amount scaling
    rent_cap: int = 100000         # max plausible rent
    amount_round_to: int = 0       # 0 = no rounding, 10, 50, 100

    # Template and venue control
    venue_pool: str = "dhaka_venues"
    template_tags: set = field(default_factory=set)
    exclude_template_tags: set = field(default_factory=set)

    # Transport mix (ratios of transport sub-types)
    fuel_ratio: float = 0.15
    rideshare_ratio: float = 0.4
    bus_ratio: float = 0.25
    bike_ratio: float = 0.15
    parking_ratio: float = 0.05

    # Behavioral probabilities
    recurring_chance: float = 0.10   # chance a note is cloned from prior
    impulse_chance: float = 0.08     # chance of unplanned expense
    discount_tag_chance: float = 0.10
    delivery_ratio: float = 0.3
    online_shopping_ratio: float = 0.3
    app_ratio: float = 0.3           # Foodpanda/Uber etc.
    cash_ratio: float = 0.5          # vs card/app payment
    subscription_chance: float = 0.2
    bazaar_ratio: float = 0.3
    cafe_ratio: float = 0.15
    group_expense_ratio: float = 0.2

    # Temporal
    hours_peak: list = field(default_factory=lambda: [8, 9, 12, 13, 19, 20])
    weekend_spike: float = 1.0

    # User activity window
    active_start_offset: int = 0      # months from start of range
    active_months: int = 18           # how many months active

    def __repr__(self):
        return f"Profile({self.user_id[:8]}... | {' × '.join(f'{k}={v}' for k,v in self.angles.items())})"


def assign_angles(user_ids, angle_config, pre_assigned=None):
    """
    Assign angles using ordered dimensions with cross-dimension constraints.
    Assignment order: profession → gender → age_group → income_tier → rest.

    pre_assigned: {user_id: {dim: value}} — keep these values as-is,
    only assign remaining dimensions randomly.

    Constraints:
    - profession restricts which age_groups are allowed
    - profession + age_group restricts which income_tiers are allowed
    """
    if pre_assigned is None:
        pre_assigned = {}

    ordered_dims = [
        'profession',
        'gender',
        'age_group',
        'income_tier',
        'family_type', 'city_tier', 'religion', 'lifestyle',
        'transport_mode', 'spending_personality', 'tech_adoption',
    ]

    # Generic constraint map: {dim_to_constrain: (source_dim, field_name)}
    SIMPLE_CONSTRAINTS = {
        'family_type':      ('age_group', 'allowed_family_types'),
        'city_tier':        ('profession', 'allowed_city_tiers'),
        'lifestyle':        ('age_group', 'allowed_lifestyles'),
        'tech_adoption':    ('profession', 'allowed_tech_adoption'),
    }

    def _get_allowed(dim, angles, angle_config, pre_assigned, uid):
        if dim == 'profession':
            user_gender = pre_assigned.get(uid, {}).get('gender')
            if user_gender:
                profs = angle_config.get('profession', {})
                allowed = [
                    pn for pn, pe in profs.items()
                    if 'allowed_genders' not in pe or user_gender in pe['allowed_genders']
                ]
                if allowed:
                    return allowed
        elif dim == 'age_group':
            prof = angles.get('profession')
            prof_entry = angle_config.get('profession', {}).get(prof, {})
            allowed = prof_entry.get('allowed_age_groups')
            if allowed:
                return allowed
        elif dim == 'income_tier':
            prof = angles.get('profession')
            age = angles.get('age_group')
            prof_entry = angle_config.get('profession', {}).get(prof, {})
            curve = prof_entry.get('income_curve', {})
            allowed = curve.get(age)
            if allowed:
                return allowed
        elif dim == 'transport_mode':
            # Intersection of age_group and city_tier constraints
            age = angles.get('age_group')
            city = angles.get('city_tier')
            age_allowed = (
                angle_config.get('age_group', {}).get(age, {}).get('allowed_transport_modes')
            ) if age else None
            city_allowed = (
                angle_config.get('city_tier', {}).get(city, {}).get('allowed_transport_modes')
            ) if city else None
            if age_allowed and city_allowed:
                inter = [v for v in age_allowed if v in city_allowed]
                return inter if inter else None
            elif age_allowed:
                return age_allowed
            elif city_allowed:
                return city_allowed
        elif dim in SIMPLE_CONSTRAINTS:
            src_dim, field = SIMPLE_CONSTRAINTS[dim]
            src_val = angles.get(src_dim)
            src_entry = angle_config.get(src_dim, {}).get(src_val, {})
            allowed = src_entry.get(field)
            if allowed:
                return allowed
        return None

    angle_map = {}
    for uid in user_ids:
        angles = dict(pre_assigned.get(uid, {}))
        for dim in ordered_dims:
            if dim in angles:
                continue
            values = angle_config.get(dim, {})
            if not values:
                continue
            value_names = list(values.keys())
            weights = [values[v].get("weight", 1) for v in value_names]

            allowed = _get_allowed(dim, angles, angle_config, pre_assigned, uid)
            if allowed:
                filtered = [(n, w) for n, w in zip(value_names, weights) if n in allowed]
                if filtered:
                    value_names, weights = zip(*filtered)

            chosen = weighted_choice(list(value_names), list(weights))
            angles[dim] = chosen
        angle_map[uid] = angles
    return angle_map


def compute_profiles(user_ids, angle_map, angle_config):
    """
    Compute full UserProfile for each user given their assigned angles.
    """
    profiles = {}
    for uid in user_ids:
        angles = angle_map[uid]
        profile = UserProfile(user_id=uid, angles=angles)

        # Start with category multipliers at 1.0
        cats = [
            "Food & Dining", "Transportation", "Groceries", "Shopping",
            "Utilities", "Rent & Housing", "Entertainment", "Health & Medical",
            "Education", "Travel", "Personal Care", "Others"
        ]
        cat_mult = {c: 1.0 for c in cats}

        for dim, val_name in angles.items():
            entry = angle_config[dim][val_name]

            # --- Profession multipliers ---
            if "food_transport_mult" in entry:
                cat_mult["Food & Dining"] *= entry.get("food_transport_mult", 1.0)
                cat_mult["Transportation"] *= entry.get("food_transport_mult", 1.0)
            if "grocery_mult" in entry:
                cat_mult["Groceries"] *= entry["grocery_mult"]
            if "entertainment_mult" in entry:
                cat_mult["Entertainment"] *= entry["entertainment_mult"]
            if "education_mult" in entry:
                cat_mult["Education"] *= entry["education_mult"]
            if "shopping_mult" in entry:
                cat_mult["Shopping"] *= entry["shopping_mult"]
            if "travel_mult" in entry:
                cat_mult["Travel"] *= entry["travel_mult"]
            if "health_mult" in entry:
                cat_mult["Health & Medical"] *= entry["health_mult"]

            # --- Income multipliers ---
            if "amount_mult" in entry:
                profile.amount_mult *= entry["amount_mult"]
            if "rent_cap" in entry:
                profile.rent_cap = entry["rent_cap"]
            if "travel_freq" in entry:
                cat_mult["Travel"] *= entry["travel_freq"]

            # --- Family type ---
            if "grocery_mult" in entry and dim == "family_type":
                cat_mult["Groceries"] *= entry["grocery_mult"]
            if "utility_mult" in entry:
                cat_mult["Utilities"] *= entry["utility_mult"]
            if "rent_mult" in entry:
                cat_mult["Rent & Housing"] *= entry["rent_mult"]
            if "housing_mult" in entry:
                cat_mult["Rent & Housing"] *= entry["housing_mult"]
            if "education_mult" in entry and dim == "family_type":
                cat_mult["Education"] *= entry["education_mult"]

            # --- Lifestyle / Age Group ---
            if "dining_out_mult" in entry:
                cat_mult["Food & Dining"] *= entry["dining_out_mult"]
            if "weekend_spike" in entry:
                profile.weekend_spike = entry["weekend_spike"]
            if "online_shopping_mult" in entry:
                profile.online_shopping_ratio = entry.get("online_shopping_mult", 1.0)
            if "cafe_mult" in entry:
                profile.cafe_ratio = entry.get("cafe_mult", 0.15)
            if "app_mult" in entry:
                profile.app_ratio = entry.get("app_mult", 0.3)
            if "shopping_mult" in entry and dim == "lifestyle":
                cat_mult["Shopping"] *= entry["shopping_mult"]
            if "entertainment_mult" in entry and dim == "lifestyle":
                cat_mult["Entertainment"] *= entry["entertainment_mult"]
            if "travel_mult" in entry and dim == "lifestyle":
                cat_mult["Travel"] *= entry["travel_mult"]
            if "health_mult" in entry:
                cat_mult["Health & Medical"] *= entry["health_mult"]
            if "supplement_mult" in entry:
                cat_mult["Health & Medical"] *= entry.get("supplement_mult", 1.0)
            if "transport_mult" in entry:
                cat_mult["Transportation"] *= entry["transport_mult"]
            if "online_sub_mult" in entry:
                profile.subscription_chance = entry.get("online_sub_mult", 0.2)
            if "delivery_mult" in entry:
                profile.delivery_ratio = entry.get("delivery_mult", 0.3)
            if "rideshare_mult" in entry:
                profile.rideshare_ratio = entry.get("rideshare_mult", 0.4)
            if "kids_items_mult" in entry:
                cat_mult["Shopping"] *= entry.get("kids_items_mult", 1.0)
            if "group_expense_mult" in entry:
                profile.group_expense_ratio = entry["group_expense_mult"]

            # --- Transport mode ---
            if "fuel_ratio" in entry:
                profile.fuel_ratio = entry["fuel_ratio"]
            if "rideshare_ratio" in entry and dim == "transport_mode":
                profile.rideshare_ratio = entry["rideshare_ratio"]
            if "bus_ratio" in entry and dim == "transport_mode":
                profile.bus_ratio = entry["bus_ratio"]
            if "bike_ratio" in entry and dim == "transport_mode":
                profile.bike_ratio = entry["bike_ratio"]
            if "parking_ratio" in entry and dim == "transport_mode":
                profile.parking_ratio = entry["parking_ratio"]

            # --- Spending personality ---
            if "amount_round_to" in entry:
                profile.amount_round_to = entry["amount_round_to"]
            if "recurring_chance" in entry:
                profile.recurring_chance = entry.get("recurring_chance", 0.10)
            if "impulse_chance" in entry:
                profile.impulse_chance = entry.get("impulse_chance", 0.08)
            if "discount_tag_chance" in entry:
                profile.discount_tag_chance = entry.get("discount_tag_chance", 0.10)
            if "bazaar_ratio" in entry:
                profile.bazaar_ratio = entry.get("bazaar_ratio", 0.3)

            # --- Tech adoption ---
            if "foodpanda_ratio" in entry:
                profile.app_ratio = entry.get("foodpanda_ratio", 0.3)
            if "cash_ratio" in entry:
                profile.cash_ratio = entry.get("cash_ratio", 0.5)
            if "online_shopping_ratio" in entry and dim == "tech_adoption":
                profile.online_shopping_ratio = entry.get("online_shopping_ratio", 0.3)
            if "subscription_chance" in entry:
                profile.subscription_chance = entry.get("subscription_chance", 0.2)

            # --- City tier ---
            if "venue_pool" in entry:
                profile.venue_pool = entry["venue_pool"]
            if "transport_modes" in entry:
                pass  # used by temporal/note generation

            # --- Hours ---
            if "hours_peak" in entry:
                profile.hours_peak = entry["hours_peak"]

            # --- Template tags ---
            if "template_tags" in entry:
                profile.template_tags.update(entry["template_tags"])

        # Store computed category multipliers
        profile.category_mult = cat_mult
        profiles[uid] = profile

    return profiles


def build_user_weight_list(user_ids, profiles, power_user_ratio=0.20, power_share=0.60):
    """
    Build a weighted list of user_ids for expense generation,
    following an 80-20 power law: power users create 60% of expenses.

    Returns (weighted_user_ids, weights) for random.choices.
    """
    n = len(user_ids)
    n_power = max(1, int(n * power_user_ratio))
    n_casual = n - n_power

    # Shuffle and pick
    shuffled = list(user_ids)
    random.shuffle(shuffled)
    power_users = set(shuffled[:n_power])
    casual_users = set(shuffled[n_power:])

    # Total weight = 1.0; power users share power_share, casual share rest
    power_weight_per_user = power_share / n_power
    casual_weight_per_user = (1.0 - power_share) / n_casual

    weights = []
    weighted_ids = []
    for uid in user_ids:
        weighted_ids.append(uid)
        if uid in power_users:
            weights.append(power_weight_per_user)
        else:
            weights.append(casual_weight_per_user)

    return weighted_ids, weights
