import pb from '@/lib/pocketbase';
import type { SettingsRecord, SettingsCategory } from '@/types/database';

/**
 * Fetch all settings from PocketBase.
 */
export async function fetchSettings(): Promise<SettingsRecord[]> {
  return pb.collection('settings').getFullList<SettingsRecord>({
    sort: 'category,key',
    requestKey: null, // Disable auto-cancellation
  });
}

/**
 * Fetch settings filtered by a specific category.
 */
export async function fetchSettingsByCategory(
  category: SettingsCategory
): Promise<SettingsRecord[]> {
  return pb.collection('settings').getFullList<SettingsRecord>({
    filter: `category = "${category}"`,
    sort: 'key',
    requestKey: null, // Disable auto-cancellation
  });
}

/**
 * Update a single setting's value.
 */
export async function updateSetting(
  id: string,
  value: string
): Promise<SettingsRecord> {
  return pb.collection('settings').update<SettingsRecord>(id, { value });
}
