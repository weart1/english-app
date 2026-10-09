import { useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CircleAlert, Plus, Sparkles, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, IconButton } from '@/components/Button';
import { ChipInput } from '@/components/ChipInput';
import { SpeakButton } from '@/components/SpeakButton';
import { useTags, useWord } from '@/db/queries';
import { addWord, createTag, findDuplicate, TAG_COLORS, updateWord } from '@/db/repo';
import type { Word } from '@/db/types';
import { errorMessage, UserFacingError } from '@/lib/errors';
import { splitTranslations } from '@/lib/normalize';
import { useEditorStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

/** Global host: the add/edit sheet can be opened from any screen. */
export default function WordEditorHost() {
  const { open, wordId, nonce, close } = useEditorStore();
  return <WordEditorSheet key={nonce} open={open} wordId={wordId} onClose={close} />;
}

interface FormState {
  term: string;
  translations: string[];
  transcription: string;
  examples: string[];
  note: string;
  tagIds: string[];
}

const EMPTY: FormState = { term: '', translations: [], transcription: '', examples: [''], note: '', tagIds: [] };

function fromWord(w: Word): FormState {
  return {
    term: w.term,
    translations: w.translations,
    transcription: w.transcription ?? '',
    examples: w.examples.length ? w.examples : [''],
    note: w.note ?? '',
    tagIds: w.tagIds,
  };
}

function WordEditorSheet({ open, wordId, onClose }: { open: boolean; wordId: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const existing = useWord(wordId ?? undefined);
  const tags = useTags();
  const ids = { term: useId(), tr: useId(), trErr: useId(), trHint: useId(), tx: useId(), note: useId(), termErr: useId() };

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [pendingTr, setPendingTr] = useState('');
  const [errors, setErrors] = useState<{ term?: string; translations?: string }>({});
  const [duplicate, setDuplicate] = useState<Word | null>(null);
  const [busy, setBusy] = useState(false);
  const [autofill, setAutofill] = useState<{ busy: boolean; message?: string }>({ busy: false });
  const [newTag, setNewTag] = useState<{ open: boolean; name: string; color: string; error?: string }>({
    open: false,
    name: '',
    color: TAG_COLORS[0],
  });
  const termRef = useRef<HTMLInputElement>(null);

  // Load the word once when editing.
  if (wordId && existing && loadedId !== existing.id) {
    setLoadedId(existing.id);
    setForm(fromWord(existing));
  }

  const isEdit = !!wordId;
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const validate = (f: FormState, translations: string[]) => {
    const next: typeof errors = {};
    if (!f.term.trim()) next.term = ru.editor.errTerm;
    else if (f.term.trim().length > 200) next.term = ru.editor.errTermLong;
    if (translations.length === 0) next.translations = ru.editor.errTranslations;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (addAnother: boolean, allowDuplicate = false) => {
    if (busy) return;
    // Focus synchronously inside the tap so iOS keeps the keyboard open for the next word.
    if (addAnother) termRef.current?.focus();
    const translations = pendingTr.trim() ? [...form.translations, ...splitTranslations(pendingTr)] : form.translations;
    if (!validate(form, translations)) return;
    setBusy(true);
    try {
      const termChanged = !existing || existing.term.trim().toLowerCase() !== form.term.trim().toLowerCase();
      if (!allowDuplicate && termChanged) {
        const dup = await findDuplicate(form.term, wordId ?? undefined);
        if (dup) {
          setDuplicate(dup);
          return;
        }
      }
      const input = {
        term: form.term,
        translations,
        transcription: form.transcription,
        examples: form.examples,
        note: form.note,
        tagIds: form.tagIds.filter((id) => tags?.some((t) => t.id === id) ?? true),
      };
      if (isEdit && wordId) await updateWord(wordId, input);
      else await addWord(input);
      toast.success(ru.editor.saved, undefined, 1800);
      setDuplicate(null);
      setPendingTr('');
      if (addAnother) {
        // Keep tags for fast batch entry into the same topic.
        setForm({ ...EMPTY, tagIds: form.tagIds });
        setErrors({});
        setAutofill({ busy: false });
        termRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      if (e instanceof UserFacingError) toast.error(e.message);
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runAutofill = async () => {
    const term = form.term.trim();
    if (!term) {
      setAutofill({ busy: false, message: ru.editor.autofillNoTerm });
      return;
    }
    setAutofill({ busy: true, message: ru.editor.autofillLoading });
    try {
      const { lookupWord, DictionaryError } = await import('@/lib/dictionary');
      try {
        const result = await lookupWord(term);
        if (!result) {
          setAutofill({ busy: false, message: ru.editor.autofillNotFound });
          return;
        }
        let filled = false;
        setForm((f) => {
          const next = { ...f };
          // Never overwrite what the user already typed.
          if (!f.transcription.trim() && result.transcription) {
            next.transcription = result.transcription;
            filled = true;
          }
          if (f.examples.every((x) => !x.trim()) && result.examples[0]) {
            next.examples = [result.examples[0]];
            filled = true;
          }
          return next;
        });
        setAutofill({ busy: false, message: filled ? ru.editor.autofillDone : ru.editor.autofillNothing });
      } catch (e) {
        const kind = e instanceof DictionaryError ? e.kind : 'network';
        setAutofill({
          busy: false,
          message: kind === 'offline' ? ru.editor.autofillOffline : ru.editor.autofillError,
        });
      }
    } catch {
      // The dictionary chunk itself failed to load (offline before it was cached).
      setAutofill({ busy: false, message: ru.editor.autofillOffline });
    }
  };

  const submitNewTag = async () => {
    if (!newTag.name.trim()) {
      setNewTag((t) => ({ ...t, error: ru.editor.errTag }));
      return;
    }
    if (tags?.some((t) => t.name.toLowerCase() === newTag.name.trim().toLowerCase())) {
      setNewTag((t) => ({ ...t, error: ru.editor.errTagExists }));
      return;
    }
    try {
      const tag = await createTag(newTag.name, newTag.color);
      patch({ tagIds: [...form.tagIds, tag.id] });
      setNewTag({ open: false, name: '', color: TAG_COLORS[((tags?.length ?? 0) + 1) % TAG_COLORS.length] ?? TAG_COLORS[0] });
    } catch (e) {
      setNewTag((t) => ({ ...t, error: errorMessage(e) }));
    }
  };

  const loadingExisting = isEdit && existing === undefined;
  const missing = isEdit && existing === null;

  const footer = (
    <div className="flex flex-col gap-2">
      <Button size="lg" block disabled={busy || loadingExisting || missing} onClick={() => void save(false)}>
        {ru.editor.save}
      </Button>
      {!isEdit && (
        <Button size="md" variant="ghost" block disabled={busy} onClick={() => void save(true)}>
          {ru.editor.saveAndAdd}
        </Button>
      )}
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={isEdit ? ru.editor.titleEdit : ru.editor.titleNew} footer={footer} fullOnSmall>
      {missing ? (
        <p className="text-muted py-6">{ru.errors.notFound}</p>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5 pt-1 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          {duplicate && (
            <div role="alert" className="bg-accent-100 rounded-[18px] p-4">
              <p className="flex items-center gap-2 font-semibold">
                <CircleAlert aria-hidden="true" className="text-accent-700 size-5" />
                {ru.editor.duplicateTitle}
              </p>
              <p className="text-accent-700 mt-1">{ru.editor.duplicateBody(duplicate.term)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    navigate(`/word/${duplicate.id}`);
                  }}
                >
                  {ru.editor.openExisting}
                </Button>
                <Button size="sm" variant="primary" onClick={() => void save(false, true)}>
                  {ru.editor.addAnyway}
                </Button>
              </div>
            </div>
          )}

          <Field
            label={ru.editor.term}
            htmlFor={ids.term}
            error={errors.term}
            errorId={ids.termErr}
          >
            <div className="flex items-center gap-2">
              <input
                ref={termRef}
                id={ids.term}
                lang="en"
                value={form.term}
                onChange={(e) => {
                  patch({ term: e.target.value });
                  if (errors.term) setErrors((x) => ({ ...x, term: undefined }));
                  if (duplicate) setDuplicate(null);
                }}
                placeholder={ru.editor.termPlaceholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-invalid={!!errors.term}
                aria-describedby={errors.term ? ids.termErr : undefined}
                maxLength={200}
                className={inputClass(!!errors.term)}
              />
              {form.term.trim() && <SpeakButton text={form.term.trim()} label={ru.editor.speak} />}
            </div>
            <button
              type="button"
              onClick={() => void runAutofill()}
              disabled={autofill.busy}
              className="text-primary-600 mt-1 -ml-1 flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-[0.9rem] font-semibold disabled:opacity-50"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              {ru.editor.autofill}
            </button>
            {autofill.message && (
              <p role="status" className="text-muted text-caption">
                {autofill.message}
              </p>
            )}
          </Field>

          <Field label={ru.editor.translations} htmlFor={ids.tr} error={errors.translations} errorId={ids.trErr} hint={ru.editor.translationsHint} hintId={ids.trHint}>
            <ChipInput
              id={ids.tr}
              lang="ru"
              values={form.translations}
              onChange={(translations) => {
                patch({ translations });
                if (translations.length && errors.translations) setErrors((x) => ({ ...x, translations: undefined }));
              }}
              onPendingChange={setPendingTr}
              placeholder={ru.editor.translationsPlaceholder}
              invalid={!!errors.translations}
              describedBy={errors.translations ? ids.trErr : ids.trHint}
            />
          </Field>

          <Field label={ru.editor.transcription} htmlFor={ids.tx}>
            <input
              id={ids.tx}
              value={form.transcription}
              onChange={(e) => patch({ transcription: e.target.value })}
              placeholder={ru.editor.transcriptionPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={inputClass(false)}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-muted-glass text-caption mb-1.5 font-semibold">{ru.editor.examples}</legend>
            {form.examples.map((ex, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  lang="en"
                  value={ex}
                  rows={2}
                  aria-label={`${ru.editor.examples} ${i + 1}`}
                  onChange={(e) => {
                    const examples = form.examples.slice();
                    examples[i] = e.target.value;
                    patch({ examples });
                  }}
                  placeholder={ru.editor.examplePlaceholder}
                  autoCapitalize="sentences"
                  className={`${inputClass(false)} min-h-12 resize-none py-2.5`}
                />
                {form.examples.length > 1 && (
                  <IconButton label={ru.editor.removeExample} onClick={() => patch({ examples: form.examples.filter((_, j) => j !== i) })}>
                    <Trash2 aria-hidden="true" className="size-5" />
                  </IconButton>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              icon={<Plus aria-hidden="true" className="size-4" />}
              onClick={() => patch({ examples: [...form.examples, ''] })}
            >
              {ru.editor.addExample}
            </Button>
          </fieldset>

          <Field label={ru.editor.note} htmlFor={ids.note}>
            <textarea
              id={ids.note}
              value={form.note}
              rows={2}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder={ru.editor.notePlaceholder}
              className={`${inputClass(false)} min-h-12 resize-none py-2.5`}
            />
          </Field>

          <fieldset>
            <legend className="text-muted-glass text-caption mb-2 font-semibold">{ru.editor.tags}</legend>
            <div className="flex flex-wrap gap-2">
              {(tags ?? []).map((t) => {
                const on = form.tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ tagIds: on ? form.tagIds.filter((x) => x !== t.id) : [...form.tagIds, t.id] })}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3.5 font-medium ${
                      on ? 'border-primary-500 bg-primary-100 text-primary-600' : 'border-transparent bg-white shadow-card'
                    }`}
                  >
                    <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </button>
                );
              })}
              {!newTag.open && (
                <button
                  type="button"
                  onClick={() => setNewTag((x) => ({ ...x, open: true }))}
                  className="text-primary-600 inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-dashed border-[#c8d6f5] px-3.5 font-medium"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  {ru.editor.newTag}
                </button>
              )}
            </div>
            {newTag.open && (
              <div className="solid-card mt-3 flex flex-col gap-3 p-3">
                <input
                  value={newTag.name}
                  aria-label={ru.editor.newTagPlaceholder}
                  placeholder={ru.editor.newTagPlaceholder}
                  onChange={(e) => setNewTag((x) => ({ ...x, name: e.target.value, error: undefined }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitNewTag();
                    }
                  }}
                  aria-invalid={!!newTag.error}
                  className={inputClass(!!newTag.error)}
                />
                {newTag.error && (
                  <p role="alert" className="text-danger-600 text-caption -mt-2">
                    {newTag.error}
                  </p>
                )}
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={ru.editor.tags}>
                  {TAG_COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={newTag.color === c}
                      aria-label={ru.editor.tagColor(i + 1)}
                      onClick={() => setNewTag((x) => ({ ...x, color: c }))}
                      className="flex size-11 items-center justify-center rounded-full"
                    >
                      <span
                        className={`size-7 rounded-full ${newTag.color === c ? 'ring-primary-500 ring-2 ring-offset-2' : ''}`}
                        style={{ background: c }}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setNewTag((x) => ({ ...x, open: false, error: undefined }))}>
                    {ru.common.cancel}
                  </Button>
                  <Button size="sm" onClick={() => void submitNewTag()}>
                    {ru.common.create}
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
          {/* Lets the keyboard's "Go" submit the form. */}
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      )}
    </BottomSheet>
  );
}

export function inputClass(invalid: boolean): string {
  return `min-h-12 w-full rounded-[14px] border bg-white px-3.5 outline-none transition-colors ${
    invalid ? 'border-danger-500' : 'focus:border-primary-500 border-[#dfe6f3]'
  }`;
}

function Field({
  label,
  htmlFor,
  error,
  errorId,
  hint,
  hintId,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  errorId?: string;
  hint?: string;
  hintId?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-muted-glass text-caption font-semibold">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-danger-600 text-caption mt-1 font-medium">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-muted text-caption mt-1">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
