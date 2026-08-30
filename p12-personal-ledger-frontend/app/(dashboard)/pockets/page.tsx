'use client';

import { PocketGrid } from '@/components/pockets/PocketGrid';
import { PocketSummary } from '@/components/pockets/PocketSummary';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePockets } from '@/hooks/usePockets';
import { Skeleton } from '@/components/ui/skeleton';

export default function PocketsPage() {
  const { usePockets: usePocketsHook } = usePockets();
  const { data, isLoading, error } = usePocketsHook();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load savings pockets</p>
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
          <h1 className="text-2xl font-bold tracking-tight">Savings Pockets</h1>
          <p className="text-muted-foreground">Track your savings goals</p>
        </div>
        <Button asChild>
          <Link href="/pockets/new">
            <Plus className="mr-2 h-4 w-4" />
            New Pocket
          </Link>
        </Button>
      </div>

      <PocketSummary pockets={data?.pockets || []} />
      <PocketGrid pockets={data?.pockets || []} />
    </div>
  );
}
