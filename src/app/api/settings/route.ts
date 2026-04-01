import { NextResponse } from "next/server";

import type { DashboardSettings } from "@/lib/dashboard-types";
import { readDashboardSettings, writeDashboardSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SettingsApiResponse =
  | { success: true; data: DashboardSettings }
  | { success: false; message: string };

export async function GET() {
  try {
    const data = await readDashboardSettings();

    return NextResponse.json<SettingsApiResponse>({
      success: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取服务端配置失败。";

    return NextResponse.json<SettingsApiResponse>(
      {
        success: false,
        message,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<DashboardSettings>;
    const data = await writeDashboardSettings(body);

    return NextResponse.json<SettingsApiResponse>({
      success: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存服务端配置失败。";

    return NextResponse.json<SettingsApiResponse>(
      {
        success: false,
        message,
      },
      { status: 400 },
    );
  }
}
