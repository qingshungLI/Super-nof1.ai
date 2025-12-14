import { run } from "@/lib/ai/run";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { checkAndRecordClosedPositions } from "@/lib/trading/position-monitor";

// 设置API路由的最大执行时间为15分钟（900秒）
// 该文件的cron部署在本地而不是云端
export const maxDuration = 900; // 15分钟
export const dynamic = 'force-dynamic'; // 强制动态渲染

// 🔒 添加全局锁，防止并发执行
let isRunning = false;
let lastRunTime = 0;

export const GET = async (request: NextRequest) => {
  // 🔒 检查是否已经在运行
  if (isRunning) {
    console.log("⏭️ [API] Trading bot already running, skipping...");
    return new Response("Trading bot already running", { status: 429 });
  }

  // 🔒 防抖：如果距离上次运行不到 10 秒，拒绝执行
  const now = Date.now();
  if (now - lastRunTime < 10000) {
    console.log("⏭️ [API] Too soon since last run, skipping...");
    return new Response("Too soon since last run", { status: 429 });
  }

  // Extract token from query parameters
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token is required", { status: 400 });
  }

  try {
    jwt.verify(token, process.env.CRON_SECRET_KEY || "");
  } catch (error) {
    return new Response("Invalid token", { status: 401 });
  }

  console.log("🤖 [Cron Job] Starting 3-minutes trading run...");

  // 🔒 设置锁
  isRunning = true;
  lastRunTime = now;

  try {
    // Run trading bot (auto-detects initial capital from current balance)
    await run();
    console.log("✅ [Cron Job] 3-minutes trading run executed successfully.");
    
    // 🎓 Check for closed positions and record lessons
    console.log("📚 [Cron Job] Checking for closed positions to record lessons...");
    try {
      await checkAndRecordClosedPositions();
      console.log("✅ [Cron Job] Position check completed.");
    } catch (lessonError) {
      console.error("⚠️ [Cron Job] Error checking closed positions (non-critical):", lessonError);
      // Don't fail the whole cron job if lesson recording fails
    }
    
    return new Response("Trading run executed successfully");
  } catch (error) {
    console.error("❌ [Cron Job] Error during 3-minutes trading run:", error);
    return new Response(`Error during trading run: ${(error as Error).message}`, {
      status: 500,
    });
  } finally {
    // 🔒 释放锁
    isRunning = false;
  }
};