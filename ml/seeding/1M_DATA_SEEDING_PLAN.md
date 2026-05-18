# SpendWise — Data Seeding & ML Pipeline (v2)

## 1. Project Structure

```
ml/
├── __init__.py
├── 1M_DATA_SEEDING_PLAN.md       ← This file
├── DB_SCHEMA.sql                 # Full PostgreSQL schema
│
├── seeding/                      # Data generation (1M expenses)
│   ├── __init__.py
│   ├── generate.py               # Main entry point (standalone — seeds all tables)
│   ├── config.yaml               # User angles, note shapes, temporal, budgets
│   ├── utils.py                  # Shared helpers (YAML loading, UUID, weighted choice)
│   ├── angles.py                 # Multi-angle user persona system (11 dimensions)
│   ├── notes.py                  # 10 note shapes + mutations engine
│   ├── temporal.py               # Date sampling, velocity, salary days, Ramadan, festivals
│   ├── budgets.py                # 3-type budget generation (base, category, tagged)
│   ├── preview.py                # Preview tool (no DB) to inspect generated expenses
│   ├── import.sql                # \copy commands to bulk-load expenses + splits
│   ├── templates/
│   │   ├── notes.yaml            # Standard English templates (expanded: opinion, combined, shorthand)
│   │   ├── values.yaml           # Value banks (receipt items, opinion words, recurring, etc.)
│   │   ├── bangla_words.yaml     # Bangla word banks (expanded: 200+ words)
│   │   ├── bangla_notes.yaml     # Full Bangla sentence templates per category
│   │   ├── receipts.yaml         # Receipt-style templates per category
│   │   ├── ambiguous.yaml        # Cross-category ambiguous notes (32 entries)
│   │   └── venue_banks.yaml      # City-tier venue pools (Dhaka → rural)
│   └── output/                   # Generated TSV files (gitignored)
│       ├── expenses.tsv
│       └── expense_splits.tsv
│
├── auto_categorize/              # Auto-categorization pipeline
│   ├── autocategorize.ipynb      # Jupyter notebook (paired .py via Jupytext)
│   ├── export.py                 # DB → data.csv export
│   ├── data.csv                  # All labeled expenses (note, category)
│   ├── train.csv                 # Train split (80%)
│   ├── test.csv                  # Test split (20%)
│   └── models/
│       ├── autocategorize.bin    # Full fastText model
│       └── autocategorize.ftz    # Quantized fastText model (~3 MB)
│
├── forecast/                     # Spending forecast & budget alerts
│   ├── run.py                    # Entry point: python run.py --user-id <uuid>
│   ├── prophet_model.py          # Prophet fitting on last 90 days + sanity cap
│   ├── linear_fallback.py        # Linear projection with historical avg fallback
│   ├── alert_tiers.py            # 3-tier: overspend → on_track_exceed → early_warning
│   └── requirements.txt          # prophet, psycopg2-binary, pandas, numpy
│
└── visualizations/               # (future) Dashboard charts, forecast plots
```

---

## 2. Database Tables

### Seeded by `generate.py` (direct INSERT)

| Table | Records | Method |
|---|---|---|
| plans | 2 | Auto-seeded (free / pro) |
| categories | 12 | Auto-seeded if empty |
| users | 1,000 | INSERT with angle pre-assignment |
| contexts | 1,200 | 1,000 personal + 200 groups |
| context_members | ~2,200 | Admin + member roles |
| budgets | ~125K | 3-type: base + category + tagged |
| ml_forecasts | per-run | Written by forecast pipeline |

### Seeded via TSV → `\copy` (import.sql)

| Table | Records | File |
|---|---|---|
| expenses | 1,000,000 | `output/expenses.tsv` |
| expense_splits | ~2,200,000 | `output/expense_splits.tsv` |

---

## 3. Multi-Angle User Persona System

### 11 Dimensions

| Dimension | Values | Cross-Constraints |
|---|---|---|
| **profession** | software_engineer, doctor, teacher, businessman, student, govt_employee, freelancer, shop_owner, driver, banker, housewife, retired | Restricts age_group, city_tier, tech_adoption; gender filter on housewife (female) and driver (male) |
| **gender** | male, female | Pre-assigned before angle assignment; used to pick first name + filter professions |
| **age_group** | teen_18_24, young_25_34, adult_35_49, middle_50_64, senior_65_plus | Restricts family_type, lifestyle, transport_mode |
| **income_tier** | low, middle, upper_middle, high | Constrained by profession + age_group via income_curve |
| **family_type** | single, couple, family_kids, joint_family, shared_flat | Constrained by age_group |
| **city_tier** | dhaka_core, dhaka_suburb, chittagong, other_metro, small_town, rural | Constrained by profession; restricts transport_mode |
| **religion** | muslim, hindu, buddhist, christian | Pre-assigned; used for name selection + festival matching |
| **lifestyle** | urban_professional, family_centered, student_life, frugal_saver, social_extrovert, homebody_introvert, fitness_enthusiast | Category multipliers per lifestyle |
| **transport_mode** | car_owner, bike_owner, rideshare_user, public_transport, walk_bicycle | Constrained by age_group + city_tier |
| **spending_personality** | planned_budgeter, impulse_buyer, minimalist, experience_seeker, convenience_spender, bargain_hunter | Affects amount rounding, recurring chance, budget scenarios |
| **tech_adoption** | app_native, hybrid, traditional | Constrained by profession |

### Assignment Order & Constraints

```
Order: profession → gender → age_group → income_tier → family_type → city_tier → religion → lifestyle → transport_mode → spending_personality → tech_adoption

Constraints enforced between sequential dimensions:
  profession.allowed_age_groups         → filters age_group
  profession.allowed_genders            → filters gender on pre-assigned
  profession.allowed_city_tiers         → filters city_tier
  profession.allowed_tech_adoption      → filters tech_adoption
  profession.income_curve[age_group]    → filters income_tier
  age_group.allowed_family_types        → filters family_type
  age_group.allowed_lifestyles          → filters lifestyle
  age_group.allowed_transport_modes     → filters transport_mode
  city_tier.allowed_transport_modes     → filters transport_mode (intersection)
  gender → name                         → picks from religion+gendered name pool
  religion → name                       → picks from religion-specific full names
```

### Name Pools

Male users pick from 160 culturally authentic full names (40 per religion):
- **Muslim**: "Mohammad Abdur Rahman", "Md. Tariqul Islam", "Kazi Nazrul Islam"...
- **Hindu**: "Rajesh Kumar Sharma", "Biplab Chandra Das", "Tapan Kumar Mondal"...
- **Buddhist**: "Suddhananda Mahathero Barua", "Bikash Chandra Chakma", "Prem Lal Tripura"...
- **Christian**: "Joseph Rozario", "Francis Xavier Gomes", "Michael Patrick D'Rozario"...

Female users pick from first name pools + religion-specific last names:
- First: Sadia, Ayesha, Fatima (muslim); Shanta, Bina, Shreya (hindu); etc.
- Last: Rahman, Islam, Chowdhury (muslim); Das, Roy, Saha (hindu); etc.

---

## 4. Note Generation (10 Shapes)

| Shape | Weight | Example |
|---|---|---|
| **template_standard** | 27% | "lunch at KFC" |
| **template_bangla** | 12% | "পাঠাও বাইক — ধানমন্ডি" |
| **receipt_style** | 8% | "KFC | Zinger: 450 | Fries: 150 | Total: 680" |
| **recurring_clone** | 8% | "monthly rent — May" (same note, diff dates) |
| **short_abbrev** | 7% | "ubr dhanmondi", "mbl rchrg gp" |
| **vendor_only** | 5% | "KFC", "Pathao", "Agora" |
| **single_word** | 5% | "uber", "rent", "lunch" |
| **combined_multi** | 5% | "groceries from Shwapno + lunch at KFC" |
| **emotional_opinion** | 3% | "overpriced garbage at that restaurant" |
| **ambiguous** | 2% | "coffee at North End" → seeded as Entertainment |

### Mutations (applied on top of shapes)

| Mutation | Chance | Example |
|---|---|---|
| Typo | 5% | "lunch" → "lnch", "uber" → "ubr" |
| Short form | 10% | "groceries" → "grceries", "dinner" → "dinnr" |
| Bangla word insertion | 8% | "lunch at KFC বাজার" |
| Person reference | 12% | "with Rahim", "treating Karim" |
| Amount in note | 15% | "Tk 500" |
| Date reference | 5% | "yesterday's dinner" |
| Null | 3% | `NULL` |
| Empty | 2% | `""` |

### Route Pools (split to avoid impossible combos)

| Pool | Contains |
|---|---|
| `destination_local` | Dhanmondi, Uttara, Gulshan, Banani, Mirpur... (20 local places) |
| `route_local` | "Mirpur-12 to Motijheel", "Uttara to Gulshan"... (12 city routes) |
| `route_intercity` | "Dhaka to Chittagong", "Dhaka to Sylhet"... (10 inter-city) |

Templates use the correct pool: `launch/ferry` → `route_intercity`, `Uber/CNG` → `destination_local`.

---

## 5. Budget Generation (3 Types)

Matches the app's actual budget structure:

| Type | category_id | description | Example |
|---|---|---|---|
| **Base** | `NULL` | `NULL` | Overall monthly cap — one per context/month |
| **Category** | `<uuid>` | `NULL` | Per-category cap — e.g., Food: 450 BDT |
| **Tagged** | `NULL` or `<uuid>` | "Shopping buffer" | Labeled extra budget |

### Profile-Aware Amounts

Budget amounts are scaled by the context owner's profile angles:

| Profile Angle | Scales |
|---|---|
| `income_tier.amount_mult` | All budget amounts (0.4x low → 2.5x high) |
| `family_type.grocery_mult` | Groceries (0.4x single → 2.5x joint) |
| `family_type.utility_mult` | Utilities |
| `family_type.rent_mult` | Rent & Housing |
| `family_type.education_mult` | Education (2.0x family_kids → 0.0x single) |
| `spending_personality` | Scenario selection (planned_budgeter → well_budgeted, impulse_buyer → tight_budget) |

### Scenario Distribution

| Scenario | Global Ratio | Personality Override |
|---|---|---|
| well_budgeted | 40% | minimalist → 70%, impulse_buyer → 15% |
| tight_budget | 25% | impulse_buyer → 45%, planned_budgeter → 15% |
| projected_exceed | 15% | (default) |
| very_loose | 10% | bargain_hunter → 50% |
| barely_under | 10% | experience_seeker → 35% |

---

## 6. Festivals & Religion

| Festival | Religion | Boost | Categories Affected |
|---|---|---|---|
| Eid-ul-Fitr | islam | 2.5x | Shopping, Food & Dining, Travel |
| Eid-ul-Adha | islam | 2.0x | Food & Dining, Groceries |
| Durga Puja | hindu | 2.2x | Shopping (3.5x), Food (2.0x), Travel (2.5x) |
| Kali Puja / Diwali | hindu | 1.8x | Shopping (2.5x), Food (1.8x) |
| Buddha Purnima | buddhist | 1.5x | Others (3.0x donations) |
| Christmas | christian | 2.0x | Shopping (3.0x), Food (2.5x), Entertainment (2.0x) |
| Easter | christian | 1.3x | Food & Dining (1.8x) |
| Pohela Boishakh | secular | 1.8x | Shopping, Food |
| Ramadan | islam | hourly | Iftar hours 3.0x, daytime 0.3x |

Festival spending boosts only apply when the user's `religion` angle matches the festival's `religion` field. Festival-specific note templates (e.g., `_durga_puja`, `_eid`) are used during matching periods.

---

## 7. Expense Splits

| Split Type | Logic | Remainder |
|---|---|---|
| equal | `share = round(amt / count, 2)` | Added to creator's share (ensures `SUM = amt`) |
| custom | Random shares that sum to `amt` | Last member gets remainder |
| percentage | Random pcts summing to 100% | `share = round(amt × pct / 100, 2)` |

`is_settled` age correlation: <7 days → 40%, 7-30 days → 75%, 30-90 days → 90%, >90 days → 95%.

---

## 8. Spending Forecast Pipeline

### Architecture

```
POST /api/forecasts/run  ← User hits dashboard
        ↓
php shell_exec(python3 ml/forecast/run.py --user-id <uuid>)
        ↓
Fetch budgets for user's contexts this month
Fetch last 90 days of expenses per (context, category)
        ↓
         ┌──────────────────────────────────────┐
         │  hist_n_days >= 7?                   │
         ├───────── YES ────────────────────────┤
         │  Prophet(weekly, month_end seasons)  │
         │  + sanity cap: max 3x historical avg │
         ├───────── NO ─────────────────────────┤
         │  Linear fallback with historical avg │
         │  (uses last 3 months when <3 days)   │
         └──────────────────────────────────────┘
        ↓
projected_total = spent_so_far + forecast_remaining
        ↓
Evaluate 3 alert tiers (overspend → on_track → early_warning)
        ↓
UPSERT ml_forecasts table
Create Notification records for new alerts
```

### 3 Alert Tiers

| Tier | Condition | Frontend Display |
|---|---|---|
| **overspend** | `spent_so_far > budget` | Red card: "Budget Exceeded" |
| **on_track_exceed** | `projected > budget` | Amber card: "On Track to Exceed" |
| **early_warning** | `spent >= 50%` AND `days_left >= 15` | Yellow badge: "Early Warning" |

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Trigger** | Per-user on dashboard load | No batch job needed; runs in ~3-6s per user |
| **Training data** | Last 90 days | Captures recent patterns; enough for Prophet |
| **Fallback** | Linear + historical avg | Handles sparse months gracefully |
| **Sanity cap** | 3x historical daily avg | Prevents outlier-driven absurd projections |
| **Dedup** | DELETE + INSERT per run | Avoids NULL category_id UNIQUE constraint issue |
| **Notifications** | Once per day per alert type | Prevents spam on every dashboard load |

---

## 9. Auto-Categorization Pipeline

### Architecture

```
User types note → onBlur → POST /api/expenses/suggest-category
        ↓
Laravel shell_exec(fasttext predict model.ftz)
        ↓
Returns top-3 (category, confidence)
        ↓
Frontend shows green "✨ AI suggested" badge
        ↓
Confidence > 0.5? → Auto-select category
        ↓
User confirms or overrides → becomes retraining data
```

### Model Training (Notebook)

```
ml/auto_categorize/
├── export.py         # DB → data.csv
├── data.csv          # All labeled expenses
├── autocategorize.ipynb  # Self-contained pipeline:
│   ├── Load data.csv → dedup → stratified split (80/20)
│   ├── Inject synthetic examples for weak categories
│   ├── Train fastText (epoch=50, wordNgrams=3, minn=2, maxn=5)
│   ├── Evaluate: per-category metrics, confusion matrix, error analysis
│   ├── Test on 97 hand-labeled unseen edge case notes
│   ├── Quantize → models/autocategorize.ftz (~3 MB)
│   └── Copy to Laravel storage
└── models/
    └── autocategorize.ftz
```

### Edge Cases in Unseen Test

| Type | Count | Examples |
|---|---|---|
| Incomplete / missing verb | 9 | "went school", "kfc lunch", "sylhet trip" |
| Single word / vendor only | 12 | "uber", "rent", "netflix", "kfc" |
| Shorthand / abbreviations | 10 | "ubr to dhanmondi", "mbl rchrg gp" |
| Typos / misspellings | 10 | "ubber to airport", "elektricity bill" |
| Emotional / opinionated | 6 | "overpriced garbage", "best biryani ever" |
| Mixed Bangla / English | 8 | "kacchi bhai er dokan e lunch" |
| Date / time references | 7 | "yesterday dinner", "last month rent" |
| Ambiguous / multi-category | 10 | "coffee and a book", "medicine for mother" |
| Numbers / amounts | 6 | "500", "paid 1200 for dinner" |
| Extremely short / generic | 9 | "misc", "stuff", "xyz", "item" |
| Long / detailed | 5 | Receipt breakdowns, trip descriptions |
| Very short Bangla | 5 | "ঢাকা যাব", "বাজার", "ওষুধ" |

---

## 10. Running the Pipeline

### Data Generation

```bash
# Full 1M generation (standalone — no Laravel dependency)
source venv/bin/activate
python -m ml.seeding.generate --expenses 1000000

# Load expenses + splits
psql -h 127.0.0.1 -p 5435 -U spendwise -d spendwise -f ml/seeding/import.sql
```

### Auto-Categorization

```bash
# Export labeled data
source venv/bin/activate
python ml/auto_categorize/export.py

# Open notebook and run all cells
jupyter notebook ml/auto_categorize/autocategorize.ipynb

# Copy model to Laravel
cp ml/auto_categorize/models/autocategorize.ftz expense-management-api/storage/app/ml/
```

### Spending Forecast

```bash
# Run migration first (once)
php artisan migrate

# Test forecast for a single user
source venv/bin/activate
python ml/forecast/run.py --user-id <uuid>

# Preview without writing
python ml/forecast/run.py --user-id <uuid> --dry-run
```

The `/api/forecasts/run` endpoint (called when user opens dashboard) runs this automatically.

---

## 11. Edge Cases Covered

| Edge Case | How It's Handled |
|---|---|
| **NULL notes** | 3% of expenses get `note = NULL` |
| **Duplicate notes** | Deduplicated before train/test split |
| **Outlier amounts** | 26,300 BDT day in April → sanity cap at 3x historical avg |
| **Soft-deleted expenses** | 1% have `deleted_at` set (excluded from forecast queries) |
| **Unsettled expenses** | Age-progressive: 40% → 95% as expenses age |
| **Male housewife** | Blocked by `allowed_genders: [female]` |
| **Teen with kids** | Blocked by `age_group.allowed_family_types` |
| **20yo with car** | Blocked by `age_group.allowed_transport_modes` |
| **Rural with Uber** | Blocked by `city_tier.allowed_transport_modes` |
| **SE with traditional tech** | Blocked by `profession.allowed_tech_adoption` |
| **Budget with NULL category** | Duplicate rows prevented via DELETE + INSERT |
| **Forecast with <7 days data** | Uses last 3 months' monthly totals for daily avg |
| **Prophet outlier sensitivity** | Sanity cap clamps prediction to max 3x historical |
| **Duplicate notifications** | Checked by context+category+tier per day |
| **Equal split rounding** | Remainder assigned to creator (SUM = amount) |
