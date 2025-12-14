import { NextResponse } from "next/server";
import { getCurrentMarketState, MarketState } from "@/lib/trading/current-market-state";
import { fetchPositions, Position } from "@/lib/trading/positions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 支持的交易对
const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "DOGE/USDT"];

interface MarketDataResponse {
    success: boolean;
    data?: {
        markets: {
            symbol: string;
            state: MarketState;
        }[];
        positions: Position[];
        timestamp: string;
    };
    error?: string;
}

export async function GET(): Promise<NextResponse<MarketDataResponse>> {
    try {
        // 并行获取所有市场数据和持仓
        const [marketsResults, positions] = await Promise.all([
            Promise.allSettled(
                SYMBOLS.map(async (symbol) => {
                    const state = await getCurrentMarketState(symbol);
                    return { symbol, state };
                })
            ),
            fetchPositions().catch(err => {
                console.error("Error fetching positions:", err);
                return [];
            })
        ]);

        // 处理市场数据结果
        const markets = marketsResults
            .filter((result): result is PromiseFulfilledResult<{ symbol: string; state: MarketState }> =>
                result.status === "fulfilled"
            )
            .map(result => result.value);

        // 记录失败的请求
        marketsResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(`Failed to fetch ${SYMBOLS[index]}:`, result.reason);
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                markets,
                positions,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Error in market-data API:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
