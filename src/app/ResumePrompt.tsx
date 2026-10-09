import { useLocation, useNavigate } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { useActiveSession } from '@/db/queries';
import { discardActiveSession, finishActiveSession } from '@/db/repo';
import { errorMessage } from '@/lib/errors';
import { useSessionUi } from '@/store/session';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

/**
 * If iOS killed the app mid-session, offer to continue it on the next launch.
 * Shown at most once per launch and never on the session screens themselves.
 */
export function ResumePrompt() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = useActiveSession();
  const { resumePrompted, setResumePrompted, startedByGesture } = useSessionUi();

  const onSessionRoute = location.pathname.startsWith('/session');
  // A session started in this page lifetime is not "interrupted".
  const open = !!active && !resumePrompted && !onSessionRoute && !startedByGesture && active.queue.items.length > 0;
  if (!open || !active) return null;

  const left = new Set(active.queue.items.map((i) => i.cardId)).size;

  return (
    <Dialog
      open
      title={ru.today.resumeTitle}
      body={ru.today.resumeBody(left)}
      confirmLabel={ru.common.continue}
      cancelLabel={ru.today.resumeFinish}
      onConfirm={() => {
        setResumePrompted();
        navigate('/session');
      }}
      onCancel={() => {
        setResumePrompted();
        const done = active.answers > 0 ? finishActiveSession(active) : discardActiveSession();
        done.catch((e: unknown) => toast.error(errorMessage(e)));
      }}
    />
  );
}
