import { useCallback, useEffect, useState } from 'react';
import { isStoragePersisted, requestPersistentStorage, storageEstimate } from '@/lib/storage';

/** Persistent-storage status for Settings ("Хранилище защищено от очистки"). */
export function usePersistentStorage() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void isStoragePersisted().then((v) => alive && setPersisted(v));
    void storageEstimate().then((v) => alive && setEstimate(v));
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(async () => {
    setPersisted(await requestPersistentStorage());
  }, []);

  return { persisted, estimate, request };
}
