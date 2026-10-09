import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DatabaseBackup, Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/Button';
import { isIOS, isIOSSafari, readLocal, useStandalone, writeLocal } from '@/hooks/useStandalone';
import { DAY_MS } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

const INSTALL_DISMISS_KEY = 'wf.installDismissedAt';
const INSTALL_DISMISS_DAYS = 14;
export const BACKUP_REMINDER_DAYS = 14;
export const BACKUP_REMINDER_MIN_WORDS = 10;

/** iOS has no beforeinstallprompt: explain "Share → Add to Home Screen". */
export function InstallBanner() {
  const navigate = useNavigate();
  const standalone = useStandalone();
  const [dismissedAt, setDismissedAt] = useState(() => Number(readLocal(INSTALL_DISMISS_KEY) ?? 0));
  if (standalone || !isIOS()) return null;
  if (Date.now() - dismissedAt < INSTALL_DISMISS_DAYS * DAY_MS) return null;
  const safari = isIOSSafari();
  const dismiss = () => {
    const t = Date.now();
    writeLocal(INSTALL_DISMISS_KEY, String(t));
    setDismissedAt(t);
  };
  return (
    <section className="solid-card relative flex gap-3 p-4 pr-12" aria-label={ru.install.bannerTitle}>
      <div className="bg-primary-100 text-primary-600 flex size-12 shrink-0 items-center justify-center rounded-[14px]" aria-hidden="true">
        {safari ? <Share className="size-6" /> : <SquarePlus className="size-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{ru.install.bannerTitle}</p>
        <p className="text-muted mt-0.5 text-[0.92rem]">{safari ? ru.install.bannerBody : ru.install.otherBrowser}</p>
        {safari && (
          <button type="button" className="text-primary-600 mt-1 min-h-11 text-[0.92rem] font-semibold" onClick={() => navigate('/install')}>
            {ru.install.guideLink}
          </button>
        )}
      </div>
      <IconButton label={ru.install.dismiss} onClick={dismiss} className="absolute top-2 right-2">
        <X aria-hidden="true" className="size-5" />
      </IconButton>
    </section>
  );
}

export function needsBackupReminder(wordCount: number, lastBackupAt: string | undefined, now: Date): boolean {
  if (wordCount < BACKUP_REMINDER_MIN_WORDS) return false;
  if (!lastBackupAt) return true;
  const t = Date.parse(lastBackupAt);
  return Number.isNaN(t) || now.getTime() - t > BACKUP_REMINDER_DAYS * DAY_MS;
}

export function BackupBanner({ wordCount, lastBackupAt, now }: { wordCount: number; lastBackupAt?: string; now: Date }) {
  const [busy, setBusy] = useState(false);
  if (!needsBackupReminder(wordCount, lastBackupAt, now)) return null;
  const run = async () => {
    setBusy(true);
    try {
      const { exportJsonBackup } = await import('@/app/dataActions');
      const outcome = await exportJsonBackup();
      if (outcome !== 'cancelled') toast.success(ru.settings.exported);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bg-accent-100 flex gap-3 rounded-[22px] p-4" aria-label={ru.today.backupTitle}>
      <div className="text-accent-700 flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-white/70" aria-hidden="true">
        <DatabaseBackup className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{ru.today.backupTitle}</p>
        <p className="text-accent-700 mt-0.5 text-[0.92rem]">{ru.today.backupBody}</p>
        <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => void run()}>
          {ru.today.backupAction}
        </Button>
      </div>
    </section>
  );
}
