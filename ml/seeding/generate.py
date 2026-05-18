#!/usr/bin/env python3
"""
SpendWise — Realistic Data Seeding Script v2
Multi-angle user personas, 10 note shapes, scenario budgets.

Usage:
  cd expense-management-api
  python -m ml.seeding.generate               # full 1M
  python -m ml.seeding.generate --expenses 100000  # quick test
  python -m ml.seeding.generate --skip-base   # if base data exists
  python -m ml.seeding.generate --test        # 1000 expenses for quick test
"""

import hashlib
import os
import random
import string
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta

import numpy as np
import psycopg2
import psycopg2.extras

# Handle both direct script and module execution
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if __package__ is None:
    sys.path.insert(0, os.path.dirname(_SCRIPT_DIR))
    from seeding.angles import assign_angles, build_user_weight_list, compute_profiles
    from seeding.budgets import generate_budgets
    from seeding.notes import generate_note
    from seeding.temporal import (
        apply_ramadan_hourly_weight,
        apply_salary_day_weight,
        apply_velocity_weight,
        assign_active_ranges,
        assign_velocity_profiles,
        build_weighted_date_list,
        is_ramadan,
    )
    from seeding.utils import load_yaml, uuid4
else:
    from .angles import assign_angles, build_user_weight_list, compute_profiles
    from .budgets import generate_budgets
    from .notes import generate_note
    from .temporal import (
        apply_ramadan_hourly_weight,
        apply_salary_day_weight,
        apply_velocity_weight,
        assign_active_ranges,
        assign_velocity_profiles,
        build_weighted_date_list,
        is_ramadan,
    )
    from .utils import load_yaml, uuid4


# ─── Module-level globals ───
BASE_DIR = _SCRIPT_DIR

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5435,
    "dbname": "spendwise",
    "user": "spendwise",
    "password": "spendwise",
}


def _load_templates():
    """Load all template and value files."""
    tpl_dir = os.path.join(BASE_DIR, "templates")
    bangla_words = load_yaml(os.path.join(tpl_dir, "bangla_words.yaml"))

    return {
        "notes": load_yaml(os.path.join(tpl_dir, "notes.yaml")),
        "values": load_yaml(os.path.join(tpl_dir, "values.yaml")),
        "bangla_words": bangla_words,
        "bangla_notes": load_yaml(os.path.join(tpl_dir, "bangla_notes.yaml")),
        "receipts": load_yaml(os.path.join(tpl_dir, "receipts.yaml")),
        "ambiguous": load_yaml(os.path.join(tpl_dir, "ambiguous.yaml")),
        "venue_banks": load_yaml(os.path.join(tpl_dir, "venue_banks.yaml")),
        # Merged: English + Bangla value banks for placeholder resolution
        "_merged_values": {
            **load_yaml(os.path.join(tpl_dir, "values.yaml")),
            **bangla_words,
        },
    }


# ═══════════════════════════════════════════════════════════════
#  Base Entity Seeding
# ═══════════════════════════════════════════════════════════════


def seed_users(cursor, cfg):
    """Generate and insert user records. Returns (users, pre_assigned)."""

    # Full names by religion (male) — from user-provided list
    MALE_FULL_NAMES = {
        "muslim": [
            "Mohammad Abdur Rahman",
            "Md. Tariqul Islam",
            "Sheikh Muhammad Jahangir",
            "Abu Bakar Siddique",
            "Md. Nurul Haque",
            "Mohammad Saiful Islam",
            "Md. Mizanur Rahman",
            "A.K.M. Shamsul Huda",
            "Mohammad Rafiqul Islam",
            "Md. Habibur Rahman",
            "Kazi Nazrul Islam",
            "Mohammad Anisur Rahman",
            "Md. Shahadat Hossain",
            "Abu Naeem Mohammad Faizullah",
            "Md. Golam Mostafa",
            "Mohammad Mahbubur Rahman",
            "Md. Lutfur Rahman",
            "Sheikh Farid Uddin Ahmed",
            "Mohammad Zahirul Haque",
            "Md. Rezaul Karim",
            "Md. Khurshidul Alam",
            "Mohammad Moniruzzaman",
            "Md. Shafiqul Islam",
            "Molla Abul Kalam Azad",
            "Md. Enamul Haque",
            "Mohammad Ashrafuzzaman",
            "Md. Belal Hossain",
            "Abu Talha Mohammad Yunus",
            "Md. Shamsul Alam",
            "Mohammad Atiqur Rahman",
            "Md. Kamruzzaman",
            "Sheikh Abdus Salam",
            "Md. Moshiur Rahman",
            "Mohammad Faruk Hossain",
            "Md. Jahurul Islam",
            "Abu Hena Mustafa Kamal",
            "Mohammad Delwar Hossain",
            "Md. Sabbir Ahmed",
            "Mohammad Nazimuddin",
            "Md. Aminul Islam",
        ],
        "hindu": [
            "Rajesh Kumar Sharma",
            "Biplab Chandra Das",
            "Sunil Kanti Roy",
            "Nikhil Ranjan Dey",
            "Prodip Kumar Ghosh",
            "Ashok Kumar Saha",
            "Bimal Chandra Pal",
            "Kamal Krishna Sen",
            "Dulal Chandra Biswas",
            "Ranjit Kumar Halder",
            "Tapan Kumar Mondal",
            "Subhas Chandra Bose",
            "Nirmal Chandra Datta",
            "Gobinda Chandra Nath",
            "Pranab Kumar Debnath",
            "Swapan Kumar Chakraborty",
            "Hiren Chandra Sarkar",
            "Dilip Kumar Mandal",
            "Anil Chandra Shil",
            "Uttam Kumar Poddar",
            "Binoy Krishna Bhadra",
            "Samir Chandra Gope",
            "Amitabh Ranjan Barua",
            "Sushil Kumar Talukdar",
            "Mrinal Kanti Sinha",
            "Pankaj Kumar Chowdhury",
            "Debashish Chandra Guha",
            "Bikash Chandra Majumder",
            "Ratan Lal Sutradhar",
            "Naresh Chandra Basak",
            "Sanjib Kumar Kundu",
            "Dipankar Chandra Banik",
            "Arun Kumar Adhikari",
            "Parimal Chandra Karmakar",
            "Sisir Kumar Palit",
            "Rabindra Nath Roy",
            "Hemanta Kumar Bain",
            "Khokon Chandra Das",
            "Netai Chandra Biswas",
            "Jyotish Chandra Rishi",
        ],
        "buddhist": [
            "Suddhananda Mahathero Barua",
            "Priya Ratan Barua",
            "Bikash Chandra Chakma",
            "Surjya Kumar Marma",
            "Prem Lal Tripura",
            "Bodhi Ranjan Barua",
            "Ananda Mitra Chakma",
            "Naba Kumar Tanchangya",
            "Dharma Jyoti Barua",
            "Shuvo Ratan Marma",
            "Mong Shwe Prue Marma",
            "Kushal Chandra Chakma",
            "Dipankar Bhikkhu Barua",
            "Rana Bikram Tripura",
            "Subarna Kanti Barua",
            "Ching Mong Marma",
            "Jibon Chakma",
            "Nirban Ranjan Barua",
            "Prajna Lal Chakma",
            "Arjun Kumar Tanchangya",
            "Metta Priya Barua",
            "Thui Prue Marma",
            "Saddha Ranjan Chakma",
            "Lokesh Chandra Barua",
            "Mong Sanu Marma",
            "Karuna Sindhu Chakma",
            "Prajnananda Thero Barua",
            "Ripon Chakma",
            "Suman Kanti Tripura",
            "Bikram Jit Barua",
            "Tun Mong Marma",
            "Amrita Lal Chakma",
            "Sangha Priya Barua",
            "Rishi Kumar Tanchangya",
            "Chandra Kirti Barua",
            "Mong Prue Kyaw Marma",
            "Shanti Ranjan Chakma",
            "Gyan Tilak Barua",
            "Lalita Mohan Tripura",
            "Vipassana Ratan Barua",
        ],
        "christian": [
            "Joseph Rozario",
            "Francis Xavier Gomes",
            "Anthony Pius Costa",
            "Michael Patrick D'Rozario",
            "John Baptist Rebeiro",
            "Peter Paul Mondol",
            "Thomas Augustine Halder",
            "James Cornelius Rodrigues",
            "David Solomon Biswas",
            "Stephen Clement Baroi",
            "Christopher Robin Mridha",
            "Benedict Simon Patro",
            "Andrew Martin Gomes",
            "Lawrence Bernard Costa",
            "Matthew Jerome D'Costa",
            "Philip Augustine Rebeiro",
            "Samuel George Mondal",
            "Daniel Patrick Rodrigues",
            "Joshua Emmanuel Baroi",
            "Nathan Abraham Halder",
            "Gabriel Pius Mridha",
            "Raphael Anthony Costa",
            "Emmanuel Simon Gomes",
            "Ignatius Paul D'Rozario",
            "Sebastian Martin Rebeiro",
            "Patrick Bernard Mondal",
            "Gerald Augustine Biswas",
            "Cornelius Joseph Halder",
            "Barnabas Simon Rodrigues",
            "Tobias Peter Baroi",
            "Elias John Mridha",
            "Isaac Stephen Costa",
            "Jacob Paul Gomes",
            "Ezra Philip D'Costa",
            "Moses Thomas Rebeiro",
            "Abel Jerome Mondal",
            "Noah Martin Biswas",
            "Aaron Emmanuel Baroi",
            "Caleb Solomon Halder",
            "Ruben Gabriel Rodrigues",
        ],
    }

    # Female first names by religion + shared family name pools
    FEMALE_FIRST = {
        "muslim": [
            "Sadia",
            "Nusrat",
            "Nazia",
            "Mou",
            "Sumaiya",
            "Ayesha",
            "Fatima",
            "Jannat",
            "Sharmin",
            "Tania",
            "Nahar",
            "Runa",
            "Selina",
            "Hasina",
            "Rokeya",
            "Nadia",
            "Sajeda",
            "Parvin",
            "Shahnaz",
            "Jesmin",
            "Nasrin",
            "Kulsum",
            "Asma",
            "Hosneara",
            "Khaleda",
            "Shirin",
            "Rahima",
            "Fatema",
            "Maleka",
            "Razia",
        ],
        "hindu": [
            "Shanta",
            "Bina",
            "Shampa",
            "Rina",
            "Mina",
            "Shikha",
            "Shobha",
            "Purnima",
            "Swapna",
            "Kajol",
            "Sharmila",
            "Tanushree",
            "Shreya",
            "Rupali",
            "Sipra",
            "Anjana",
            "Kakoli",
            "Deepa",
            "Moushumi",
        ],
        "buddhist": [
            "Kumud",
            "Panna",
            "Ratna",
            "Shanti",
            "Suchitra",
            "Rita",
            "Mala",
            "Purnima",
            "Anita",
        ],
        "christian": [
            "Mary",
            "Sarah",
            "Ruth",
            "Martha",
            "Elizabeth",
            "Helen",
            "Anne",
            "Christina",
            "Rebecca",
            "Lily",
            "Nina",
            "Natalie",
        ],
    }

    FAMILY = {
        "muslim": [
            "Rahman",
            "Islam",
            "Hossain",
            "Chowdhury",
            "Hasan",
            "Ali",
            "Khan",
            "Sarker",
            "Mollah",
            "Sheikh",
            "Haque",
            "Mahmud",
            "Mirza",
            "Kabir",
            "Alam",
            "Faruque",
            "Hussain",
            "Talukdar",
            "Ahmed",
            "Karim",
            "Azad",
            "Salam",
        ],
        "hindu": [
            "Das",
            "Roy",
            "Dey",
            "Ghosh",
            "Saha",
            "Pal",
            "Sen",
            "Biswas",
            "Halder",
            "Mondal",
            "Bose",
            "Datta",
            "Nath",
            "Debnath",
            "Chakraborty",
            "Sarkar",
            "Mandal",
            "Shil",
            "Poddar",
            "Sinha",
            "Mazumder",
            "Guha",
            "Banik",
            "Karmakar",
            "Sutradhar",
            "Basak",
            "Kundu",
            "Adhikari",
            "Rishi",
        ],
        "buddhist": [
            "Barua",
            "Chakma",
            "Marma",
            "Tripura",
            "Tanchangya",
        ],
        "christian": [
            "Rozario",
            "Gomes",
            "Costa",
            "D'Rozario",
            "Rebeiro",
            "Mondol",
            "Halder",
            "Rodrigues",
            "Biswas",
            "Baroi",
            "Mridha",
            "Patro",
            "D'Costa",
        ],
    }

    cursor.execute("SELECT id, name FROM plans")
    plan_rows = cursor.fetchall()
    plan_ids = [r[0] for r in plan_rows]
    free_plan = plan_ids[0]
    pro_plan = plan_ids[1] if len(plan_ids) > 1 else plan_ids[0]

    users, emails = [], set()
    pre_assigned = {}  # {uid: {dim: value}} — passed to assign_angles later

    for _ in range(cfg["base_users"]):
        uid = uuid4()

        # Pick gender + religion (weights match config.yaml)
        gender = random.choices(["male", "female"], weights=[50, 50], k=1)[0]
        religion = random.choices(
            ["muslim", "hindu", "buddhist", "christian"], weights=[70, 18, 7, 5], k=1
        )[0]

        # Build full name from matching pools
        if gender == "male":
            name = random.choice(MALE_FULL_NAMES[religion])
        else:
            first = random.choice(FEMALE_FIRST[religion])
            last = random.choice(FAMILY[religion])
            name = f"{first} {last}"

        email_name = name.lower().replace(".", "").replace(" ", ".").replace("'", "").replace("-", "")
        email = f"{email_name}{random.randint(1, 999)}@example.com"
        while email in emails:
            email = (
                f"{first.lower()}.{last.lower()}{random.randint(1, 999)}@example.com"
            )
        emails.add(email)

        premium = random.random() < 0.3
        pre_assigned[uid] = {"gender": gender, "religion": religion}

        # Spread user signups across 24 months with S-curve growth
        user_idx = len(users)
        growth_curve = [
            1,
            1,
            1,
            1,
            1,
            2,
            2,
            3,
            4,
            5,
            7,
            7,
            7,
            6,
            5,
            4,
            3,
            2,
            2,
            2,
            2,
            2,
            2,
            2,
        ]
        month_bucket = min(user_idx // 42, 23)
        month_offset = sum(growth_curve[:month_bucket]) * 30 + random.randint(0, 29)
        user_created = date(2024, 6, 1) + timedelta(days=month_offset)

        password_hash = "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"
        users.append(
            {
                "id": uid,
                "plan_id": pro_plan if premium else free_plan,
                "name": name,
                "email": email,
                "password": password_hash,
                "is_premium": premium,
                "created_at": user_created,
            }
        )

    # Batch insert
    cols = [
        "id",
        "plan_id",
        "name",
        "email",
        "password",
        "is_premium",
        "created_at",
        "updated_at",
    ]
    rows = []
    for u in users:
        rows.append(
            (
                u["id"],
                u["plan_id"],
                u["name"],
                u["email"],
                u["password"],
                u["is_premium"],
                u["created_at"],
                u["created_at"],
            )
        )

    cursor.executemany(
        f"INSERT INTO users ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))}) "
        f"ON CONFLICT (id) DO NOTHING",
        rows,
    )
    return users, pre_assigned


def seed_contexts_and_members(cursor, users, cfg):
    """Generate contexts and members. Returns (contexts, members) as list of dicts."""
    contexts, members = [], []

    # Personal contexts (one per user)
    for u in users:
        cid = uuid4()
        ctx_date = u["created_at"] + timedelta(hours=random.randint(1, 48))
        contexts.append(
            {
                "id": cid,
                "owner_id": u["id"],
                "name": "Personal",
                "type": "personal",
                "description": "Personal expenses",
                "invite_code": None,
                "created_at": ctx_date,
            }
        )
        members.append(
            {
                "id": uuid4(),
                "context_id": cid,
                "user_id": u["id"],
                "role": "admin",
                "status": "active",
                "created_at": ctx_date,
            }
        )

    # Group contexts
    gnames = [
        "House Expenses",
        "Trip Fund",
        "Team Lunch",
        "Family Budget",
        "Office Pool",
        "Flat Share",
        "Friends Outing",
        "Project Fund",
        "Vacation Club",
        "Wedding Gift",
        "Birthday Pool",
        "Utility Share",
        "Dining Club",
        "Road Trip",
        "Weekend Hangs",
        "Groceries Share",
        "College Group",
        "Bashundhara Flat",
        "Qurbani Fund",
        "Iftar Party",
    ]
    for i in range(cfg["base_group_contexts"]):
        owner = random.choice(users)
        cid = uuid4()
        name = random.choice(gnames)
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
        seed = int(hashlib.md5(cid.encode()).hexdigest()[:4], 16)
        days_offset = seed % 700
        ctx_date = date(2024, 6, 1) + timedelta(days=days_offset)
        contexts.append(
            {
                "id": cid,
                "owner_id": owner["id"],
                "name": name,
                "type": "group",
                "description": f"Shared {name.lower()} tracking",
                "invite_code": code,
                "created_at": ctx_date,
            }
        )
        members.append(
            {
                "id": uuid4(),
                "context_id": cid,
                "user_id": owner["id"],
                "role": "admin",
                "status": "active",
                "created_at": ctx_date,
            }
        )

    # Add members to groups
    for ctx in contexts:
        if ctx["type"] != "group":
            continue
        existing = {m["user_id"] for m in members if m["context_id"] == ctx["id"]}
        pool = [u for u in users if u["id"] not in existing]
        count = min(random.randint(2, 8), len(pool))
        if count < 1:
            continue
        chosen = random.sample(pool, count)
        for u in chosen:
            status = "active"
            if random.random() < cfg.get("user_assignment", {}).get(
                "pending_member_chance", 0.03
            ):
                status = "pending"
            elif random.random() < cfg.get("user_assignment", {}).get(
                "inactive_member_chance", 0.05
            ):
                status = "removed"
            members.append(
                {
                    "id": uuid4(),
                    "context_id": ctx["id"],
                    "user_id": u["id"],
                    "role": "member",
                    "status": status,
                    "created_at": ctx["created_at"],
                }
            )

    # Batch insert contexts
    ctx_flat = []
    for c in contexts:
        ctx_flat.extend(
            [
                c["id"],
                c["owner_id"],
                c["name"],
                c["type"],
                c["description"],
                c["invite_code"],
                c["created_at"],
                c["created_at"],
            ]
        )
    placeholders = ",".join(["(%s,%s,%s,%s,%s,%s,%s,%s)"] * len(contexts))
    cursor.execute(
        f"INSERT INTO contexts (id, owner_id, name, type, description, invite_code, created_at, updated_at) "
        f"VALUES {placeholders} ON CONFLICT (id) DO NOTHING",
        ctx_flat,
    )

    # Batch insert members
    mem_flat = []
    for m in members:
        mem_flat.extend(
            [
                m["id"],
                m["context_id"],
                m["user_id"],
                m["role"],
                m["status"],
                m["created_at"],
                m["created_at"],
            ]
        )
    placeholders = ",".join(["(%s,%s,%s,%s,%s,%s,%s)"] * len(members))
    cursor.execute(
        f"INSERT INTO context_members (id, context_id, user_id, role, status, created_at, updated_at) "
        f"VALUES {placeholders} ON CONFLICT (id) DO NOTHING",
        mem_flat,
    )

    return contexts, members


# ═══════════════════════════════════════════════════════════════
#  Expense Generation Helpers
# ═══════════════════════════════════════════════════════════════


def pick_context_for_user(user_id, contexts, member_map):
    """Pick a context for this user's expense, respecting membership."""
    user_contexts = []
    for ctx in contexts:
        cid = ctx["id"]
        if user_id in member_map.get(cid, set()):
            user_contexts.append(ctx)
    if not user_contexts:
        return random.choice(contexts)
    return random.choice(user_contexts)


def determine_split_type(ctx_type, member_count):
    """Determine split type based on context type and member count."""
    if ctx_type == "personal" or member_count <= 1:
        return "none"
    if member_count <= 2:
        return random.choices(["none", "equal", "custom"], weights=[30, 50, 20], k=1)[0]
    else:
        return random.choices(
            ["none", "equal", "custom", "percentage"], weights=[20, 50, 20, 10], k=1
        )[0]


def settle_by_age(expense_date, base_chance=0.85):
    """Older expenses are more likely settled."""
    if isinstance(expense_date, datetime):
        expense_date = expense_date.date()
    days_old = (date.today() - expense_date).days
    if days_old < 7:
        return random.random() < 0.40
    elif days_old < 30:
        return random.random() < 0.75
    elif days_old < 90:
        return random.random() < 0.90
    else:
        return random.random() < 0.95


def get_active_festival(d, seasonal_periods):
    """Return the active festival period for a given date, if any."""
    y = d.year
    for sp in seasonal_periods:
        try:
            sp_s = date(y, sp["start_month"], sp["start_day"])
            sp_e = date(y, sp["end_month"], sp["end_day"])
            if sp_s <= d <= sp_e:
                return sp
        except (ValueError, KeyError):
            pass
    return None


def get_festival_template_suffix(festival):
    """Map festival name to template suffix for festival-specific notes."""
    name = festival.get("name", "").lower()
    if "durga puja" in name:
        return "_durga_puja"
    elif "kali puja" in name or "diwali" in name:
        return "_puja_diwali"
    elif "christmas" in name:
        return "_christmas"
    elif "easter" in name:
        return "_christmas"
    elif "eid" in name:
        return "_eid"
    elif "buddha" in name:
        return "_buddha_purnima"
    return None


def round_amount(amt, round_to):
    """Round amount to nearest N. 0 means no rounding."""
    if round_to <= 0:
        return round(amt, 2)
    return round(round(amt) / round_to) * round_to


def write_splits(fs, split_type, members_here, eid, amt, created_at, creator=None):
    """Generate and write split records. Returns count of splits."""
    total = 0
    if split_type == "none" or not members_here:
        return 0

    if split_type == "equal":
        share = round(amt / len(members_here), 2)
        remaining = round(amt - share * len(members_here), 2)
        for sm in members_here:
            sa = round(share + remaining, 2) if sm == creator else share
            fs.write(
                f"{uuid4()}\t{eid}\t{sm}\t{sa:.2f}\tNULL\t"
                f"{created_at.isoformat()}\t{created_at.isoformat()}\n"
            )
            total += 1

    elif split_type == "custom":
        remaining = amt
        for j, sm in enumerate(members_here):
            if j == len(members_here) - 1:
                sa = round(remaining, 2)
            else:
                sa = round(
                    random.uniform(1, max(1, remaining / (len(members_here) - j) * 2)),
                    2,
                )
                sa = min(sa, remaining - 0.01 * (len(members_here) - j - 1))
            remaining -= sa
            if sa > 0.01:
                fs.write(
                    f"{uuid4()}\t{eid}\t{sm}\t{sa:.2f}\tNULL\t"
                    f"{created_at.isoformat()}\t{created_at.isoformat()}\n"
                )
                total += 1

    elif split_type == "percentage":
        remaining_pct = 100.0
        for j, sm in enumerate(members_here):
            if j == len(members_here) - 1:
                pct = round(remaining_pct, 2)
            else:
                pct = round(
                    random.uniform(5, remaining_pct / (len(members_here) - j) * 2), 2
                )
                pct = min(pct, remaining_pct - 1)
            remaining_pct -= pct
            sa = round(amt * pct / 100, 2)
            fs.write(
                f"{uuid4()}\t{eid}\t{sm}\t{sa:.2f}\t{pct:.2f}\t"
                f"{created_at.isoformat()}\t{created_at.isoformat()}\n"
            )
            total += 1

    return total


# ═══════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--expenses", type=int, default=1_000_000)
    parser.add_argument("--output", default=os.path.join(BASE_DIR, "output"))
    parser.add_argument("--skip-base", action="store_true")
    parser.add_argument(
        "--test", action="store_true", help="Run with 1000 for quick test"
    )
    args = parser.parse_args()

    if args.test:
        args.expenses = 1000

    os.makedirs(args.output, exist_ok=True)
    N = args.expenses

    print("=" * 60, flush=True)
    print(f"SpendWise Data Seeder v2 — {N:,} expenses", flush=True)
    print("=" * 60, flush=True)

    # ── Load config & templates ──
    cfg = load_yaml(os.path.join(BASE_DIR, "config.yaml"))
    tpls = _load_templates()

    # ── DB Connect ──
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    print("[1/6] Connected to DB", flush=True)

    # Seed plans + categories if empty (standalone mode — no Laravel dependency)
    cursor.execute("SELECT id, name FROM plans")
    plan_rows = cursor.fetchall()
    if not plan_rows:
        print("  Seeding plans...", flush=True)
        cursor.execute(
            "INSERT INTO plans (id, name, price_monthly, price_yearly, max_groups, max_members_per_group) "
            "VALUES (gen_random_uuid(), 'free', 0, 0, 1, 4), "
            "(gen_random_uuid(), 'pro', 9.99, 99.99, 999, 999) RETURNING id, name"
        )
        plan_rows = cursor.fetchall()
        conn.commit()
    plan_ids = [r[0] for r in plan_rows]

    cursor.execute(
        "SELECT id, name FROM categories WHERE is_system = true ORDER BY name"
    )
    cat_rows = cursor.fetchall()
    if not cat_rows:
        print("  Seeding system categories...", flush=True)
        CATEGORY_LIST = [
            "Food & Dining",
            "Transportation",
            "Groceries",
            "Shopping",
            "Utilities",
            "Rent & Housing",
            "Entertainment",
            "Health & Medical",
            "Education",
            "Travel",
            "Personal Care",
            "Others",
        ]
        for name in CATEGORY_LIST:
            cursor.execute(
                "INSERT INTO categories (id, name, is_system, created_at, updated_at) "
                "VALUES (gen_random_uuid(), %s, true, NOW(), NOW())",
                (name,),
            )
        conn.commit()
        # Re-fetch
        cursor.execute(
            "SELECT id, name FROM categories WHERE is_system = true ORDER BY name"
        )
        cat_rows = cursor.fetchall()
    categories = {r[1]: r[0] for r in cat_rows}
    cat_names = list(categories.keys())

    # Base category weights and amount configs
    base_cat_weights = np.array(
        [cfg["category_weights"].get(n, 1) for n in cat_names], dtype=np.float64
    )
    base_cat_weights /= base_cat_weights.sum()
    cat_amounts = {}
    for n in cat_names:
        ac = cfg["amount_distribution"].get(n, {"mean": 500, "min": 10, "max": 10000})
        cat_amounts[n] = ac

    print(f"  Plans: {len(plan_ids)}, Categories: {len(categories)}", flush=True)

    # ── Base entities ──
    pre_assigned = {}

    if not args.skip_base:
        print("[2/6] Seeding base entities...", flush=True)
        users, pre_assigned = seed_users(cursor, cfg)
        conn.commit()
        print(f"  → {len(users)} users", flush=True)

        contexts, members = seed_contexts_and_members(cursor, users, cfg)
        conn.commit()
        print(f"  → {len(contexts)} contexts, {len(members)} members", flush=True)
    else:
        print("[2/6] Loading existing base entities...", flush=True)
        cursor.execute("SELECT id, plan_id, name, created_at FROM users")
        users = [
            {"id": r[0], "plan_id": r[1], "name": r[2], "created_at": r[3]}
            for r in cursor.fetchall()
        ]
        cursor.execute("SELECT id, type, owner_id FROM contexts")
        contexts = [
            {"id": r[0], "type": r[1], "owner_id": r[2]} for r in cursor.fetchall()
        ]
        cursor.execute(
            "SELECT id, context_id, user_id, role, status FROM context_members"
        )
        mem_rows = cursor.fetchall()
        members = [
            {
                "id": r[0],
                "context_id": r[1],
                "user_id": r[2],
                "role": r[3],
                "status": r[4],
            }
            for r in mem_rows
        ]
        print(
            f"  → {len(users)} users, {len(contexts)} contexts, {len(members)} members",
            flush=True,
        )

    # ── Build context maps ──
    member_map = defaultdict(set)
    for m in members:
        member_map[m["context_id"]].add(m["user_id"])

    ctx_info = {}
    for c in contexts:
        cid = c["id"]
        ctx_info[cid] = {"type": c["type"], "mc": len(member_map.get(cid, set()))}

    # ── Assign user angles & compute profiles ──
    print("[3/6] Computing user angles & profiles...", flush=True)
    user_ids = [u["id"] for u in users]
    angle_map = assign_angles(user_ids, cfg["user_angles"], pre_assigned)
    profiles = compute_profiles(user_ids, angle_map, cfg["user_angles"])

    # Power-law user weight list
    user_assn = cfg.get("user_assignment", {})
    weighted_users, user_weights = build_user_weight_list(
        user_ids,
        profiles,
        user_assn.get("power_user_ratio", 0.20),
        user_assn.get("power_user_expense_share", 0.60),
    )

    # Show angle summary
    dim_names = list(cfg["user_angles"].keys())
    sample_uid = user_ids[0]
    sample_profile = profiles[sample_uid]
    print(
        f"  Sample user: {sample_uid[:8]}... | {' × '.join(f'{d}={sample_profile.angles[d]}' for d in dim_names)}",
        flush=True,
    )
    print(
        f"  Power users: {int(len(user_ids) * 0.20)} "
        f"→ {user_assn.get('power_user_expense_share', 0.60) * 100:.0f}% of expenses",
        flush=True,
    )

    # ── Temporal patterns ──
    print("[4/6] Pre-computing temporal distributions...", flush=True)
    end_date = date.today()
    start_date = end_date - timedelta(days=cfg["date_range_months"] * 30)
    active_ranges = assign_active_ranges(users, cfg["date_range_months"], start_date)
    velocity_map = assign_velocity_profiles(user_ids)

    # Build weighted date list
    all_dates, date_weights = build_weighted_date_list(start_date, end_date, cfg)

    # Pre-sample dates
    print(f"  Sampling {N:,} dates...", flush=True)
    sampled_dates = random.choices(all_dates, weights=date_weights, k=N)

    # Pre-sample users
    print(f"  Sampling {N:,} users (80-20 power law)...", flush=True)
    sampled_users = random.choices(weighted_users, weights=user_weights, k=N)

    # Pre-compute amount pools per category
    print("  Sampling amounts...", flush=True)
    sampled_amounts = {}
    for cat in cat_names:
        ac = cat_amounts[cat]
        mu = np.log(ac["mean"])
        samples = np.random.lognormal(mu, 0.5, max(N // len(cat_names) * 3, 10000))
        samples = np.clip(samples, ac["min"], ac["max"])
        samples = np.round(samples, 2)
        sampled_amounts[cat] = samples.tolist()
    sampled_amount_ptrs = {cat: 0 for cat in cat_names}

    # Pre-compute per-user category distributions
    print("  Building per-user category distributions...", flush=True)
    user_cat_dists = {}
    for uid in user_ids:
        profile = profiles[uid]
        mults = np.array([profile.category_mult.get(c, 1.0) for c in cat_names])
        weights = mults * np.array(
            [cfg["category_weights"].get(c, 1) for c in cat_names]
        )
        user_cat_dists[uid] = (
            (weights / weights.sum()).tolist()
            if weights.sum() > 0
            else (np.ones(len(cat_names)) / len(cat_names)).tolist()
        )

    # ── Generate budgets ──
    print("[5/6] Generating scenario-based budgets...", flush=True)
    b_count = generate_budgets(
        cursor,
        contexts,
        categories,
        cat_names,
        cat_amounts,
        start_date,
        end_date,
        cfg.get("budget_weights", {}),
        cfg.get("budget_scenarios"),
        profiles=profiles,
        config=cfg,
    )
    conn.commit()
    print(f"  → {b_count} budgets", flush=True)

    # ── Generate Expenses ──
    print(f"\n[6/6] Generating {N:,} expenses...", flush=True)
    exp_path = os.path.join(args.output, "expenses.tsv")
    spl_path = os.path.join(args.output, "expense_splits.tsv")
    BATCH = 100_000
    total_splits = 0
    note_shape_counts = defaultdict(int)
    note_shape_weights = cfg.get("note_shapes", {})

    with (
        open(exp_path, "w", encoding="utf-8") as fe,
        open(spl_path, "w", encoding="utf-8") as fs,
    ):
        for batch_start in range(0, N, BATCH):
            batch_end = min(batch_start + BATCH, N)

            for idx_in_batch in range(batch_end - batch_start):
                i = batch_start + idx_in_batch

                # ── User & date ──
                uid = sampled_users[i]
                profile = profiles[uid]
                exp_date = sampled_dates[i]
                if hasattr(exp_date, "date"):
                    exp_date = exp_date.date()

                # Apply velocity adjustment
                velocity = velocity_map.get(uid, "even")
                vel_mult = apply_velocity_weight(exp_date.day, velocity)
                if vel_mult < 1.0 and random.random() > vel_mult:
                    retry = 0
                    while retry < 5:
                        exp_date = random.choice(all_dates)
                        if hasattr(exp_date, "date"):
                            exp_date = exp_date.date()
                        if apply_velocity_weight(exp_date.day, velocity) >= 0.8:
                            break
                        retry += 1

                # ── Category (per-user distribution) ──
                salary_mult = apply_salary_day_weight(exp_date.day, cfg)
                festival = get_active_festival(
                    exp_date, cfg.get("seasonal_periods", [])
                )
                festival_suffix = (
                    get_festival_template_suffix(festival) if festival else None
                )

                # Only apply festival boost if user's religion matches
                user_religion = profile.angles.get("religion")
                festival_religion = festival.get("religion") if festival else None
                religion_map = {
                    "muslim": "islam",
                    "hindu": "hindu",
                    "buddhist": "buddhist",
                    "christian": "christian",
                }
                religion_match = (
                    festival_religion is None
                    or religion_map.get(user_religion) == festival_religion
                )

                cat_dists = user_cat_dists.get(uid)
                if cat_dists is not None:
                    adj = list(cat_dists)

                    # Salary day boost
                    affected = cfg.get("salary_day_weights", {}).get(
                        "affected_categories", []
                    )
                    for ci, cn in enumerate(cat_names):
                        if cn in affected and salary_mult > 1.0:
                            adj[ci] *= salary_mult

                    # Festival category boost (only if religion matches)
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

                # ── Amount ──
                amt_pool = sampled_amounts.get(cat)
                if amt_pool:
                    ptr = sampled_amount_ptrs[cat]
                    amt = amt_pool[ptr % len(amt_pool)]
                    sampled_amount_ptrs[cat] = ptr + 1
                    amt = amt * profile.amount_mult
                    if profile.amount_round_to > 0:
                        amt = round_amount(amt, profile.amount_round_to)
                    ac = cat_amounts[cat]
                    amt = max(ac["min"], min(amt, ac["max"]))
                    amt = max(amt, 0.01)
                else:
                    amt = 500.0

                # ── Context ──
                ctx = pick_context_for_user(uid, contexts, member_map)
                cid = ctx["id"]
                info = ctx_info.get(cid, {"type": "personal", "mc": 1})
                ctx_type = info["type"]
                mc = info["mc"]

                # ── Hour / timestamp ──
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
                created_at = datetime(
                    exp_date.year, exp_date.month, exp_date.day, hr, mn
                )

                # ── Note ──
                original_cat = cat
                note, cat = generate_note(
                    cat,
                    amt,
                    exp_date,
                    profile,
                    tpls,
                    tpls["_merged_values"],
                    cfg,
                    shape_weights=note_shape_weights,
                    festival_suffix=festival_suffix if religion_match else None,
                )
                # If ambiguous shape changed the category, use it
                if cat != original_cat:
                    pass  # cat already updated

                # ── Created_by ──
                members_here = list(member_map.get(cid, {uid}))
                creator = random.choice(members_here) if members_here else uid

                # ── Split type ──
                split = determine_split_type(ctx_type, mc)

                # ── Settlement ──
                settled = "t" if settle_by_age(exp_date) else "f"

                # ── Soft delete ──
                if random.random() < cfg.get("soft_delete_chance", 0.01):
                    del_flag = datetime.now().isoformat()
                else:
                    del_flag = "NULL"

                # ── Write expense ──
                eid = uuid4()
                note_out = "NULL" if note is None else ("" if note == "" else note)
                if note_out == "":
                    note_out = "NULL"  # represent empty as NULL in TSV
                fe.write(
                    f"{eid}\t{cid}\t{categories.get(cat, '')}\t{creator}\t"
                    f"{amt:.2f}\t{exp_date.isoformat()}\t"
                    f"{note_out}\t{split}\t{settled}\t"
                    f"{created_at.isoformat()}\t{created_at.isoformat()}\t{del_flag}\n"
                )

                # ── Write splits ──
                if split != "none" and members_here:
                    total_splits += write_splits(
                        fs, split, members_here, eid, amt, created_at, creator
                    )

            fe.flush()
            fs.flush()
            print(
                f"  {batch_end:>8,} / {N:,} ({batch_end / N * 100:.0f}%) — splits: {total_splits:,}",
                flush=True,
            )

    fe_size = os.path.getsize(exp_path) / 1024 / 1024
    fs_size = os.path.getsize(spl_path) / 1024 / 1024
    print(f"  ✅ expenses.tsv ({fe_size:.0f} MB)", flush=True)
    print(f"  ✅ expense_splits.tsv ({fs_size:.0f} MB)", flush=True)

    conn.close()
    print("\n[✓] Done. DB connection closed.", flush=True)
    print("=" * 60, flush=True)
    print(f"\nLoad data:", flush=True)
    print(
        f"  psql -h 127.0.0.1 -p 5435 -U spendwise -d spendwise "
        f"-f {os.path.join(BASE_DIR, 'import.sql')}",
        flush=True,
    )

    # ── Summary ──
    print("\nUser Angle Distribution:", flush=True)
    for dim in dim_names:
        counts = defaultdict(int)
        for uid in user_ids:
            val = profiles[uid].angles[dim]
            counts[val] += 1
        top = sorted(counts.items(), key=lambda x: -x[1])[:3]
        print(f"  {dim}: {', '.join(f'{k}={v}' for k, v in top)}", flush=True)

    print(f"\nExpected data for ML tasks:", flush=True)
    print(f"  Auto-Categorization: {N:,} labeled note→category pairs", flush=True)
    print(
        f"  Spending Forecast: {cfg['date_range_months']} months of daily timeseries",
        flush=True,
    )
    print(
        f"  Receipt Scan eval: ~{int(N * 0.11):,} receipt-style notes (English + Bangla)",
        flush=True,
    )


if __name__ == "__main__":
    main()
