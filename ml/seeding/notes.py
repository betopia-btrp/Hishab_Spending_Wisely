"""
Note generation engine with 8 distinct note shapes, mutations,
receipt formatting, Bangla support, and recurring expense cloning.
"""

import random

from .utils import clamp


# ─── Shape selection weights ───
DEFAULT_SHAPE_WEIGHTS = {
    "template_standard": 27,
    "template_bangla": 12,
    "receipt_style": 8,
    "receipt_bangla": 3,
    "recurring_clone": 8,
    "short_abbrev": 7,
    "vendor_only": 5,
    "single_word": 5,
    "combined_multi": 5,
    "emotional_opinion": 3,
    "ambiguous": 2,
    "generic_fallback": 7,
}


def resolve_template(tpl, values):
    """Fill all {placeholders} in a template string."""
    while "{" in tpl:
        a = tpl.index("{")
        b = tpl.index("}", a)
        key = tpl[a + 1:b]
        replacement = str(random.choice(values.get(key, ["?"])))
        tpl = tpl[:a] + replacement + tpl[b + 1:]
    return tpl


def generate_receipt_amt(items, total_amount):
    """Generate receipt line-item prices that sum roughly to total_amount."""
    n = len(items)
    if n == 0:
        return []
    # Random shares
    shares = [random.random() for _ in range(n)]
    total_share = sum(shares)
    amts = [round(total_amount * s / total_share, 2) for s in shares]
    # Adjust last to match total
    diff = round(total_amount - sum(amts), 2)
    amts[-1] = round(amts[-1] + diff, 2)
    if amts[-1] < 1:
        amts[-1] = 1.0
    return amts


def generate_note(category, amount, expense_date, profile, templates, values, cfg,
                  user_recurring_bank=None, shape_weights=None, festival_suffix=None):
    """
    Generate one expense note. Returns (note_text, category_id_override_or_None).

    category may be modified if an ambiguous assignment is triggered.
    festival_suffix is e.g. '_eid', '_durga_puja' for seasonal templates.
    """
    if shape_weights is None:
        shape_weights = DEFAULT_SHAPE_WEIGHTS

    shape_names = list(shape_weights.keys())
    shape_wts = [shape_weights[s] for s in shape_names]
    shape = random.choices(shape_names, weights=shape_wts, k=1)[0]

    note = None
    new_cat = category  # may change for ambiguous

    if shape == "template_standard":
        note = _standard_template(category, templates, values, profile, festival_suffix)

    elif shape == "template_bangla":
        note = _bangla_template(category, templates, values, profile)

    elif shape == "receipt_style":
        note = _receipt_style(category, amount, templates, values, profile)

    elif shape == "receipt_bangla":
        note = _receipt_bangla(category, amount, templates, values, profile)

    elif shape == "recurring_clone":
        note = _recurring_clone(category, expense_date, profile, templates, values,
                                user_recurring_bank)

    elif shape == "short_abbrev":
        note = _short_abbrev(category, templates, values, profile)

    elif shape == "vendor_only":
        note = _vendor_only(category, values, profile)

    elif shape == "single_word":
        note = _single_word(category, values, profile)

    elif shape == "combined_multi":
        note = _combined_multi(category, templates, values, profile)

    elif shape == "emotional_opinion":
        note = _emotional_opinion(category, templates, values)

    elif shape == "ambiguous":
        note, new_cat = _ambiguous_note(templates)

    elif shape == "generic_fallback":
        note = _standard_template(category, templates, values, profile)

    if note is None:
        note = _standard_template(category, templates, values, profile)

    # Apply mutations
    if note is not None:
        note = apply_mutations(note, category, amount, expense_date, cfg.get("note_realism", {}), values)

    if note is None:
        return None, new_cat
    return note[:255], new_cat


# ═══════════════════════════════════════════════════════════════
#  Shape generators
# ═══════════════════════════════════════════════════════════════

def _standard_template(cat, templates, values, profile, festival_suffix=None):
    # During festivals, 60% chance to use festival-specific template
    if festival_suffix:
        festival_key = f"{cat}{festival_suffix}"
        festival_tpls = templates.get("notes", {}).get(festival_key)
        if festival_tpls and random.random() < 0.6:
            tpl = random.choice(festival_tpls)
            return resolve_template(tpl, values)

    tpls = templates.get("notes", {}).get(cat)
    if not tpls:
        tpls = templates.get("notes", {}).get("Others", ["expense"])
    tpl = random.choice(tpls)
    return resolve_template(tpl, values)


def _bangla_template(cat, templates, values, profile):
    tpls = templates.get("bangla_notes", {}).get(cat)
    if not tpls:
        return _standard_template(cat, templates, values, profile)
    tpl = random.choice(tpls)
    # Merge bangla word banks with English values for placeholder resolution
    merged = dict(values)
    bangla_words = templates.get("bangla_words", {})
    for k, v in bangla_words.items():
        if k not in merged:
            merged[k] = v
    return resolve_template(tpl, merged)


def _receipt_style(cat, amount, templates, values, profile):
    tpls = templates.get("receipts", {}).get(cat)
    if not tpls:
        return _standard_template(cat, templates, values, profile)

    tpl = random.choice(tpls)

    # Extract receipt items from the template
    receipt_items = values.get("receipt_item_food", ["item"])
    if cat in ("Shopping", "Entertainment", "Education", "Personal Care"):
        receipt_items = values.get("receipt_item_shopping", ["item"])
    if cat in ("Groceries",):
        receipt_items = values.get("grocery_item", ["item"])

    # Pick 2-3 items for the receipt
    n_items = random.randint(2, 3)
    items = [random.choice(receipt_items) for _ in range(n_items)]
    item_prices = generate_receipt_amt(items, amount)
    qtys = [random.choice(values.get("receipt_qty", ["1"])) for _ in range(n_items)]

    result = tpl
    item_idx, price_idx, qty_idx = 0, 0, 0

    while "{" in result:
        a = result.index("{")
        b = result.index("}", a)
        key = result[a + 1:b]

        if key == "receipt_item_food" or key == "receipt_item_shopping":
            replacement = items[item_idx % len(items)]
            item_idx += 1
        elif key == "receipt_amt":
            replacement = str(item_prices[price_idx % len(item_prices)])
            price_idx += 1
        elif key == "receipt_total":
            replacement = str(amount)
        elif key == "receipt_qty":
            replacement = qtys[qty_idx % len(qtys)]
            qty_idx += 1
        else:
            replacement = str(random.choice(values.get(key, ["?"])))
        result = result[:a] + replacement + result[b + 1:]

    return result


def _receipt_bangla(cat, amount, templates, values, profile):
    # Bangla receipt: use bangla notes with amount formatting
    tpls = templates.get("bangla_notes", {}).get(cat)
    if not tpls:
        return _receipt_style(cat, amount, templates, values, profile)

    tpl = random.choice(tpls)
    result = resolve_template(tpl, values)

    # Append amount in Bangla-style format
    if random.random() < 0.6:
        result = f"{result} — {amount} টাকা"

    return result


def _recurring_clone(cat, expense_date, profile, templates, values, user_bank):
    # Use pre-defined recurring templates from values.yaml
    recurring = values.get("recurring_templates", {}).get(cat)
    if not recurring:
        return _standard_template(cat, templates, values, profile)

    tpl = random.choice(recurring)
    return resolve_template(tpl, values)


def _short_abbrev(cat, templates, values, profile):
    # Use shorthand templates if available
    short_key = f"{cat}_shorthand"
    tpls = templates.get("notes", {}).get(short_key)
    if not tpls:
        generic = templates.get("notes", {}).get("_generic_shorthand", ["paid"])
        tpls = generic

    base = random.choice(tpls)
    result = resolve_template(base, values)

    # Additional abbreviation: remove vowels from longer words
    if random.random() < 0.4 and len(result) > 5:
        words = result.split()
        for i, w in enumerate(words):
            if len(w) > 3 and any(c in "aeiouAEIOU" for c in w):
                words[i] = "".join(c for c in w if c.lower() not in "aeiou")[:5]
        result = " ".join(words)

    return result


def _vendor_only(cat, values, profile):
    """Just the vendor/place name, no description."""
    vendor_map = {
        "Food & Dining": ["restaurant"],
        "Transportation": ["destination"],
        "Groceries": ["store"],
        "Shopping": ["store"],
        "Utilities": ["mobile_operator"],
        "Entertainment": ["cinema", "cafe"],
        "Health & Medical": ["doctor_type"],
        "Education": ["course"],
        "Travel": ["destination"],
        "Personal Care": ["salon"],
        "Others": ["place"],
    }
    keys = vendor_map.get(cat, ["item"])
    key = random.choice(keys)
    pool = values.get(key, ["something"])
    return random.choice(pool)


def _single_word(cat, values, profile):
    """Single-word note — very minimal."""
    word_map = {
        "Food & Dining": ["lunch", "dinner", "breakfast", "snack", "coffee", "tea",
                           "biryani", "burger", "pizza", "kacchi"],
        "Transportation": ["uber", "pathao", "cng", "rickshaw", "bus", "fuel",
                            "parking", "metro"],
        "Groceries": ["groceries", "vegetables", "fruits", "rice", "fish", "meat",
                       "eggs", "milk", "bazaar"],
        "Shopping": ["clothes", "shoes", "phone", "laptop", "shopping", "gift",
                      "electronics"],
        "Utilities": ["electricity", "water", "gas", "internet", "recharge", "bill"],
        "Rent & Housing": ["rent", "repair", "maintenance"],
        "Entertainment": ["movie", "netflix", "game", "spotify", "concert"],
        "Health & Medical": ["medicine", "doctor", "checkup", "test", "pharmacy"],
        "Education": ["tuition", "books", "course", "exam", "fee"],
        "Travel": ["flight", "hotel", "visa", "trip", "tour"],
        "Personal Care": ["haircut", "salon", "spa", "massage"],
        "Others": ["donation", "gift", "cash", "atm", "fee"],
    }
    pool = word_map.get(cat, ["expense", "paid", "item"])
    return random.choice(pool)


def _combined_multi(cat, templates, values, profile):
    """Two+ unrelated things in one note."""
    combined_key = f"{cat}_combined"
    tpls = templates.get("notes", {}).get(combined_key)
    if not tpls:
        return _standard_template(cat, templates, values, profile)
    tpl = random.choice(tpls)
    return resolve_template(tpl, values)


def _emotional_opinion(cat, templates, values):
    """Note with opinionated/emotional language."""
    opinion_key = f"{cat}_opinion"
    tpls = templates.get("notes", {}).get(opinion_key)
    if not tpls:
        return None  # fallback
    tpl = random.choice(tpls)
    return resolve_template(tpl, values)


def _ambiguous_note(templates):
    """Return an ambiguous note with cross-category assignment."""
    notes = templates.get("ambiguous", {}).get("notes", [])
    if not notes:
        return None, None
    entry = random.choice(notes)
    return entry["note"], entry["seed_category"]


# ═══════════════════════════════════════════════════════════════
#  Mutations
# ═══════════════════════════════════════════════════════════════

def apply_mutations(note, category, amount, expense_date, realism_cfg, values):
    """Apply realism mutations to a note: typos, short forms, Bangla, etc."""
    if note is None:
        return None
    if not note or note.strip() == "":
        return note

    r = realism_cfg

    # Null / empty (must be checked first to allow other mutations)
    if random.random() < r.get("null_chance", 0.03):
        return None
    if random.random() < r.get("empty_chance", 0.02):
        return ""

    # Typo mutation
    if random.random() < r.get("typo_chance", 0.05):
        tm = {"a": "s", "s": "a", "l": "k", "k": "l", "n": "m", "m": "n",
              "u": "i", "i": "u", "t": "d", "d": "t", "r": "e", "e": "r"}
        chars = list(note)
        for idx in range(len(chars)):
            if random.random() < 0.03 and chars[idx].lower() in tm:
                rep = tm[chars[idx].lower()]
                chars[idx] = rep.upper() if chars[idx].isupper() else rep
                break
        note = "".join(chars)

    # Short form mutation
    if random.random() < r.get("short_form_chance", 0.10):
        words = note.split()
        for i, w in enumerate(words):
            if len(w) > 4 and random.random() < 0.5:
                words[i] = w[:3] + "."
        note = " ".join(words)

    # Bangla word insertion (into English notes)
    if random.random() < r.get("bangla_chance", 0.08):
        words = note.split()
        if words:
            idx = random.randint(0, len(words) - 1)
            # Look up category directly in values (merged has category→[words] mappings)
            cat_bangla = values.get(category, [])
            if not cat_bangla:
                # Fallback: check bangla_words sub-dict
                bangla_words = values.get("bangla_words", values)
                cat_bangla = bangla_words.get(category, [])
            if cat_bangla:
                words.insert(idx, random.choice(cat_bangla))
                note = " ".join(words)

    # Person reference
    if random.random() < r.get("person_ref_chance", 0.12):
        names = values.get("name", [])
        if names:
            connector = random.choice(["with", "for", "treating", "-"])
            note = f"{note} {connector} {random.choice(names)}"

    # Amount in note
    if random.random() < r.get("amount_in_note_chance", 0.15):
        prefix = random.choice(["Tk", "BDT", "=", "—", "paid"])
        note = f"{note} {prefix} {amount}"

    # Date reference
    if random.random() < r.get("date_ref_chance", 0.05):
        refs = ["yesterday's", "today's", "last week's", "last month's",
                "this week's", "recent"]
        note = f"{random.choice(refs)} {note}"

    # Bangla amount suffix
    if random.random() < r.get("bangla_chance", 0.08) and "টাকা" not in note:
        if random.random() < 0.3:
            note = f"{note} টাকা"

    return note[:255]
