# lsh26-TO40-p12


```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── expenses/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── edit/
│   │   │           └── page.tsx
│   │   ├── pockets/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── edit/
│   │   │           └── page.tsx
│   │   ├── dps/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   ├── not-found.tsx
│   └── providers.tsx
├── components/
│   ├── ui/
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── calendar.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── popover.tsx
│   │   ├── progress.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── skeleton.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   └── toaster.tsx
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── MobileNavigation.tsx
│   │   ├── Header.tsx
│   │   └── PageHeader.tsx
│   ├── dashboard/
│   │   ├── SummaryCards.tsx
│   │   ├── SpendingTrendChart.tsx
│   │   ├── CategoryBreakdown.tsx
│   │   ├── IncomeExpenseChart.tsx
│   │   ├── RecentTransactions.tsx
│   │   └── SavingsOverview.tsx
│   ├── expenses/
│   │   ├── ExpenseTable.tsx
│   │   ├── ExpenseCard.tsx
│   │   ├── ExpenseForm.tsx
│   │   ├── ExpenseFilters.tsx
│   │   ├── ExpenseRow.tsx
│   │   └── ExpenseSummary.tsx
│   ├── pockets/
│   │   ├── PocketCard.tsx
│   │   ├── PocketGrid.tsx
│   │   ├── PocketForm.tsx
│   │   ├── PocketProgress.tsx
│   │   └── PocketSummary.tsx
│   ├── dps/
│   │   ├── DPSOverview.tsx
│   │   ├── DPSCalculator.tsx
│   │   ├── DPSSchedule.tsx
│   │   └── DPSChart.tsx
│   ├── analytics/
│   │   ├── CategoryAnalytics.tsx
│   │   ├── MerchantAnalytics.tsx
│   │   ├── MonthlyComparison.tsx
│   │   └── SavingsAnalytics.tsx
│   └── shared/
│       ├── MonthSelector.tsx
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       ├── ErrorState.tsx
│       └── ConfirmDialog.tsx
├── hooks/
│   ├── useExpenses.ts
│   ├── usePockets.ts
│   ├── useDashboard.ts
│   ├── useDPS.ts
│   ├── useAnalytics.ts
│   └── useMonth.ts
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   ├── expenses.ts
│   │   ├── pockets.ts
│   │   ├── dashboard.ts
│   │   ├── dps.ts
│   │   └── analytics.ts
│   ├── formatters/
│   │   ├── currency.ts
│   │   ├── date.ts
│   │   └── number.ts
│   ├── validations/
│   │   ├── expense.ts
│   │   └── pocket.ts
│   ├── constants/
│   │   ├── categories.ts
│   │   └── index.ts
│   └── utils.ts
├── types/
│   ├── api.ts
│   ├── expense.ts
│   ├── pocket.ts
│   ├── dashboard.ts
│   ├── dps.ts
│   └── analytics.ts
├── providers/
│   ├── query-provider.tsx
│   └── theme-provider.tsx
├── public/
│   └── favicon.ico
├── tests/
│   ├── formatters/
│   │   └── currency.test.ts
│   ├── validations/
│   │   ├── expense.test.ts
│   │   └── pocket.test.ts
│   ├── components/
│   │   ├── expenses/
│   │   │   └── ExpenseForm.test.tsx
│   │   └── pockets/
│   │       └── PocketForm.test.tsx
│   └── hooks/
│       └── useMonth.test.ts
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── components.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```