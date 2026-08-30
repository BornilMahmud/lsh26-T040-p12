'use client';

import { useParams, useRouter } from 'next/navigation';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useExpenses } from '@/hooks/useExpenses';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const { useExpense } = useExpenses();
  const { data: expense, isLoading, error } = useExpense(expenseId);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load expense</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/expenses')}>
          Back to Expenses
        </Button>
      </div>
    );
  }

  const handleSuccess = () => {
    router.push(`/expenses/${expenseId}`);
  };

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/expenses/${expenseId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Expense</h1>
          <p className="text-muted-foreground">Update transaction details</p>
        </div>
      </div>

      <ExpenseForm expense={expense} onSuccess={handleSuccess} />
    </div>
  );
}
