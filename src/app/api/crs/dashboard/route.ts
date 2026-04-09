import { NextResponse } from "next/server";

import { loadCrsDashboardData } from "@/lib/crs-client";

export const dynamic = "force-dynamic";

type CrsRequestBody = {
  baseUrl?: string;
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CrsRequestBody;

    const data = await loadCrsDashboardData({
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CRS 数据加载失败。";
    const status = /登录|密码|用户名|401|403/i.test(message) ? 401 : 400;

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status },
    );
  }
}
