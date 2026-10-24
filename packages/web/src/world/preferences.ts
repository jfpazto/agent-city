import { emptySlots, relationKey, type Relation, type Slots } from "./model.ts";

export const CITY_STORAGE_KEY = "ciudad.neighborhoods.v1";
export type CityPreferences = { slots: Slots; relations: Relation[]; motion: boolean; sound: boolean };
export const emptyPreferences = (): CityPreferences => ({ slots: emptySlots(), relations: [], motion: true, sound: false });

/** Estado local validado; una config corrupta o un navegador sin almacenamiento no bloquean la app. */
export function loadPreferences(storage?: Pick<Storage, "getItem">): CityPreferences {
  const result = emptyPreferences();
  try {
    const raw = JSON.parse(storage?.getItem(CITY_STORAGE_KEY) ?? "null");
    if (!raw || raw.version !== 1) return result;
    for (const provider of ["claude", "codex"] as const) {
      const ids: unknown = raw.slots?.[provider];
      if (Array.isArray(ids)) result.slots[provider] = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 8192))].slice(0, 1000);
    }
    const seen = new Set<string>();
    if (Array.isArray(raw.relations)) for (const r of raw.relations.slice(0, 500)) {
      if (typeof r?.from !== "string" || typeof r?.to !== "string" || !r.from || !r.to || r.from.length > 8192 || r.to.length > 8192 || r.from === r.to) continue;
      const key = relationKey(r.from, r.to);
      if (!seen.has(key)) { seen.add(key); result.relations.push({ from: r.from, to: r.to }); }
    }
    if (typeof raw.motion === "boolean") result.motion = raw.motion;
    if (typeof raw.sound === "boolean") result.sound = raw.sound;
  } catch { /* Sin localStorage o contenido inválido. */ }
  return result;
}

export function savePreferences(preferences: CityPreferences, storage?: Pick<Storage, "setItem">): boolean {
  try {
    if (!storage) return false;
    storage.setItem(CITY_STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }));
    return true;
  } catch { return false; }
}
