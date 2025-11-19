"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Prediction {
  short_term_trend: "bullish" | "bearish" | "neutral";
  confidence: "high" | "medium" | "low";
  key_levels: {
    support: number;
    resistance: number;
  };
  analysis: string;
}

interface Trading {
  id: string;
  symbol: string;
  opeartion: "Buy" | "Sell" | "Hold";
  leverage?: number | null;
  amount?: number | null;
  pricing?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  prediction?: Prediction | null;
  createdAt: string;
}

interface Chat {
  id: string;
  model: string;
  chat: string;
  reasoning: string;
  userPrompt: string;
  tradings: Trading[];
  createdAt: string;
  updatedAt: string;
}

interface Position {
  symbol: string;
  side: string;
  contracts: number;
  contractSize: number;
  entryPrice: number;
  markPrice: number;
  notional: number;
  leverage: number;
  unrealizedPnl: number;
  percentage: number;
  marginType: string;
  liquidationPrice: number;
  initialMargin: number;
  maintenanceMargin: number;
}

interface ActivityData {
  chats: Chat[];
  positions: Position[];
}

type TabType = "completed-trades" | "model-chat" | "positions";

export function ModelsView() {
  const [activeTab, setActiveTab] = useState<TabType>("model-chat");
  const [chats, setChats] = useState<Chat[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);

  // 固定展示的5种代币顺序
  const DEFAULT_FIVE_SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "DOGE"] as const;

  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch("/api/activity");
      if (!response.ok) return;

      const result = await response.json();
      if (result.success && result.data) {
        setChats(result.data.chats || []);
        setPositions(result.data.positions || []);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error fetching activity:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    // 每10秒刷新一次实时数据
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  // 只获取 Buy 和 Sell 操作的交易
  const completedTrades = chats.flatMap((chat) =>
    chat.tradings
      .filter((t) => t.opeartion === "Buy" || t.opeartion === "Sell")
      .map((t) => ({ ...t, chatId: chat.id, model: chat.model }))
  );

  const renderOperationIcon = (operation: string) => {
    switch (operation) {
      case "Buy":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "Sell":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case "Hold":
        return <Minus className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const renderCompletedTrades = () => {
    if (loading) {
      return <div className="text-center py-8 text-sm">Loading trades...</div>;
    }

    if (completedTrades.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No completed trades yet
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground mb-2">
          {completedTrades.length} completed trade
          {completedTrades.length > 1 ? "s" : ""}
        </div>
        {completedTrades.map((trade, idx) => {
          // 计算衍生数据 - 修复精度问题，不要把小数当作0
          const hasValidData = trade.pricing != null && trade.amount != null &&
            !isNaN(trade.pricing) && !isNaN(trade.amount) &&
            trade.pricing !== 0 && trade.amount !== 0;
          const totalValue = hasValidData ? trade.pricing! * trade.amount! : 0;
          const notionalValue = hasValidData && trade.leverage ? totalValue * trade.leverage : totalValue;
          const stopLossPercent = trade.pricing && trade.stopLoss
            ? ((trade.stopLoss - trade.pricing) / trade.pricing * 100).toFixed(2)
            : null;
          const takeProfitPercent = trade.pricing && trade.takeProfit
            ? ((trade.takeProfit - trade.pricing) / trade.pricing * 100).toFixed(2)
            : null;

          // 根据数量大小自动调整显示精度
          const getAmountPrecision = (amount: number) => {
            if (amount >= 1000) return 2;  // 大额：2位小数
            if (amount >= 10) return 4;    // 中等：4位小数
            if (amount >= 1) return 6;     // 小额：6位小数
            return 8;                      // 微小额：8位小数
          };

          // 调试：打印原始数据
          if (idx === 0) {
            console.log('Trade data sample:', {
              amount: trade.amount,
              pricing: trade.pricing,
              leverage: trade.leverage,
              hasValidData,
              totalValue,
            });
          }

          return (
            <Card key={`${trade.id}-${idx}`} className="overflow-hidden border-l-4" style={{
              borderLeftColor: trade.opeartion === "Buy" ? "#10b981" : trade.opeartion === "Sell" ? "#ef4444" : "#eab308"
            }}>
              <CardContent className="p-4">
                {/* Header with operation */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b">
                  <div className="flex items-center gap-2">
                    {renderOperationIcon(trade.opeartion)}
                    <span className="font-bold text-base">
                      {trade.opeartion.toUpperCase()}
                    </span>
                    <span className="font-mono font-bold text-base">
                      {trade.symbol}
                    </span>
                    {/* Model badge */}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                      {trade.model || "Unknown"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(trade.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                {/* Trade details grid - 优化布局 */}
                <div className="space-y-3">
                  {/* 第一行：价格和数量 */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Entry/Exit Price */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">
                        {trade.opeartion === "Buy" ? "Entry Price" : "Exit Price"}
                      </div>
                      <div className="font-mono font-bold text-base">
                        {trade.pricing != null && !isNaN(trade.pricing) && trade.pricing !== 0 ? (
                          `$${trade.pricing.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 8,
                          })}`
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">
                        Amount
                      </div>
                      <div className="font-mono font-semibold">
                        {trade.amount != null && !isNaN(trade.amount) && trade.amount !== 0 ? (
                          <>
                            {trade.amount.toFixed(getAmountPrecision(trade.amount))} {trade.symbol}
                          </>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 第二行：杠杆和总价值 */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Leverage */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">
                        Leverage
                      </div>
                      <div className="font-mono font-semibold text-purple-600">
                        {trade.leverage != null && !isNaN(trade.leverage) && trade.leverage !== 0 ? (
                          `${trade.leverage}x`
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </div>
                    </div>

                    {/* Total Value (Position Size) */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">
                        Total Value
                      </div>
                      <div className="font-mono font-bold text-base">
                        {hasValidData ? (
                          `$${totalValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 第三行：名义价值（如果有杠杆）和风险指标 */}
                  {hasValidData && (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Notional Value (with leverage) */}
                      {trade.leverage && trade.leverage > 1 && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">
                            Notional (Leveraged)
                          </div>
                          <div className="font-mono font-bold text-base text-blue-600">
                            ${notionalValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      )}

                      {/* Risk Exposure Percentage */}
                      {trade.leverage && trade.leverage > 1 && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">
                            Capital at Risk
                          </div>
                          <div className="font-mono font-semibold">
                            ${(totalValue).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 第四行：止损止盈（如果有） */}
                  {(trade.stopLoss || trade.takeProfit) && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      {/* Stop Loss */}
                      {trade.stopLoss && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">
                            Stop Loss
                          </div>
                          <div className="space-y-0.5">
                            <div className="font-mono font-semibold text-red-500 text-sm">
                              ${trade.stopLoss.toLocaleString()}
                            </div>
                            {stopLossPercent && (
                              <div className="text-xs text-red-500/80">
                                ({stopLossPercent}%)
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Take Profit */}
                      {trade.takeProfit && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">
                            Take Profit
                          </div>
                          <div className="space-y-0.5">
                            <div className="font-mono font-semibold text-green-500 text-sm">
                              ${trade.takeProfit.toLocaleString()}
                            </div>
                            {takeProfitPercent && (
                              <div className="text-xs text-green-500/80">
                                (+{takeProfitPercent}%)
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 第五行：预估费用提示 */}
                  {hasValidData && trade.leverage && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        Est. Fee Impact: ~{(trade.leverage * 0.04).toFixed(2)}% (0.04% × {trade.leverage}x leverage)
                      </div>
                    </div>
                  )}
                </div>

                {/* Prediction at bottom */}
                {trade.prediction && (
                  <div className="mt-3 pt-3 border-t text-xs">
                    <div className="text-muted-foreground">
                      Prediction: {JSON.stringify(trade.prediction)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderPositions = () => {
    if (loading) {
      return <div className="text-center py-8 text-sm">Loading positions...</div>;
    }

    if (positions.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No open positions
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground mb-2">
          {positions.length} open position{positions.length > 1 ? "s" : ""}
        </div>
        {positions.map((position, idx) => {
          const isProfitable = position.unrealizedPnl >= 0;
          const isLong = position.side === "long";

          return (
            <Card key={`${position.symbol}-${idx}`} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b">
                  <div className="flex items-center gap-2">
                    {isLong ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-bold text-base uppercase">
                      {position.side}
                    </span>
                    <span className="font-mono font-bold text-base">
                      {position.symbol}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-mono font-bold">
                      {position.leverage}x
                    </span>
                  </div>
                </div>

                {/* Position details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  {/* Contracts */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Contracts
                    </div>
                    <div className="font-mono font-semibold">
                      {position.contracts.toFixed(3)}
                    </div>
                  </div>

                  {/* Notional Value */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Notional
                    </div>
                    <div className="font-mono font-semibold">
                      $
                      {Math.abs(position.notional).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Entry Price */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Entry Price
                    </div>
                    <div className="font-mono font-semibold">
                      $
                      {position.entryPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Mark Price */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Mark Price
                    </div>
                    <div className="font-mono font-semibold">
                      $
                      {position.markPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Liquidation Price */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Liquidation
                    </div>
                    <div className="font-mono font-semibold text-red-500">
                      $
                      {position.liquidationPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Margin Type */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      Margin Type
                    </div>
                    <div className="font-mono font-semibold uppercase text-xs">
                      {position.marginType}
                    </div>
                  </div>
                </div>

                {/* PnL Section */}
                <div
                  className={`mt-3 pt-3 border-t rounded-lg p-3 ${isProfitable
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground font-medium">
                      Unrealized PnL
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-mono font-bold text-base ${isProfitable ? "text-green-600" : "text-red-600"
                          }`}
                      >
                        {isProfitable ? "+" : ""}$
                        {position.unrealizedPnl.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-xs font-semibold ${isProfitable ? "text-green-600" : "text-red-600"
                          }`}
                      >
                        {isProfitable ? "+" : ""}
                        {position.percentage.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Margin info */}
                <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Initial:</span>
                    <span className="font-mono font-medium">
                      $
                      {position.initialMargin.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Maintenance:</span>
                    <span className="font-mono font-medium">
                      $
                      {position.maintenanceMargin.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderModelChat = () => {
    if (loading) {
      return <div className="text-center py-8 text-sm">Loading chats...</div>;
    }

    if (chats.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No chat history yet
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {chats.map((chat) => {
          const isExpanded = expandedChatId === chat.id;
          // 前端补齐：总是展示5种代币的决策；若缺失则以 Hold 占位
          const decisions: Trading[] = (() => {
            const bySymbol = new Map<string, Trading>();
            for (const t of chat.tradings) bySymbol.set(t.symbol, t);

            const filled: Trading[] = [];
            for (const sym of DEFAULT_FIVE_SYMBOLS) {
              const exist = bySymbol.get(sym);
              if (exist) {
                filled.push(exist);
              } else {
                filled.push({
                  id: `virtual-${chat.id}-${sym}`,
                  symbol: sym,
                  opeartion: "Hold",
                  leverage: null,
                  amount: null,
                  pricing: null,
                  stopLoss: null,
                  takeProfit: null,
                  createdAt: chat.createdAt,
                });
              }
            }
            return filled;
          })();

          return (
            <Card key={chat.id} className="overflow-hidden max-w-[600px]">
              {/* Collapsed Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-sm">{chat.model}</h3>
                      <span className="text-xs text-muted-foreground">
                        • {decisions.length} decision
                        {decisions.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Chat preview with markdown */}
                    <div
                      className={`prose prose-sm max-w-none dark:prose-invert text-xs ${isExpanded ? "" : "line-clamp-2"
                        }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {chat.chat}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(chat.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    {/* User Prompt */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <span className="text-sm">📝</span>
                        User Prompt
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="prose prose-sm max-w-none dark:prose-invert text-xs">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {chat.userPrompt}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>

                    {/* Chain of Thought */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <span className="text-sm">🧠</span>
                        Chain of Thought
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="prose prose-sm max-w-none dark:prose-invert text-xs">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {chat.reasoning}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>

                    {/* Decisions */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <span className="text-sm">⚡</span>
                        Trading Decisions
                      </div>
                      <div className="space-y-2">
                        {decisions.map((decision, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg p-3 border-l-4 ${decision.opeartion === "Buy"
                              ? "bg-green-50 dark:bg-green-950/20 border-green-500"
                              : decision.opeartion === "Sell"
                                ? "bg-red-50 dark:bg-red-950/20 border-red-500"
                                : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-500"
                              }`}
                          >
                            {/* Decision header */}
                            <div className="flex items-center gap-2 mb-2">
                              {renderOperationIcon(decision.opeartion)}
                              <span className="font-bold text-sm">
                                {decision.opeartion.toUpperCase()}
                              </span>
                              <span className="font-mono font-bold text-sm">
                                {decision.symbol}
                              </span>
                            </div>

                            {/* Decision details */}
                            <div className="space-y-1.5 text-xs">
                              {decision.pricing && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">
                                    {decision.opeartion === "Buy"
                                      ? "Entry Price:"
                                      : decision.opeartion === "Sell"
                                        ? "Exit Price:"
                                        : "Current Price:"}
                                  </span>
                                  <span className="font-mono font-semibold">
                                    ${decision.pricing.toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {decision.amount && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">
                                    Amount:
                                  </span>
                                  <span className="font-mono font-semibold">
                                    {decision.amount}
                                  </span>
                                </div>
                              )}
                              {decision.leverage && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">
                                    Leverage:
                                  </span>
                                  <span className="font-mono font-semibold text-purple-600">
                                    {decision.leverage}x
                                  </span>
                                </div>
                              )}
                              {decision.pricing && decision.amount && (
                                <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-current/20">
                                  <span className="text-muted-foreground font-semibold">
                                    Total:
                                  </span>
                                  <span className="font-mono font-bold">
                                    $
                                    {(
                                      decision.pricing * decision.amount
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {(decision.stopLoss || decision.takeProfit) && (
                                <div className="pt-1.5 mt-1.5 border-t border-current/20 space-y-1">
                                  {decision.stopLoss && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">
                                        Stop Loss:
                                      </span>
                                      <span className="font-mono font-semibold text-red-500">
                                        ${decision.stopLoss.toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {decision.takeProfit && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">
                                        Take Profit:
                                      </span>
                                      <span className="font-mono font-semibold text-green-500">
                                        ${decision.takeProfit.toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* K线趋势预测 */}
                              {decision.prediction && (
                                <div className="pt-2 mt-2 border-t border-current/30 space-y-1.5">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                      📊 Trend Prediction
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${decision.prediction.confidence === "high"
                                      ? "bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200"
                                      : decision.prediction.confidence === "medium"
                                        ? "bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                                        : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                      }`}>
                                      {decision.prediction.confidence.toUpperCase()}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Short-term Trend:</span>
                                    <span className={`font-semibold flex items-center gap-1 ${decision.prediction.short_term_trend === "bullish"
                                      ? "text-green-600 dark:text-green-400"
                                      : decision.prediction.short_term_trend === "bearish"
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-gray-600 dark:text-gray-400"
                                      }`}>
                                      {decision.prediction.short_term_trend === "bullish" && "📈 Bullish"}
                                      {decision.prediction.short_term_trend === "bearish" && "📉 Bearish"}
                                      {decision.prediction.short_term_trend === "neutral" && "➡️ Neutral"}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Support:</span>
                                    <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                                      ${decision.prediction.key_levels.support.toLocaleString()}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Resistance:</span>
                                    <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                                      ${decision.prediction.key_levels.resistance.toLocaleString()}
                                    </span>
                                  </div>

                                  <div className="pt-1 text-xs text-muted-foreground italic">
                                    💡 {decision.prediction.analysis}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Expand/Collapse button */}
              <button
                onClick={() => setExpandedChatId(isExpanded ? null : chat.id)}
                className="w-full border-t px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
              >
                <span>{isExpanded ? "Show less" : "Expand more"}</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""
                    }`}
                />
              </button>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden border-0 shadow-xl bg-gradient-to-br from-background via-background to-muted/20">
      <CardHeader className="pb-4 flex-shrink-0 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <CardTitle className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              AI Activity Feed
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Real-time decisions • Live reasoning
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col px-4 pb-4 min-h-0">
        {/* Premium Tabs */}
        <div className="flex gap-2 mb-4 flex-shrink-0 bg-muted/30 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("model-chat")}
            className={`relative flex-1 pb-2 px-4 text-xs font-bold rounded-lg transition-all duration-300 ${activeTab === "model-chat"
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
          >
            CHAT
            {activeTab === "model-chat" && (
              <div className="absolute inset-0 bg-white/20 rounded-lg animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("completed-trades")}
            className={`relative flex-1 pb-2 px-4 text-xs font-bold rounded-lg transition-all duration-300 ${activeTab === "completed-trades"
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
          >
            TRADES
            {activeTab === "completed-trades" && (
              <div className="absolute inset-0 bg-white/20 rounded-lg animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={`relative flex-1 pb-2 px-4 text-xs font-bold rounded-lg transition-all duration-300 ${activeTab === "positions"
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
          >
            POSITIONS
            {activeTab === "positions" && (
              <div className="absolute inset-0 bg-white/20 rounded-lg animate-pulse" />
            )}
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
          {activeTab === "model-chat" && renderModelChat()}
          {activeTab === "completed-trades" && renderCompletedTrades()}
          {activeTab === "positions" && renderPositions()}
        </div>
      </CardContent>
    </Card>
  );
}
