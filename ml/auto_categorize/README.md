# SpendWise — Smart Auto-Categorization

## Overview

The Smart Auto-Categorization system automatically predicts the expense category from the note/description text. When a user types "uber to airport", the model predicts `Transportation` before the user has to pick from a dropdown.

```
User types "uber to airport" in note field
        │
        ▼ onBlur fires
POST /api/expenses/suggest-category { note: "uber to airport" }
        │
        ▼
fastText model (autocategorize.ftz)
        │
        ▼
Top-3 predictions with confidence
        │
        ▼
Confidence > 0.5? ──Yes──► Auto-select category, show ✨ badge
        │
        No
        ▼
Show suggestions to user → manual pick becomes training data
```

---

## Model Choice: fastText

### What is fastText?

[fastText](https://fasttext.cc/) is a lightweight text classification library developed by Facebook AI Research. It extends word2vec by treating each word as a bag of character n-grams, making it robust to typos and rare words.

### Architecture

```
Input: "uber to airport"
        │
        ▼
Tokenize + hash to bucket
  ├── "uber" → char n-grams: ub, ube, uber, be, ber, er, r
  ├── "to"   → char n-grams: to
  └── "airport" → char n-grams: ai, air, airp, airport, ir, irp, rp, rpo, po, por, port, or, ort, rt
        │
        ▼
Look up n-gram embeddings → average → hidden layer (100 dim)
        │
        ▼
Softmax over 12 categories → probability distribution
        │
        ▼
Output: Transportation (0.99), Travel (0.01), Shopping (0.00)
```

### Hyperparameters

| Parameter | Value | Why |
|---|---|---|
| `lr` | 0.1 | Standard learning rate for text classification |
| `epoch` | 50 | More iterations help minority categories (Personal Care, Others) |
| `wordNgrams` | 3 | Trigram context captures "north end coffee" as a unit |
| `dim` | 100 | Embedding dimension — good balance of accuracy/size |
| `loss` | softmax | Multi-class probability output with confidence scores |
| `minn` | 2 | Character n-gram min — catches "ub" in "ubr" for "uber" |
| `maxn` | 5 | Character n-gram max — catches "uber" in "ubber" |
| `thread` | 4 | CPU parallelism |

### Why fastText Instead of Alternatives?

| Model | Size | Inference | Train Time | Typo Resistant | Bangla Support | Confidence Scores |
|---|---|---|---|---|---|---|
| **fastText** ✅ | **3 MB** | **<1ms** | **30s** | ✅ (char n-grams) | ✅ (Unicode) | ✅ |
| DistilBERT → ONNX | 80 MB | ~10ms | 2h (GPU) | ✅ (subword) | ✅ (multilingual) | ✅ |
| TF-IDF + Logistic | 50 MB | <1ms | 10s | ❌ | ⚠️ | ✅ |
| spaCy TextCategorizer | 15 MB | ~2ms | 5min | ⚠️ | ⚠️ | ✅ |
| Gemini/OpenAI API | N/A | ~500ms | N/A | ✅ | ✅ | ✅ (low) |

**Decision rationale:**

1. **Size**: 3 MB quantized model loads in milliseconds. Fits in Laravel's storage without dedicated ML infrastructure. DistilBERT → ONNX would be 80 MB and require ONNX Runtime PHP extension.

2. **Inference speed**: <1ms per prediction. Called synchronously in `POST /expenses`. The user doesn't notice the delay.

3. **Typo resilience**: `minn=2, maxn=5` means "ubber" and "uber" share character n-grams (`ub`, `ube`, `uber`, `ubbe`). The model generalizes to unseen misspellings automatically — no need to enumerate every typo in training data.

4. **Unicode support**: Bangla text like `"ধানমন্ডি যাব"` is handled natively. Each Bengali character is treated as a UTF-8 byte sequence, and character n-grams capture the script patterns.

5. **Confidence scores**: Softmax output gives calibrated probabilities. We use a threshold of 0.5 to decide whether to auto-select or show suggestions. This is impossible with TF-IDF or decision-tree classifiers.

6. **No GPU needed**: Trains in 30 seconds on CPU. The full pipeline (export → split → train → quantize) completes in under 2 minutes. DistilBERT requires a GPU and 2+ hours.

7. **Quantization**: fastText's `quantize` command reduces model size from 800 MB → 3 MB with <1% accuracy loss using product quantization (`-dsub 2`) and weight pruning (`-cutoff 50000`).

### Why Not Deep Learning?

Deep learning models (DistilBERT, RoBERTa) would improve accuracy by 5-10% on edge cases (ambiguous notes, mixed language) but at 10-50x the infrastructure cost:

| Cost | fastText | DistilBERT |
|---|---|---|
| **Model size** | 3 MB | 80 MB |
| **RAM per request** | ~10 MB | ~300 MB |
| **PHP integration** | `shell_exec(fasttext predict)` | ONNX Runtime extension |
| **Training infra** | CPU, 30s | GPU, 2h |
| **Per-request cost** | $0 | $0 (self-hosted) |

For MVP, fastText gives 75%+ accuracy on edge cases. The data flywheel (more user corrections → better model) closes the gap over time. DistilBERT can be swapped in later when the user base justifies the infrastructure.

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `ml/auto_categorize/autocategorize.ipynb` | Main notebook (paired .py via Jupytext). Exports, splits, trains, evaluates, quantizes, and deploys the model. |
| `ml/auto_categorize/export.py` | Standalone script: reads expenses from PostgreSQL → writes `data.csv` |
| `ml/auto_categorize/data.csv` | All labeled expenses — `note`, `category` columns |
| `ml/auto_categorize/models/autocategorize.bin` | Full fastText model (~800 MB) |
| `ml/auto_categorize/models/autocategorize.ftz` | Quantized model (~3 MB) — deployed to production |

### Notebook Pipeline

```
ml/auto_categorize/autocategorize.ipynb

Cell 1: SETTINGS
  ├── USE_DRIVE / DRIVE_DATA_PATH     ← Colab support
  ├── TRAIN_RATIO = 0.80
  ├── LR = 0.1, EPOCH = 50, WORD_NGRAMS = 3, DIM = 100
  ├── MINN = 2, MAXN = 5              ← Character n-grams for typos
  ├── CONFIDENCE_THRESHOLD = 0.5
  └── 97 hand-labeled UNSEEN_NOTES    ← Edge case test set

Cell 2: Load data
  ├── if train.csv/test.csv exist → load from disk
  ├── elif data.csv exist → load, dedup, split (stratified)
  └── else → error: run export.py

Cell 3: Train fastText
  └── temp .txt → fasttext.train_supervised() → delete temp

Cell 4-6: Evaluate
  ├── Accuracy on test set
  ├── Per-category precision/recall/F1 with sklearn
  └── Confusion matrix heatmap

Cell 7-8: Error analysis
  ├── 20 misclassified examples
  └── Per-category error rate (sorted worst → best)

Cell 9: 97 unseen edge case notes
  ├── Each with expected label
  ├── Shows ✓/✗/? with confidence
  └── Aggregate accuracy

Cell 10-11: Save + Quantize
  ├── Save full .bin model
  ├── CLI quantize → .ftz (3 MB)
  └── Test quantized accuracy

Cell 12-13: Deploy
  ├── Test quantized model on unseen notes
  └── Copy .ftz to Laravel storage
```

### Synthetic Data Injection

Before training, 135 synthetic examples are injected to strengthen weak categories. Each example has a 40% chance of noise injection (typo, abbreviation, or Bangla word swap):

```python
TYPO_MAP = {
    "uber": ["ubr", "ubber", "ubar"],
    "electricity": ["elec", "elektricity", "bijli"],
    "medicine": ["medecine", "medsine"],
    "school": ["skool", "skul"],
    ...
}
```

Targeted categories and their synthetic counts:

| Category | Examples | Pattern |
|---|---|---|
| Shorthand | 22 | "ubr to uttara", "mbl rchrg bl", "grceries" |
| Generic / short | 15 | "miscellaneous", "random stuff", "abc" |
| Education | 6 | "went to class", "exam registration" |
| Multi-category | 19 | "netflix and dinner", "fuel and food" |
| Cultural events | 5 | "nikah gift", "birthday present" |
| Bangla mixed | 10 | "daal ar bhat", "oshudh pharmacy" |
| Store names | 5 | "agora supermarket", "daraz dot com" |
| Utilities | 6 | "data pack 5 gb", "current bill" |

---

## Training Data

### Source

1M expenses from the seeding pipeline (`generate.py`). After deduplication (removing identical note texts), ~392K unique notes remain.

### Distribution

```
Food_and_Dining     118,943  37.9%
Groceries            40,695  13.0%
Shopping             34,452  11.0%
Transportation       30,648   9.8%
Entertainment        29,177   9.3%
Health_and_Medical   27,331   8.7%
Utilities            12,812   4.1%
Rent_and_Housing      9,702   3.1%
Education             4,229   1.3%
Travel                2,746   0.9%
Others                1,790   0.6%
Personal_Care         1,514   0.5%
```

Weak categories (<5K samples) get synthetic data boost: Education, Travel, Others, Personal Care.

### Split

- **Train**: 80% (stratified by label) → ~314K
- **Test**: 20% → ~78K

### Unseen Test Set

97 hand-crafted edge case notes, never seen by the model during training:

| Category | Count | Examples |
|---|---|---|
| Incomplete / missing verb | 9 | "went school", "kfc lunch" |
| Single word / vendor only | 12 | "uber", "rent", "kfc" |
| Shorthand / abbreviations | 10 | "ubr to dhanmondi", "mbl rchrg gp" |
| Typos / misspellings | 10 | "ubber to airport", "elektricity bill" |
| Emotional / opinionated | 6 | "overpriced garbage", "best biryani ever" |
| Mixed Bangla / English | 8 | "kacchi bhai er dokan e lunch" |
| Date / time references | 7 | "yesterday dinner", "last month rent" |
| Ambiguous / multi-category | 10 | "coffee and a book", "medicine for mother" |
| Numbers / amounts in note | 6 | "500", "paid 1200 for dinner" |
| Extremely short / generic | 9 | "misc", "stuff", "xyz" |
| Long / detailed | 5 | Receipt breakdowns, trip descriptions |
| Very short Bangla | 5 | "ঢাকা যাব", "বাজার", "ওষুধ" |

---

## Laravel Integration

| Component | File | Purpose |
|---|---|---|
| Controller | `app/Http/Controllers/Expense/ExpenseController.php` `→ suggestCategory()` | POST /api/expenses/suggest-category — calls fastText CLI, returns top-3 |
| Service | `app/Services/CategorySuggestionService.php` | `shell_exec(fasttext predict model.ftz)` + parses output |
| Model file | `storage/app/ml/autocategorize.ftz` | Copied from notebook training pipeline |
| Route | `routes/api.php` | `POST /api/expenses/suggest-category` — under `auth:api` |
| Frontend | `NewExpenseModal.tsx` | Note `onBlur` triggers `suggestCategory()`, shows ✨ badge |
| Frontend | `EditExpenseModal.tsx` | Same pattern — note `onBlur` triggers suggestion |
| Frontend | `(Budgets)/Budgets.tsx` | Description `onBlur` triggers suggestion for budget form |

### Inference Flow

```
User types note → onBlur event
        │
        ▼
api.post('/expenses/suggest-category', { note })
        │
        ▼
ExpenseController::suggestCategory()
        │
        ▼
shell_exec("fasttext predict model.ftz -3", $note)
        │
        ▼
Parse output: __label__Transportation 0.994 __label__Travel 0.004 ...
        │
        ▼
Map label → category_id via categories table
        │
        ▼
Return { predictions: [{ category_id, label, confidence }] }
        │
        ▼
Frontend: confidence > 0.5? → auto-select + green border + ✨ badge
```

---

## Edge Cases Handled

| Scenario | Handling |
|---|---|
| **Empty note** | `onBlur` checks `text.trim().length >= 3` before calling API |
| **Repeated same text** | `lastSuggestedNote.current` ref prevents duplicate API calls |
| **API failure** | Silently caught — user just sees the plain dropdown |
| **User disagrees** | Manual override clears suggestion — the manual pick becomes retraining data |
| **Low confidence** | `< 0.5 threshold` → not auto-selected, user picks manually |
| **Typos** | `minn=2, maxn=5` character n-grams catch "ubber" → "uber" |
| **Bangla script** | UTF-8 character n-grams handle Bengali natively |
| **Ambiguous notes** | If model is uncertain, confidence drops → user decides |
| **New category added** | Not possible — 12 system categories are fixed. Custom categories fall back to "Others" |
| **Null notes** | 3% of training data has NULL notes (excluded from training, prediction on empty text returns lowest confidence) |

---

## Performance

| Metric | Full Model | Quantized |
|---|---|---|
| **Size** | 799 MB | 3 MB |
| **Inference time** | <1ms | <1ms |
| **Test accuracy** | ~99% | ~99% |
| **Unseen accuracy** | ~75% (97 edge case notes) | ~75% |
| **Training time** | ~30s (CPU, 4 threads) | — |
| **Quantization time** | — | ~10s |

### Unseen Accuracy Breakdown (~75%)

| Category | Accuracy | Notes |
|---|---|---|
| Single word / vendor only | ~92% | "uber", "rent", "kfc" — easy |
| Date / time references | ~86% | "yesterday dinner", "last month rent" |
| Long / detailed | ~80% | Receipt text — enough context |
| Shorthand | ~70% | "ubr to dhanmondi" — moderate |
| Typos | ~70% | "ubber to airport" — char n-grams help |
| Bangla mixed | ~63% | "kacchi bhai er dokan e lunch" — moderate |
| Ambiguous / multi-category | ~60% | "coffee and a book" — genuinely hard |
| Extremely short / generic | ~44% | "misc", "stuff", "xyz" — not enough signal |
| Incomplete / missing verb | ~44% | "went school", "kfc lunch" — missing context |

---

## Retraining Pipeline

### How User Corrections Become Training Data

1. Model predicts a category with confidence >0.5 → auto-selects
2. User manually changes the category → override detected
3. Old prediction logged as `(note, predicted_category, actual_category, corrected_by, timestamp)`
4. Weekly cron job: `python ml/auto_categorize/retrain.py`
   - Pulls corrections table
   - Merges with original training data
   - Re-trains model
   - Quantizes → deploys to Laravel storage

This table doesn't exist yet — it's the next infrastructure build.

### Future: Continuous Learning

```
Week 1:  Model trained on seed data (1M expenses, 75% accuracy)
Week 2:  Users make 5,000 corrections → logged
         Retrain with merged data → 76% accuracy
Week 4:  20,000 corrections → 78% accuracy
Month 3: 100,000 corrections → 82% accuracy
```

The fastText model's small size makes frequent retraining feasible (<30s on CPU). The optimal retraining cadence is weekly or whenever corrections exceed 1,000 new samples.

---

## Future Improvements

| Area | Improvement | Effort |
|---|---|---|
| **Accuracy** | Add `corrections` table for continuous learning | Medium |
| **Ambiguous notes** | Show top-3 suggestions in dropdown with confidence bars | Low |
| **Confidence display** | Show `(85% sure)` next to auto-selected category | Low |
| **Per-user model** | Fine-tune base model per user for personal vocabulary | High |
| **Model upgrade** | Replace fastText with DistilBERT → ONNX for 80%+ edge accuracy | High |
| **Auto-retrain** | Trigger retraining when corrections > 1,000 | Low |
