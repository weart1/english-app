import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronRight,
  DatabaseBackup,
  FileDown,
  FileUp,
  HardDrive,
  Pencil,
  Smartphone,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button, IconButton } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Toggle } from '@/components/Toggle';
import { Dialog } from '@/components/Dialog';
import { BottomSheet } from '@/components/BottomSheet';
import { useSettings, useTags, useWordCount } from '@/db/queries';
import { clearAllData, deleteTag, resetDailyPick, updateSettings, updateTag } from '@/db/repo';
import { Chip } from '@/components/Chip';
import { Segmented } from '@/components/Segmented';
import { CEFR_LEVELS, type CefrLevel } from '@/data/wordbank/types';
import { ALL_TOPICS, PHRASE_TOPICS, WORD_TOPICS } from '@/data/wordbank/topics';
import { studyDayKey } from '@/lib/dates';
import type { Backup, RestoreMode, RestorePlan } from '@/db/backup';
import type { Tag } from '@/db/types';
import { useSpeech } from '@/hooks/useSpeech';
import { usePersistentStorage } from '@/hooks/usePersistentStorage';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatBytes } from '@/lib/storage';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

export default function Settings() {
  const navigate = useNavigate();
  const settings = useSettings();
  const tags = useTags();
  const wordCount = useWordCount();
  const speech = useSpeech();
  const storage = usePersistentStorage();
  const [busy, setBusy] = useState<string | null>(null);

  const save = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch).catch((e: unknown) => toast.error(errorMessage(e)));
  };

  const runExport = async (kind: 'json' | 'csv') => {
    setBusy(kind);
    try {
      const actions = await import('@/app/dataActions');
      const outcome = kind === 'json' ? await actions.exportJsonBackup() : await actions.exportCsv();
      if (outcome !== 'cancelled') toast.success(kind === 'json' ? ru.settings.exported : ru.settings.exportedCsv);
    } catch (e) {
      toast.error(`${ru.settings.exportFailed}. ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={ru.settings.title} large={false} back="/">
      <div className="flex flex-col gap-4 pt-2">
        <Card title={ru.settings.study}>
          <Row label={ru.settings.dailyGoal}>
            <Stepper
              value={settings.dailyGoal}
              min={1}
              max={200}
              onChange={(v) => save({ dailyGoal: v })}
              label={ru.settings.dailyGoal}
            />
          </Row>
          <Row label={ru.settings.newPerDay}>
            <Stepper
              value={settings.newWordsPerDay}
              min={0}
              max={200}
              onChange={(v) => save({ newWordsPerDay: v })}
              label={ru.settings.newPerDay}
            />
          </Row>
          <Row label={ru.settings.dayStart} hint={ru.settings.dayStartHint} htmlFor="day-start">
            <select
              id="day-start"
              value={settings.dayStartsAtHour}
              onChange={(e) => save({ dayStartsAtHour: Number(e.target.value) })}
              className="min-h-11 rounded-[12px] border border-[#dfe6f3] bg-white px-3 font-medium"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {ru.settings.hour(h)}
                </option>
              ))}
            </select>
          </Row>
        </Card>

        <Card title={ru.settings.audio}>
          {/* Controls always render (disabled without TTS) so the layout never shifts when voices finish loading. */}
          <fieldset disabled={!speech.supported} className="disabled:opacity-60">
            <div className="py-2">
              <label htmlFor="voice" className="mb-1.5 block font-medium">
                {ru.settings.voice}
              </label>
              <div className="flex gap-2">
                <select
                  id="voice"
                  value={settings.ttsVoiceURI ?? ''}
                  onChange={(e) => save({ ttsVoiceURI: e.target.value || undefined })}
                  className="min-h-11 min-w-0 flex-1 rounded-[12px] border border-[#dfe6f3] bg-white px-3"
                >
                  <option value="">{ru.settings.voiceDefault}</option>
                  {speech.voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <Button
                  variant="soft"
                  icon={<Volume2 aria-hidden="true" className="size-4" />}
                  onClick={() => speech.speak(ru.settings.voiceTestPhrase)}
                >
                  {ru.settings.voiceTest}
                </Button>
              </div>
            </div>
            <div className="py-2">
              <label htmlFor="rate" className="mb-1 flex items-center justify-between font-medium">
                {ru.settings.rate}
                <span className="text-muted tabular-nums">{settings.ttsRate.toFixed(2)}×</span>
              </label>
              <input
                id="rate"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.ttsRate}
                onChange={(e) => save({ ttsRate: Number(e.target.value) })}
                className="accent-primary-500 h-11 w-full"
              />
            </div>
            <Toggle
              checked={settings.autoPlayAudio}
              onChange={(v) => save({ autoPlayAudio: v })}
              label={ru.settings.autoPlay}
              disabled={!speech.supported}
            />
          </fieldset>
          <p className="text-muted min-h-[1.4em] text-[0.9rem]" aria-live="polite">
            {speech.supported ? '' : ru.settings.ttsUnavailable}
          </p>
        </Card>

        <DailySettings />

        <TagsCard tags={tags ?? []} />

        <Card title={ru.settings.data}>
          <p className="text-muted mb-3 text-[0.9rem]">
            {settings.lastBackupAt
              ? ru.settings.lastBackup(formatDateTime(settings.lastBackupAt))
              : ru.settings.noBackup}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              disabled={!!busy}
              onClick={() => void runExport('json')}
              icon={<DatabaseBackup aria-hidden="true" className="size-5" />}
            >
              {ru.settings.exportJson}
            </Button>
            <Button
              variant="secondary"
              block
              disabled={!!busy || !wordCount}
              onClick={() => void runExport('csv')}
              icon={<FileDown aria-hidden="true" className="size-5" />}
            >
              {ru.settings.exportCsv}
            </Button>
            <RestoreButton />
            <Button
              variant="ghost"
              block
              onClick={() => navigate('/import')}
              icon={<FileUp aria-hidden="true" className="size-5" />}
            >
              {ru.settings.importWords}
            </Button>
          </div>
        </Card>

        <Card title={ru.settings.storage}>
          <div className="flex items-start gap-3">
            <HardDrive aria-hidden="true" className="text-primary-600 mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{ru.settings.persisted(storage.persisted)}</p>
              <p className="text-muted min-h-[1.4em] text-[0.9rem]">
                {storage.estimate && storage.estimate.quota > 0
                  ? ru.settings.usage(formatBytes(storage.estimate.usage), formatBytes(storage.estimate.quota))
                  : ''}
              </p>
              <p className="text-muted mt-1 text-[0.9rem]">{ru.settings.persistHint}</p>
              {storage.persisted !== true && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-2"
                  disabled={storage.persisted === null}
                  onClick={() => void storage.request()}
                >
                  {ru.settings.persistRequest}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card title={ru.settings.about}>
          <button
            type="button"
            onClick={() => navigate('/install')}
            className="flex min-h-12 w-full items-center gap-3 text-left"
          >
            <Smartphone aria-hidden="true" className="text-primary-600 size-5" />
            <span className="flex-1 font-medium">{ru.settings.installGuide}</span>
            <ChevronRight aria-hidden="true" className="text-muted size-5" />
          </button>
          <p className="text-muted text-[0.9rem]">{ru.settings.version(__APP_VERSION__)}</p>
        </Card>

        <DangerZone onDone={() => navigate('/', { replace: true })} />
      </div>
    </Screen>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="solid-card p-4">
      <h2 className="text-muted text-caption mb-2 font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block font-medium">
          {label}
        </label>
        {hint && <p className="text-muted text-caption mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Tags ---------- */

function TagsCard({ tags }: { tags: Tag[] }) {
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  const saveName = async () => {
    if (!editing) return;
    try {
      await updateTag(editing.id, { name });
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card title={ru.settings.tagsTitle}>
      {tags.length === 0 ? (
        <p className="text-muted">{ru.settings.tagsEmpty}</p>
      ) : (
        <ul className="-mx-1 divide-y divide-[#eef2fa]">
          {tags.map((t) => (
            <li key={t.id} className="flex min-h-12 items-center gap-2 px-1">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
              <IconButton
                label={`${ru.settings.tagRename}: ${t.name}`}
                onClick={() => {
                  setEditing(t);
                  setName(t.name);
                  setError(null);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={`${ru.settings.tagDelete}: ${t.name}`}
                className="text-danger-600"
                onClick={() => setDeleting(t)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={ru.settings.tagRename}
        footer={
          <Button size="lg" block onClick={() => void saveName()}>
            {ru.common.save}
          </Button>
        }
      >
        <input
          aria-label={ru.editor.newTagPlaceholder}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveName();
          }}
          aria-invalid={!!error}
          className="focus:border-primary-500 min-h-12 w-full rounded-[14px] border border-[#dfe6f3] bg-white px-3.5 outline-none"
        />
        {error && (
          <p role="alert" className="text-danger-600 text-caption mt-1">
            {error}
          </p>
        )}
      </BottomSheet>
      <Dialog
        open={!!deleting}
        title={ru.settings.tagDelete}
        body={deleting ? ru.settings.tagDeleteConfirm(deleting.name) : ''}
        confirmLabel={ru.common.delete}
        confirmVariant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const t = deleting;
          setDeleting(null);
          if (t) deleteTag(t.id).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </Card>
  );
}

/* ---------- Restore ---------- */

function RestoreButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      const { parseBackup } = await import('@/db/backup');
      const res = parseBackup(await file.text());
      if (!res.ok) {
        setError(res.error === 'newer' ? ru.restore.newerVersion : ru.restore.invalid);
        return;
      }
      setBackup(res.backup);
    } catch {
      setError(ru.restore.invalid);
    }
  };

  const choose = async (mode: RestoreMode) => {
    if (!backup) return;
    const { planRestore } = await import('@/db/backup');
    setPlan(await planRestore(backup, mode));
  };

  const apply = async () => {
    if (!backup || !plan || busy) return;
    setBusy(true);
    try {
      const { applyRestore } = await import('@/db/backup');
      await applyRestore(backup, plan.mode);
      toast.success(ru.restore.done);
      setBackup(null);
      setPlan(null);
    } catch (e) {
      toast.error(`${ru.restore.failed} ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label={ru.restore.chooseFile}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        block
        onClick={() => fileRef.current?.click()}
        icon={<Upload aria-hidden="true" className="size-5" />}
      >
        {ru.settings.importBackup}
      </Button>
      {error && (
        <p role="alert" className="text-danger-600 text-[0.9rem]">
          {error}
        </p>
      )}
      <BottomSheet open={!!backup && !plan} onClose={() => setBackup(null)} title={ru.restore.title}>
        {backup && (
          <div className="flex flex-col gap-3 pb-2">
            <p>{ru.restore.summary(backup.words.length, backup.logs.length, formatDate(backup.exportedAt))}</p>
            <button
              type="button"
              onClick={() => void choose('merge')}
              className="solid-card flex flex-col items-start p-4 text-left"
            >
              <span className="font-semibold">{ru.restore.merge}</span>
              <span className="text-muted text-[0.9rem]">{ru.restore.mergeHint}</span>
            </button>
            <button
              type="button"
              onClick={() => void choose('replace')}
              className="solid-card flex flex-col items-start p-4 text-left"
            >
              <span className="text-danger-600 font-semibold">{ru.restore.replace}</span>
              <span className="text-muted text-[0.9rem]">{ru.restore.replaceHint}</span>
            </button>
          </div>
        )}
      </BottomSheet>
      <Dialog
        open={!!plan}
        title={plan?.mode === 'replace' ? ru.restore.replace : ru.restore.merge}
        body={
          plan
            ? plan.mode === 'replace'
              ? ru.restore.planReplace(plan.currentWords, plan.incomingWords)
              : ru.restore.planMerge(plan.added, plan.updated, plan.unchanged)
            : ''
        }
        confirmLabel={ru.restore.confirm}
        confirmVariant={plan?.mode === 'replace' ? 'danger' : 'primary'}
        confirmDisabled={busy}
        onCancel={() => setPlan(null)}
        onConfirm={() => void apply()}
      />
    </>
  );
}

/* ---------- Delete everything ---------- */

function DangerZone({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (step !== 2) setTyped('');
  }, [step]);
  const ok = typed.trim().toUpperCase() === ru.settings.deleteAllWord;
  return (
    <section className="solid-card p-4">
      <h2 className="text-danger-600 text-caption mb-2 font-semibold tracking-wide uppercase">{ru.settings.danger}</h2>
      <Button
        variant="secondary"
        block
        className="text-danger-600"
        onClick={() => setStep(1)}
        icon={<Trash2 aria-hidden="true" className="size-5" />}
      >
        {ru.settings.deleteAll}
      </Button>
      <Dialog
        open={step === 1}
        title={ru.settings.deleteAll}
        body={ru.settings.deleteAllConfirm1}
        confirmLabel={ru.common.continue}
        confirmVariant="danger"
        onCancel={() => setStep(0)}
        onConfirm={() => setStep(2)}
      />
      <Dialog
        open={step === 2}
        title={ru.settings.deleteAll}
        body={ru.settings.deleteAllConfirm2}
        confirmLabel={ru.common.delete}
        confirmVariant="danger"
        confirmDisabled={!ok}
        onCancel={() => setStep(0)}
        onConfirm={() => {
          if (!ok) return;
          setStep(0);
          clearAllData()
            .then(() => {
              toast.info(ru.settings.deleteAllDone);
              onDone();
            })
            .catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      >
        <input
          aria-label={ru.settings.deleteAllConfirm2}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={ru.settings.deleteAllWord}
          className="focus:border-danger-500 min-h-12 w-full rounded-[14px] border border-[#dfe6f3] bg-white px-3.5 outline-none"
        />
      </Dialog>
    </section>
  );
}

/* ---------- "Слова дня" ---------- */

function DailySettings() {
  const settings = useSettings();
  const save = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch).catch((e: unknown) => toast.error(errorMessage(e)));
  };
  const toggleLevel = (l: CefrLevel) => {
    const cur = settings.dailyLevels;
    const next = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l];
    if (next.length) save({ dailyLevels: CEFR_LEVELS.filter((x) => next.includes(x)) });
  };
  const toggleTopic = (key: string) => {
    const cur = settings.dailyTopics;
    save({ dailyTopics: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] });
  };
  const topics = settings.dailyKind === 'words' ? WORD_TOPICS : settings.dailyKind === 'phrases' ? PHRASE_TOPICS : ALL_TOPICS;
  const refresh = async () => {
    try {
      await resetDailyPick(studyDayKey(new Date(), settings.dayStartsAtHour));
      toast.success(ru.daily.refreshed);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card title={ru.daily.settingsTitle}>
      <Row label={ru.daily.settingsCount}>
        <Stepper value={settings.dailyCount} min={0} max={20} onChange={(v) => save({ dailyCount: v })} label={ru.daily.settingsCount} />
      </Row>
      <div className="py-2">
        <p className="mb-1.5 font-medium">{ru.daily.settingsKind}</p>
        <Segmented
          label={ru.daily.settingsKind}
          value={settings.dailyKind}
          onChange={(v) => save({ dailyKind: v })}
          options={[
            { value: 'both', label: ru.daily.kindBoth },
            { value: 'words', label: ru.daily.kindWords },
            { value: 'phrases', label: ru.daily.kindPhrases },
          ]}
        />
      </div>
      <div className="py-2">
        <p className="font-medium">{ru.daily.settingsLevels}</p>
        <p className="text-muted text-caption mb-2">{ru.daily.levelHint}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={ru.daily.settingsLevels}>
          {CEFR_LEVELS.map((l) => (
            <Chip key={l} active={settings.dailyLevels.includes(l)} onClick={() => toggleLevel(l)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <div className="py-2">
        <p className="mb-2 font-medium">{ru.daily.settingsTopics}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={ru.daily.settingsTopics}>
          <Chip active={settings.dailyTopics.length === 0} onClick={() => save({ dailyTopics: [] })}>
            {ru.daily.settingsAllTopics}
          </Chip>
          {topics.map((t) => (
            <Chip key={t.key} active={settings.dailyTopics.includes(t.key)} onClick={() => toggleTopic(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <Button variant="ghost" block onClick={() => void refresh()}>
        {ru.daily.refresh}
      </Button>
    </Card>
  );
}
