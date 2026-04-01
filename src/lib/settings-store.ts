import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DashboardSettings } from "@/lib/dashboard-types";
import { normalizeDashboardSettings } from "@/lib/dashboard-settings";

const SETTINGS_FILE_NAME = "dashboard-settings.json";

function getDataDirPath(): string {
  const configuredPath = process.env.APP_DATA_DIR?.trim();
  return configuredPath || path.join(process.cwd(), "data");
}

function getSettingsFilePath(): string {
  return path.join(getDataDirPath(), SETTINGS_FILE_NAME);
}

async function ensureDataDir(): Promise<void> {
  await mkdir(getDataDirPath(), { recursive: true });
}

export async function readDashboardSettings(): Promise<DashboardSettings> {
  try {
    const raw = await readFile(getSettingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    return normalizeDashboardSettings(parsed);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return normalizeDashboardSettings(null);
    }

    throw error;
  }
}

export async function writeDashboardSettings(
  rawSettings: Partial<DashboardSettings> | null | undefined,
): Promise<DashboardSettings> {
  const normalizedSettings = normalizeDashboardSettings(rawSettings);
  const settingsFilePath = getSettingsFilePath();
  const tempFilePath = `${settingsFilePath}.tmp`;

  await ensureDataDir();
  await writeFile(tempFilePath, `${JSON.stringify(normalizedSettings, null, 2)}\n`, "utf-8");
  await rename(tempFilePath, settingsFilePath);

  return normalizedSettings;
}
