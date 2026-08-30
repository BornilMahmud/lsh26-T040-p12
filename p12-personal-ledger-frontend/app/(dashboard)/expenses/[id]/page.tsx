'use client';

import { useParams, useRouter } from 'next/navigation';
import { useExpenses } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters/currency';
import { formatDate } from '@/lib/formatters/date';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useState } from 'react';

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { useExpense, deleteExpense } = useExpenses();
  const { data: expense, isLoading, error } = useExpense(expenseId);
  const deleteMutation = deleteExpense();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
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

  const handleDelete = () => {
    deleteMutation.mutate(expenseId, {
      onSuccess: () => {
        router.push('/expenses');
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/expenses">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expense Details</h1>
            <p className="text-muted-foreground">View transaction information</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/expenses/${expenseId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{expense.shop}</CardTitle>
            <Badge variant="secondary">{expense.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-semibold">{formatCurrency(expense.amount_bdt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="text-base">{formatDate(expense.date)}</p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="text-base capitalize">{expense.category}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Shop / Merchant</p>
              <p className="text-base">{expense.shop}</p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm text-muted-foreground">Transaction ID</p>
            <p className="text-sm font-mono">{expense.id}</p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Expense"
        description={`Are you sure you want to delete this expense from ${expense.shop}? This action cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
