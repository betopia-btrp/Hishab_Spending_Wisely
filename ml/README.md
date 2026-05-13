# SpendWise — Smart Auto-Categorization

## What is fastText?

[fastText](https://fasttext.cc) is an open-source, lightweight text classification library by Facebook Research. It treats text as bags of n-grams and uses a linear classifier with a softmax layer. Key advantages:

- **Fast**: trains on 1M samples in ~40 seconds on CPU
- **Small**: quantized models are ~3 MB vs DistilBERT's ~250 MB
- **Accurate**: achieves 99.4% accuracy on SpendWise expense notes
- **Portable**: single C++ binary, no Python/GPU dependency at inference

---

## Pipeline Overview

```
PostgreSQL (1M expenses)     ml/data/train.txt (760K)          ml/models/autocategorize.ftz
    ┌──────────────┐              ┌──────────────┐                  ┌──────────────┐
    │  expenses    │──export.py──▶│  train.txt   │──notebook.py────▶│  model.ftz   │
    │  categories  │              │  test.txt    │  fasttext train  │  (~3 MB)     │
    └──────────────┘              └──────────────┘  + quantize      └──────┬───────┘
                                                                          │
                                                                          ▼
                                                              Laravel storage/app/ml/
```

### 1. Data Export

`ml/scripts/export.py` connects to PostgreSQL, pulls `expenses.note` + `categories.name`, formats each row as:

```
__label__Food_and_Dining lunch at kfc 350 tk
__label__Transportation uber to airport
```

- 1M total → 950,599 usable (49K skipped: NULL/empty notes)
- Split: 760,479 train (~80%) + 190,120 test (~20%)
- Output: `ml/data/train.txt`, `ml/data/test.txt`

### 2. Training

`ml/notebooks/autocategorize.ipynb` trains with:

```python
model = fasttext.train_supervised(
    input="train.txt",
    lr=0.1,      # learning rate
    epoch=25,    # passes over data
    wordNgrams=2,# bi-gram features
    dim=100,     # vector dimension
    loss="softmax"
)
```

Results:

| Metric | Full Model | Quantized |
|---|---|---|
| Size | 799 MB | **3 MB** |
| Precision@1 | 99.6% | **99.4%** |

### 3. Quantization (799 MB → 3 MB)

```bash
fasttext quantize \
  -input train.txt \
  -output model \
  -qnorm \          # quantize norm vectors
  -retrain \        # fine-tune after quantization
  -epoch 1 \
  -dsub 2 \         # sub-vector size
  -cutoff 50000     # keep top 50K words
```

The CLI was built from source at `/tmp/fastText/`:

```bash
git clone https://github.com/facebookresearch/fastText.git
cd fastText && make
```

The `.ftz` quantized format is auto-detected by fastText — no API changes needed.

### 4. PHP Integration

`app/Services/CategorySuggestionService.php` calls the fastText CLI via PHP's `shell_exec`:

```php
$cmd = escapeshellcmd($cli) . ' predict ' . escapeshellarg($model) . ' - 3';
$output = shell_exec('echo ' . escapeshellarg($note) . ' | ' . $cmd);
```

Two integration points:

| Endpoint | Description |
|---|---|
| `POST /api/expenses/suggest-category` | Returns top-3 category predictions for a note |
| `POST /api/expenses` (auto) | If no `category_id` but `note` exists, auto-assigns predicted category |

### 5. Frontend Integration

`NewExpenseModal.tsx` triggers suggestion on **blur** (not on every keystroke):

```
User types note → tabs away (onBlur)
  ──▶ POST /api/expenses/suggest-category
  ──▶ Category dropdown auto-selects + green "✨ AI suggested" badge
```

### 6. File Structure

```
ml/
├── README.md                ← This file
├── requirements.txt
├── notebooks/
│   ├── autocategorize.py    ← Source (cell-markers for Jupyter)
│   └── autocategorize.ipynb ← JupyterLab notebook
├── scripts/
│   └── export.py            ← Export 1M rows from PG → train/test.txt
├── data/
│   ├── train.txt            ← 760K labeled samples
│   └── test.txt             ← 190K held-out
├── models/
│   ├── autocategorize.bin   ← Full model (799 MB)
│   └── autocategorize.ftz   ← Quantized model (~3 MB)

expense-management-api/
└── storage/app/ml/
    └── autocategorize.ftz   ← Production model (copied from ml/models/)
```

### 7. Model Label Map

Labels match the 12 system categories. The category-to-label conversion:

```python
# Python (training)
label = category.replace("&", "and").replace(" ", "_")

# PHP (inference)
$name = str_replace(' & ', ' and ', $cat->name);
$label = '__label__' . str_replace([' ', '-', '/'], ['_', '_', '_'], $name);
```

Example: `Food & Dining` → `__label__Food_and_Dining`

### 8. Retraining

To retrain with new data:

```bash
source venv/bin/activate
python ml/scripts/export.py          # re-export from PG
# Open ml/notebooks/autocategorize.ipynb → Run All
cp ml/models/autocategorize.ftz expense-management-api/storage/app/ml/
```
