-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('Deepseek', 'DeepseekThinking', 'Qwen', 'Doubao', 'Gemini', 'Kimi');

-- CreateEnum
CREATE TYPE "Opeartion" AS ENUM ('Buy', 'Sell', 'Hold');

-- CreateEnum
CREATE TYPE "Symbol" AS ENUM ('BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'MSFT', 'NVDA');

-- CreateTable
CREATE TABLE "Metrics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" "ModelType" NOT NULL,
    "metrics" JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "model" "ModelType" NOT NULL DEFAULT 'Deepseek',
    "chat" TEXT NOT NULL DEFAULT '<no chat>',
    "reasoning" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trading" (
    "id" TEXT NOT NULL,
    "symbol" "Symbol" NOT NULL,
    "opeartion" "Opeartion" NOT NULL,
    "leverage" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "pricing" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "prediction" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatId" TEXT,
    "tradingDecisionId" TEXT,

    CONSTRAINT "Trading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingLesson" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "symbol" "Symbol" NOT NULL,
    "decision" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,
    "pnlPercentage" DOUBLE PRECISION NOT NULL,
    "lessonText" TEXT NOT NULL,
    "exitReason" TEXT NOT NULL,
    "marketConditions" JSONB,
    "indicatorsAtEntry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDecision" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketSnapshot" JSONB NOT NULL,
    "pdfSummaries" JSONB,
    "techAnalysis" JSONB NOT NULL,
    "fundamentalAnalysis" JSONB NOT NULL,
    "sentimentAnalysis" JSONB NOT NULL,
    "finalDecision" JSONB NOT NULL,
    "actualProfitLoss" DOUBLE PRECISION,
    "closeTimestamp" TIMESTAMP(3),
    "closeReason" TEXT,
    "postAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLearning" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "tradeDecisionId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorDescription" TEXT NOT NULL,
    "lessonLearned" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingLesson_outcome_idx" ON "TradingLesson"("outcome");

-- CreateIndex
CREATE INDEX "TradingLesson_createdAt_idx" ON "TradingLesson"("createdAt");

-- CreateIndex
CREATE INDEX "TradingLesson_symbol_idx" ON "TradingLesson"("symbol");

-- CreateIndex
CREATE INDEX "TradingDecision_timestamp_idx" ON "TradingDecision"("timestamp");

-- CreateIndex
CREATE INDEX "TradingDecision_closeTimestamp_idx" ON "TradingDecision"("closeTimestamp");

-- CreateIndex
CREATE INDEX "AgentLearning_agentName_idx" ON "AgentLearning"("agentName");

-- CreateIndex
CREATE INDEX "AgentLearning_timestamp_idx" ON "AgentLearning"("timestamp");

-- CreateIndex
CREATE INDEX "AgentLearning_errorType_idx" ON "AgentLearning"("errorType");

-- AddForeignKey
ALTER TABLE "Trading" ADD CONSTRAINT "Trading_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trading" ADD CONSTRAINT "Trading_tradingDecisionId_fkey" FOREIGN KEY ("tradingDecisionId") REFERENCES "TradingDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingLesson" ADD CONSTRAINT "TradingLesson_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLearning" ADD CONSTRAINT "AgentLearning_tradeDecisionId_fkey" FOREIGN KEY ("tradeDecisionId") REFERENCES "TradingDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
