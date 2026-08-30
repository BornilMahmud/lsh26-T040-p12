'use client';

import { PocketForm } from '@/components/pockets/PocketForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewPocketPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/pockets');
  };

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/pockets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Savings Pocket</h1>
          <p className="text-muted-foreground">Set a new savings goal</p>
        </div>
      </div>

      <PocketForm onSuccess={handleSuccess} />
    </div>
  );
}
