import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, CircleAlert, Copy, FileUp, Upload } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { GlassPanel } from '@/components/GlassPanel';
import { useWords } from '@/db/queries';
import { importWords, type DuplicateMode } from '@/db/repo';
import { markDuplicates, parseCsvImport, parseTextImport, summarize, type ImportRow } from '@/lib/importParser';
import { errorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

const PREVIEW_LIMIT = 200;

export default function Import() {
  const navigate = useNavigate();
  const words = useWords();
  const [tab, setTab] = useState<'text' | 'csv'>('text');
  const [text, setText] = useState('');
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dupMode, setDupMode] = useState<DuplicateMode>('skip');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debouncedText = useDebouncedValue(text, 250);

  const rows: ImportRow[] = useMemo(() => {
    const parsed = tab === 'text' ? parseTextImport(debouncedText) : csv ? parseCsvImport(csv.text) : [];
    return markDuplicates(parsed, words ?? []);
  }, [tab, debouncedText, csv, words]);
  const summary = summarize(rows);
  const importCount = summary.toAdd + (dupMode === 'skip' ? 0 : summary.duplicates);

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    try {
      const content = await file.text();
      if (!content.trim()) {
        setFileError(ru.import.errEmptyFile);
        setCsv(null);
        return;
      }
      setCsv({ name: file.name, text: content });
    } catch {
      setFileError(ru.import.errReadFile);
    }
  };

  const confirm = async () => {
    if (busy || importCount === 0) return;
    setBusy(true);
    try {
      const res = await importWords(rows, dupMode);
      toast.success(ru.import.done(res.added, res.updated));
      navigate('/library', { replace: true });
    } catch (e) {
      toast.error(`${ru.import.failed} ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={ru.import.title}
      large={false}
      back
      overlay={
        rows.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 px-3">
            <GlassPanel className="pointer-events-auto mx-auto max-w-xl p-3" rounded="rounded-[22px]" style={{ background: 'rgba(255,255,255,0.82)' }}>
              <Button size="lg" block disabled={busy || importCount === 0} onClick={() => void confirm()} icon={<Upload aria-hidden="true" className="size-5" />}>
                {importCount > 0 ? ru.import.confirm(importCount) : ru.import.nothing}
              </Button>
            </GlassPanel>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 pt-2 pb-24">
        <Segmented
          label={ru.import.title}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'text', label: ru.import.tabText },
            { value: 'csv', label: ru.import.tabCsv },
          ]}
        />

        {tab === 'text' ? (
          <section className="solid-card p-4">
            <label htmlFor="import-text" className="text-muted mb-2 block text-[0.9rem]">
              {ru.import.textHint}
            </label>
            <textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={ru.import.textPlaceholder}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="focus:border-primary-500 w-full resize-y rounded-[14px] border border-[#dfe6f3] bg-white px-3.5 py-3 leading-relaxed outline-none"
            />
          </section>
        ) : (
          <section className="solid-card p-4">
            <p className="text-muted mb-3 text-[0.9rem]">{ru.import.csvHint}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain,.txt"
              className="sr-only"
              aria-label={ru.import.chooseFile}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button variant="soft" block icon={<FileUp aria-hidden="true" className="size-5" />} onClick={() => fileRef.current?.click()}>
              {ru.import.chooseFile}
            </Button>
            {csv && <p className="text-muted mt-2 truncate text-[0.9rem]">{ru.import.fileName(csv.name)}</p>}
            {fileError && (
              <p role="alert" className="text-danger-600 mt-2 text-[0.9rem]">
                {fileError}
              </p>
            )}
          </section>
        )}

        {rows.length === 0 ? (
          <p className="text-muted px-1 text-center">{ru.import.empty}</p>
        ) : (
          <section className="solid-card p-4" aria-label={ru.import.preview}>
            <h2 className="font-semibold">{ru.import.preview}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-[0.85rem] font-semibold">
              <span className="text-success-600 rounded-full bg-[#e3f6ee] px-3 py-1">{ru.import.toAdd(summary.toAdd)}</span>
              {summary.duplicates > 0 && <span className="bg-accent-100 text-accent-700 rounded-full px-3 py-1">{ru.import.duplicates(summary.duplicates)}</span>}
              {summary.errors > 0 && <span className="text-danger-600 rounded-full bg-[#fdecec] px-3 py-1">{ru.import.errors(summary.errors)}</span>}
            </div>
            {summary.duplicates > 0 && (
              <div className="mt-4">
                <p className="text-muted mb-2 text-[0.9rem]">{ru.import.dupMode}</p>
                <Segmented
                  label={ru.import.dupMode}
                  value={dupMode}
                  onChange={setDupMode}
                  options={[
                    { value: 'skip', label: ru.import.dupSkip },
                    { value: 'update', label: ru.import.dupUpdate },
                    { value: 'add', label: ru.import.dupAdd },
                  ]}
                />
              </div>
            )}
            <ul className="mt-4 divide-y divide-[#eef2fa]">
              {rows.slice(0, PREVIEW_LIMIT).map((r) => (
                <li key={`${r.line}-${r.term}`} className="flex items-start gap-3 py-2.5">
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.95rem]">
                      <span lang="en" className="font-semibold [overflow-wrap:anywhere]">
                        {r.term || '—'}
                      </span>
                      {r.translations.length > 0 && (
                        <span lang="ru" className="text-muted">
                          {' '}
                          — {r.translations.join(', ')}
                        </span>
                      )}
                    </p>
                    <p className={`text-caption ${r.status === 'error' ? 'text-danger-600' : 'text-muted'}`}>
                      {ru.import.line(r.line)} · {statusLabel(r)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {rows.length > PREVIEW_LIMIT && <p className="text-muted mt-2 text-[0.9rem]">{ru.import.more(rows.length - PREVIEW_LIMIT)}</p>}
          </section>
        )}
      </div>
    </Screen>
  );
}

function statusLabel(r: ImportRow): string {
  switch (r.status) {
    case 'new':
      return ru.import.statusNew;
    case 'duplicate':
      return ru.import.statusDup;
    case 'duplicate-in-file':
      return ru.import.statusDupFile;
    case 'error':
      return r.error ?? ru.import.statusError;
  }
}

function StatusIcon({ status }: { status: ImportRow['status'] }) {
  const base = 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full';
  if (status === 'new')
    return (
      <span className={`${base} text-success-600 bg-[#e3f6ee]`}>
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      </span>
    );
  if (status === 'error')
    return (
      <span className={`${base} text-danger-600 bg-[#fdecec]`}>
        <CircleAlert aria-hidden="true" className="size-4" />
      </span>
    );
  return (
    <span className={`${base} bg-accent-100 text-accent-700`}>
      <Copy aria-hidden="true" className="size-3.5" />
    </span>
  );
}
