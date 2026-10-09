import { ru } from '@/i18n/ru';

/** True for storage-quota failures, including Dexie-wrapped ones. */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; inner?: unknown; code?: number };
  if (err.name === 'QuotaExceededError' || err.code === 22) return true;
  if (err.name === 'AbortError' && err.inner) return isQuotaError(err.inner);
  if (err.inner) return isQuotaError(err.inner);
  return false;
}

/** Converts any thrown value into a friendly Russian message. */
export function errorMessage(e: unknown): string {
  if (isQuotaError(e)) return ru.errors.quota;
  if (e && typeof e === 'object' && 'name' in e) {
    const name = String((e as { name: unknown }).name);
    if (/Dexie|IndexedDB|Database|Transaction|Constraint|DataError|InvalidState|OpenFailed|Version/i.test(name)) {
      return ru.errors.dbGeneric;
    }
  }
  if (e instanceof UserFacingError) return e.message;
  return ru.errors.dbGeneric;
}

/** An error whose message is already user-facing Russian text. */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}
