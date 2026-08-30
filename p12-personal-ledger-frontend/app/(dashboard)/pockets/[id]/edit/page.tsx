'use client';

import { useParams, useRouter } from 'next/navigation';
import { PocketForm } from '@/components/pockets/PocketForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePockets } from '@/hooks/usePockets';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditPocketPage() {
  const params = useParams();
  const router = useRouter();
  const pocketId = params.id as string;
  const { usePocket } = usePockets();
  const { data: pocket, isLoading, error } = usePocket(pocketId);

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

  const handleSuccess = () => {
    router.push(`/pockets/${pocketId}`);
  };

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/pockets/${pocketId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Savings Pocket</h1>
          <p className="text-muted-foreground">Update your savings goal</p>
        </div>
      </div>

      <PocketForm pocket={pocket} onSuccess={handleSuccess} />
    </div>
  );
}
