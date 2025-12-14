import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";
import { NextResponse } from "next/server";
import { MetricData } from "@/lib/types/metrics";

// 返回所有历史数据，前端通过滑动窗口控制显示

export const GET = async () => {
  try {
    // 尝试获取多Agent系统的指标，如果不存在则获取任何可用的指标
    let metrics = await prisma.metrics.findFirst({
      where: {
        model: ModelType.Deepseek,
      },
    });

    // 如果没有 Deepseek 数据，尝试获取任何可用的指标
    if (!metrics) {
      metrics = await prisma.metrics.findFirst();
    }

    if (!metrics) {
      return NextResponse.json({
        data: {
          metrics: [],
          totalCount: 0,
        },
        success: true,
      });
    }

    const databaseMetrics = metrics.metrics as unknown as {
      createdAt: string;
      accountInformationAndPerformance: MetricData[];
    }[];

    const metricsData = databaseMetrics.map((item) => {
      return {
        ...item.accountInformationAndPerformance,
        createdAt: item?.createdAt || new Date().toISOString(),
      } as unknown as MetricData;
    });

    console.log(
      `📊 Returning all metrics: ${metricsData.length} points`
    );

    return NextResponse.json({
      data: {
        metrics: metricsData,
        totalCount: metricsData.length,
        model: "Multi-Agent",  // 统一使用 Multi-Agent 标识
        name: "Multi-Agent Trading System",
        createdAt: metrics?.createdAt || new Date().toISOString(),
        updatedAt: metrics?.updatedAt || new Date().toISOString(),
      },
      success: true,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json({
      data: {
        metrics: [],
        totalCount: 0,
        model: "Multi-Agent",
        name: "Multi-Agent Trading System",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      success: true,
    });
  }
};
