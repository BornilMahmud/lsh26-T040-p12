'use client';

import { useParams, useRouter } from 'next/navigation';
import { usePockets } from '@/hooks/usePockets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useState } from 'react';
import { addMonths, format } from 'date-fns';

export default function PocketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pocketId = params.id as string;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { usePocket, deletePocket } = usePockets();
  const { data: pocket, isLoading, error } = usePocket(pocketId);
  const deleteMutation = deletePocket();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
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

  if (error || !pocket) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load savings pocket</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/pockets')}>
          Back to Pockets
        </Button>
      </div>
    );
  }

  const target = parseFloat(pocket.target_bdt);
  const monthly = parseFloat(pocket.monthly_contribution_bdt);
  const saved = target * 0.4;
  const progress = Math.min((saved / target) * 100, 100);
  const remaining = target - saved;
  const monthsRemaining = Math.ceil(remaining / monthly);
  const estimatedDate = addMonths(new Date(), monthsRemaining);

  const handleDelete = () => {
    deleteMutation.mutate(pocketId, {
      onSuccess: () => {
        router.push('/pockets');
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pockets">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{pocket.name}</h1>
            <p className="text-muted-foreground">{pocket.item}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/pockets/${pocketId}/edit`}>
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
            <CardTitle>Goal Progress</CardTitle>
            <span className="text-sm font-medium">
              {progress.toFixed(1)}%
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Progress value={progress} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Saved: {formatCurrency(saved.toString())}</span>
              <span>Target: {formatCurrency(pocket.target_bdt)}</span>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Target Amount</p>
              <p className="text-lg font-semibold">{formatCurrency(pocket.target_bdt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Contribution</p>
              <p className="text-lg font-semibold">{formatCurrency(pocket.monthly_contribution_bdt)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-lg font-semibold">{formatCurrency(remaining.toString())}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated Completion</p>
              <p className="text-lg font-semibold">
                {monthsRemaining} months
              </p>
              <p className="text-sm text-muted-foreground">
                {format(estimatedDate, 'MMM yyyy')}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm text-muted-foreground">Pocket ID</p>
            <p className="text-sm font-mono">{pocket.id}</p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Savings Pocket"
        description={`Are you sure you want to delete "${pocket.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
