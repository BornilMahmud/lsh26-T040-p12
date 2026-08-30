'use client';

import { useState } from 'react';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpenseSummary } from '@/components/expenses/ExpenseSummary';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useExpenses } from '@/hooks/useExpenses';
import { useMonth } from '@/hooks/useMonth';
import { ExpenseFilters as ExpenseFiltersType } from '@/types/expense';
import { Skeleton } from '@/components/ui/skeleton';

export default function ExpensesPage() {
  const { selectedMonth } = useMonth();
  const [filters, setFilters] = useState<ExpenseFiltersType>({
    search: '',
    category: '',
    month: selectedMonth || undefined,
  });
  const { data, isLoading, error } = useExpenses(filters);

  const handleFilterChange = (newFilters: Partial<ExpenseFiltersType>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load expenses</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Manage and track your spending</p>
        </div>
        <Button asChild>
          <Link href="/expenses/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Link>
        </Button>
      </div>

      <ExpenseSummary expenses={data?.expenses || []} />

      <ExpenseFilters filters={filters} onFilterChange={handleFilterChange} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ExpenseTable
          expenses={data?.expenses || []}
          total={data?.total || 0}
          page={data?.page || 1}
          pageSize={data?.pageSize || 10}
          totalPages={data?.totalPages || 1}
          onPageChange={(page) => console.log('Page change:', page)}
        />
      )}
    </div>
  );
}
