import { NextResponse } from "next/server";

import type { AuthType, DashboardRequest } from "@/lib/dashboard-types";
import { loadDashboardData } from "@/lib/newapi-client";

export const dynamic = "force-dynamic";

function isAuthType(value: unknown): value is AuthType {
  return (
    value === "authorization" ||
    value === "session" ||
    value === "new-api-user"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DashboardRequest>;

    if (!isAuthType(body.authType)) {
      throw new Error("不支持的鉴权方式。");
    }

    const data = await loadDashboardData({
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      authType: body.authType,
      authValue: typeof body.authValue === "string" ? body.authValue : "",
      startTimestamp: Number(body.startTimestamp),
      endTimestamp: Number(body.endTimestamp),
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "加载额度数据时发生未知错误。";
    const status = /401|403|登录|鉴权|Cookie/i.test(message) ? 401 : 400;

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status },
    );
  }
}
