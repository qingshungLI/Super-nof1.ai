import cron from "node-cron";
import jwt from "jsonwebtoken";

const runMetricsInterval = async () => {
  const token = jwt.sign(
    {
      sub: "cron-token",
    },
    process.env.CRON_SECRET_KEY || ""
  );

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/cron/20-seconds-metrics-interval?token=${token}`,
      {
        method: "GET",
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[cron:metrics] Failed (${response.status}): ${errorText}`
      );
    }
  } catch (error) {
    console.error("[cron:metrics] Error:", error);
  }
};

// every 30 seconds
cron.schedule("*/30 * * * * *", async () => {
  await runMetricsInterval();
});

// 🔒 添加锁机制，防止并发执行
let isRunningChat = false;

const runChatInterval = async () => {
  // 如果已经在运行中，跳过本次执行
  if (isRunningChat) {
    console.log("⏭️ Trading analysis already running, skipping...");
    return;
  }

  isRunningChat = true;
  console.log("🤖 Trading analysis starting...");
  const token = jwt.sign(
    {
      sub: "cron-token",
    },
    process.env.CRON_SECRET_KEY || ""
  );

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/cron/3-minutes-run-interval?token=${token}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(900000), // 15分钟超时
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[cron:chat] Failed (${response.status}): ${errorText}`
      );
    } else {
      console.log("✅ Trading analysis completed");
    }
  } catch (error) {
    console.error("[cron:chat] Error:", error);
  } finally {
    // 无论成功还是失败，都要释放锁
    isRunningChat = false;
  }
};

// every 3 minutes - optimized for active trading
cron.schedule("*/3 * * * *", async () => {
  await runChatInterval();
});

// 🌅 市场报告任务 - 每 30 分钟执行一次
let isRunningReport = false;

const runDailyMarketReport = async () => {
  // 防止并发执行
  if (isRunningReport) {
    console.log("⏭️ Market report already running, skipping...");
    return;
  }

  isRunningReport = true;
  console.log("📊 Market report starting...");
  const token = jwt.sign(
    {
      sub: "cron-token",
    },
    process.env.CRON_SECRET_KEY || ""
  );

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/cron/daily-market-report`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(300000), // 5分钟超时
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[cron:market-report] Failed (${response.status}): ${errorText}`
      );
    } else {
      const result = await response.json();
      console.log("✅ Market report completed:", result.filename);
    }
  } catch (error) {
    console.error("[cron:market-report] Error:", error);
  } finally {
    isRunningReport = false;
  }
};

// 每 30 分钟执行一次市场报告
cron.schedule("*/30 * * * *", async () => {
  await runDailyMarketReport();
});

// 🚀 启动时立即执行一次市场报告
setTimeout(() => {
  console.log("🚀 Running initial market report...");
  runDailyMarketReport();
}, 5000); // 延迟 5 秒，等待服务完全启动

console.log("⏰ Cron jobs initialized:");
console.log("  - Metrics: Every 30 seconds");
console.log("  - Trading: Every 3 minutes");
console.log("  - Market Report: Every 30 minutes (+ runs on startup)");
