"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { MetricsChart } from "@/components/metrics-chart";
import { CryptoCard } from "@/components/crypto-card";
import { ModelsView } from "@/components/models-view";

import { Card } from "@/components/ui/card";
import { MarketState } from "@/lib/trading/current-market-state";
import { MetricData } from "@/lib/types/metrics";

interface CryptoPricing {
  btc: MarketState;
  eth: MarketState;
  sol: MarketState;
  doge: MarketState;
  bnb: MarketState;
}

interface MetricsResponse {
  data: {
    metrics: MetricData[];
    totalCount: number;
    model: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  success: boolean;
}

interface PricingResponse {
  data: {
    pricing: CryptoPricing;
  };
  success: boolean;
}

export default function Home() {
  const [metricsData, setMetricsData] = useState<MetricData[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [pricing, setPricing] = useState<CryptoPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // 获取图表数据
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch("/api/metrics");
      if (!response.ok) return;

      const data: MetricsResponse = await response.json();
      if (data.success && data.data) {
        setMetricsData(data.data.metrics || []);
        setTotalCount(data.data.totalCount || 0);
        setLastUpdate(new Date().toLocaleTimeString());
        setLoading(false);
      }
    } catch (err) {
      console.error("Error fetching metrics:", err);
      setLoading(false);
    }
  }, []);

  // 获取价格数据
  const fetchPricing = useCallback(async () => {
    try {
      const response = await fetch("/api/pricing");
      if (!response.ok) return;

      const data: PricingResponse = await response.json();
      if (data.success && data.data.pricing) {
        setPricing(data.data.pricing);
      }
    } catch (err) {
      console.error("Error fetching pricing:", err);
    }
  }, []);

  useEffect(() => {
    // 初始加载
    fetchMetrics();
    fetchPricing();

    const metricsInterval = setInterval(fetchMetrics, 10000);

    const pricingInterval = setInterval(fetchPricing, 10000);

    return () => {
      clearInterval(metricsInterval);
      clearInterval(pricingInterval);
    };
  }, [fetchMetrics, fetchPricing]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Animated background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative max-w-[1600px] mx-auto p-4 md:p-8 space-y-8">
        {/* Premium Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
                    Super Nof1.ai
                  </h1>
                  <p className="text-xs text-muted-foreground/80 font-medium mt-0.5">
                    Powered by AI • Inspired by Alpha Arena
                  </p>
                </div>
              </div>

              {/* Virtual Trading Badge */}
              {process.env.NEXT_PUBLIC_TRADING_MODE === 'dry-run' && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur-md opacity-75 group-hover:opacity-100 transition" />
                  <span className="relative inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                    </svg>
                    Virtual Mode
                  </span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground/90 text-sm flex items-center gap-2 ml-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              Real-time AI trading metrics and performance analytics
            </p>
          </div>
          {lastUpdate && (
            <div className="text-right space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">Last Sync</div>
              <div className="text-xl font-black font-mono bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {lastUpdate}
              </div>
            </div>
          )}
        </div>

        {/* Premium Navigation */}
        <div className="flex gap-6 border-b border-border/50">
          <button className="group relative pb-3 px-2">
            <span className="text-sm font-bold tracking-wide bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              LIVE
            </span>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full shadow-lg shadow-blue-500/50" />
          </button>
          <Link href="/dashboard" className="group relative pb-3 px-2 hover:opacity-80 transition-opacity">
            <span className="text-sm font-semibold tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
              TRADING DASHBOARD
            </span>
          </Link>
          <Link href="/backtest" className="group relative pb-3 px-2 hover:opacity-80 transition-opacity">
            <span className="text-sm font-semibold tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
              BACKTEST
            </span>
          </Link>
        </div>

        {/* Premium Crypto Ticker */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {pricing ? (
            <>
              <CryptoCard
                symbol="BTC"
                name="Bitcoin"
                price={`$${pricing.btc.current_price.toLocaleString()}`}
              />
              <CryptoCard
                symbol="ETH"
                name="Ethereum"
                price={`$${pricing.eth.current_price.toLocaleString()}`}
              />
              <CryptoCard
                symbol="SOL"
                name="Solana"
                price={`$${pricing.sol.current_price.toLocaleString()}`}
              />
              <CryptoCard
                symbol="BNB"
                name="BNB"
                price={`$${pricing.bnb.current_price.toLocaleString()}`}
              />
              <CryptoCard
                symbol="DOGE"
                name="Dogecoin"
                price={`$${pricing.doge.current_price.toFixed(4)}`}
              />
            </>
          ) : (
            // Premium loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 p-5 border border-border/50">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                <div className="space-y-3">
                  <div className="h-8 w-8 bg-muted rounded-xl animate-pulse" />
                  <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Main Content - Chart and Models Side by Side */}
        <div className="flex flex-row gap-6">
          {/* Left: Chart */}
          <div className="flex-[2]">
            <MetricsChart
              metricsData={metricsData}
              loading={loading}
              lastUpdate={lastUpdate}
              totalCount={totalCount}
            />
          </div>

          {/* Right: Models View */}
          <div className="flex-1">
            <ModelsView />
          </div>
        </div>

        {/* Premium Footer */}
        <div className="relative mt-12 pt-8 border-t border-border/50">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80">
              <span className="font-semibold">Super Nof1.ai</span>
              <span>•</span>
              <span>Autonomous AI Trading Platform</span>
              <span>•</span>
              <span>Built with ❤️</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
