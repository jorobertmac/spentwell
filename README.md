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

### Debt management
- Track **home mortgage**, HELOC, auto, student, credit card, personal, medical, and other debts
- Principal, APR, monthly P&I, term, extra payments, escrow (mortgage)
- **Amortization schedule** with payoff date and interest remaining
- Extra-payment comparison (interest and months saved)
- Record payments (principal / interest split) with history
- Avalanche vs snowball payoff order suggestions

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
├── server.js                     # Express + API (budget, transactions, goals, debts, Plaid)
├── goalsApi.js                   # Savings goals routes
├── debtsApi.js                   # Debt management routes
│
├── public/
│   ├── index.html
│   ├── app.js
│   ├── modules/
│   │   ├── ui.js
│   │   ├── csv.js
│   │   ├── plaid.js
│   │   ├── budget.js             # Zero-based logic, defaults, rules
│   │   ├── goals.js              # Savings goals math + API client
│   │   ├── goalsUi.js
│   │   ├── debts.js              # Amortization, payoff, API client
│   │   └── debtsUi.js
│   └── css/
│       └── style.css
│
└── data/                         # git-ignored
    ├── transactions.json
    ├── budgets.json              # Monthly budgets keyed by YYYY-MM
    ├── goals.json                # Savings goals
    ├── debts.json                # Debt accounts
    └── accounts.json
```

---

## Setup

```bash
npm install
cp .env.example .env   # add Plaid keys if using Link
npm start
```

Open http://localhost:3000
