'use client';

import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewExpensePage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/expenses');
  };

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/expenses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Expense</h1>
          <p className="text-muted-foreground">Record a new transaction</p>
        </div>
      </div>

      <ExpenseForm onSuccess={handleSuccess} />
    </div>
  );
}
