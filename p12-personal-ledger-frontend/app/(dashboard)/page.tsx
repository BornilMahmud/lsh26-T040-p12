'use client';

import { useDashboard } from '@/hooks/useDashboard';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { SpendingTrendChart } from '@/components/dashboard/SpendingTrendChart';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { IncomeExpenseChart } from '@/components/dashboard/IncomeExpenseChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { SavingsOverview } from '@/components/dashboard/SavingsOverview';
import { MonthSelector } from '@/components/shared/MonthSelector';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMonth } from '@/hooks/useMonth';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { selectedMonth } = useMonth();
  const { data, isLoading, error } = useDashboard(selectedMonth);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-80 col-span-2" />
          <Skeleton className="h-80" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load dashboard data</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const summary = data?.summary;
  const monthLabel = selectedMonth ? format(new Date(selectedMonth), 'MMMM yyyy') : '';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Financial overview for {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector />
          <Button asChild>
            <Link href="/expenses/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Link>
          </Button>
        </div>
      </div>

      <SummaryCards summary={summary} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SpendingTrendChart data={data?.spendingTrend} className="lg:col-span-2" />
        <CategoryBreakdown data={data?.categoryBreakdown} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IncomeExpenseChart data={data?.incomeExpense} />
        <SavingsOverview data={data?.savingsOverview} />
      </div>

      <RecentTransactions transactions={data?.recentTransactions} />
    </div>
  );
}
