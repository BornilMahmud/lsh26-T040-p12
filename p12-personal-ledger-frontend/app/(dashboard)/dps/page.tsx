'use client';

import { DPSOverview } from '@/components/dps/DPSOverview';
import { DPSCalculator } from '@/components/dps/DPSCalculator';
import { DPSSchedule } from '@/components/dps/DPSSchedule';
import { DPSChart } from '@/components/dps/DPSChart';
import { useDPS } from '@/hooks/useDPS';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

export default function DPSSPage() {
  const { useDPSData } = useDPS();
  const { data, isLoading, error } = useDPSData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load DPS data</p>
        <button
          className="mt-4 text-sm text-primary hover:underline"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DPS Calculator</h1>
        <p className="text-muted-foreground">Track your DPS growth and projections</p>
      </div>

      <DPSOverview
        balance={data?.balance || '0'}
        annualRate={data?.annualRate || 0}
        monthlyDeposit={data?.monthlyDeposit || 0}
        interestEarned={data?.interestEarned || '0'}
      />

      <Tabs defaultValue="calculator" className="w-full">
        <TabsList>
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="schedule">Monthly Schedule</TabsTrigger>
          <TabsTrigger value="chart">Growth Chart</TabsTrigger>
        </TabsList>
        <TabsContent value="calculator" className="mt-4">
          <DPSCalculator
            initialBalance={data?.balance || '0'}
            initialRate={data?.annualRate || 0}
            initialDeposit={data?.monthlyDeposit || 0}
          />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <DPSSchedule schedule={data?.schedule || []} />
        </TabsContent>
        <TabsContent value="chart" className="mt-4">
          <DPSChart schedule={data?.schedule || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
