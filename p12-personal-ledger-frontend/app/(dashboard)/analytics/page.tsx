'use client';

import { CategoryAnalytics } from '@/components/analytics/CategoryAnalytics';
import { MerchantAnalytics } from '@/components/analytics/MerchantAnalytics';
import { MonthlyComparison } from '@/components/analytics/MonthlyComparison';
import { SavingsAnalytics } from '@/components/analytics/SavingsAnalytics';
import { MonthSelector } from '@/components/shared/MonthSelector';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useMonth } from '@/hooks/useMonth';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AnalyticsPage() {
  const { selectedMonth } = useMonth();
  const { useAnalyticsData } = useAnalytics();
  const { data, isLoading, error } = useAnalyticsData(selectedMonth);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-destructive">Failed to load analytics data</p>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Deep insights into your finances</p>
        </div>
        <MonthSelector />
      </div>

      <Tabs defaultValue="spending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="spending">Spending</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
          <TabsTrigger value="savings">Savings</TabsTrigger>
        </TabsList>
        <TabsContent value="spending" className="mt-4">
          <CategoryAnalytics data={data?.categoryAnalytics} />
        </TabsContent>
        <TabsContent value="merchants" className="mt-4">
          <MerchantAnalytics data={data?.merchantAnalytics} />
        </TabsContent>
        <TabsContent value="comparison" className="mt-4">
          <MonthlyComparison data={data?.monthlyComparison} />
        </TabsContent>
        <TabsContent value="savings" className="mt-4">
          <SavingsAnalytics data={data?.savingsAnalytics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
