# SpentWell

A locally hosted personal budget web application built with Node.js.  
Supports two data sources:

- Manual CSV import (from Desert Financial, Citi Costco Visa, or any bank)
- Live account linking via Plaid

**Zero-based budgeting** (EveryDollar-style): plan income, assign every dollar to categories, and track Planned / Spent / Remaining until the budget hits zero.

---

## Features

### Zero-based monthly budget
- Enter planned income (paychecks, side income, etc.)
- Assign amounts to expense categories (Giving, Saving, Housing, Food, …)
- **Available to budget** shows what is left to assign
- Green check when income − assigned ≈ 0 (“It’s a zero-based budget”)
- Progress bars per category (spent vs planned)
- Month navigation (previous / next)

### Transactions
- Import bank CSVs or link accounts via Plaid
- Auto-categorization with keyword rules (Costco → Groceries, etc.)
- Manual category dropdown on each transaction
- Month-filtered list aligned with the budget month

### Savings goals
- Target amount + optional end date → **required monthly contribution**
- Typical monthly contribution with projected balance at the goal date
- **External account** balance (money not linked in the app) counted toward progress
- Interest/dividends: **auto** (APY compounds monthly) or **manual** entries
- Activity log for contributions, interest, and adjustments

### Inspired by
- **EveryDollar** — zero-based planning, planned/spent/remaining, category groups
- **DollarWise** — category review, spending vs plan, practical tracking

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Runtime     | Node.js                             |
| Server      | Express                             |
| Frontend    | Vanilla HTML / CSS / JavaScript (ES modules) |
| Data        | CSV files + Plaid Transactions API  |
| Storage     | Local JSON files (`data/`)          |

---

## Project Structure

```
spentwell/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── server.js                     # Express + API (budget, transactions, goals, Plaid)
│
├── public/
│   ├── index.html
│   ├── app.js
│   ├── modules/
│   │   ├── ui.js
│   │   ├── csv.js
│   │   ├── plaid.js
│   │   ├── budget.js             # Zero-based logic, defaults, rules
│   │   └── goals.js              # Savings goals, required monthly, interest
│   └── css/
│       └── style.css
│
└── data/                         # git-ignored
    ├── transactions.json
    ├── budgets.json              # Monthly budgets keyed by YYYY-MM
    ├── goals.json                # Savings goals
    └── accounts.json
```

---

## Getting Started

```bash
npm install
cp .env.example .env
# edit .env with Plaid credentials (optional for CSV-only use)
npm start
```

Open **http://localhost:3000**.

1. Go to the **Budget** tab and set planned income and category amounts.
2. Import a CSV or link an account.
3. Categorize transactions (or use **Auto-categorize**).
4. Watch Planned / Spent / Remaining update as you spend.

---

## API (local)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/transactions` | All transactions |
| PATCH | `/api/transactions/:id` | Update category |
| POST | `/api/transactions/auto-categorize` | Apply keyword rules |
| GET | `/api/budget/:month` | Get/create budget for `YYYY-MM` |
| PUT | `/api/budget/:month` | Save budget |
| POST | `/api/import/csv` | Upload CSV |
| POST | `/api/plaid/*` | Plaid link & transactions |

---

## Data model

**Transaction**

```json
{
  "id": "unique-id",
  "date": "2026-10-15",
  "amount": -42.50,
  "description": "COSTCO WHOLESALE",
  "merchant": "Costco",
  "category": "Groceries",
  "account": "Citi Costco Visa",
  "source": "csv",
  "pending": false
}
```

**Budget (per month)**

```json
{
  "month": "2026-10",
  "categories": [
    { "id": "…", "name": "Paycheck", "group": "income", "planned": 3500 },
    { "id": "…", "name": "Groceries", "group": "food", "planned": 400 }
  ],
  "updatedAt": "2026-10-24T…"
}
```

---

## Notes

- Personal use only. Do not commit `.env` or `data/`.
- Plaid sandbox is free for testing; production requires your own keys.
- CSV parsing is tolerant of common bank export headers.
