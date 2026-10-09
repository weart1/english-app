import { useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useTags, useWords } from '@/db/queries';
import { createTag, TAG_COLORS, toggleTagOnWords } from '@/db/repo';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

/** Add/remove a tag on several words at once. */
export function TagSheet({ open, onClose, wordIds }: { open: boolean; onClose: () => void; wordIds: string[] }) {
  const tags = useTags();
  const words = useWords();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedWords = useMemo(() => {
    const ids = new Set(wordIds);
    return (words ?? []).filter((w) => ids.has(w.id));
  }, [words, wordIds]);

  const stateOf = (tagId: string): 'all' | 'some' | 'none' => {
    const n = selectedWords.filter((w) => w.tagIds.includes(tagId)).length;
    return n === 0 ? 'none' : n === selectedWords.length ? 'all' : 'some';
  };

  const toggle = async (tagId: string) => {
    try {
      await toggleTagOnWords(tagId, wordIds);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const create = async () => {
    if (!name.trim()) {
      setError(ru.editor.errTag);
      return;
    }
    try {
      const color = TAG_COLORS[(tags?.length ?? 0) % TAG_COLORS.length] ?? TAG_COLORS[0];
      const tag = await createTag(name, color);
      await toggleTagOnWords(tag.id, wordIds);
      setName('');
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={ru.library.tagSheetTitle} footer={<Button size="lg" block onClick={onClose}>{ru.common.done}</Button>}>
      <p className="text-muted-glass text-caption mb-3">{ru.library.tagSheetHint}</p>
      <ul className="solid-card divide-y divide-[#eef2fa] overflow-hidden">
        {(tags ?? []).map((t) => {
          const st = stateOf(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={st === 'all' ? true : st === 'some' ? 'mixed' : false}
                onClick={() => void toggle(t.id)}
                className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
              >
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: t.color }} />
                <span className="flex-1">{t.name}</span>
                {st === 'all' && <Check aria-hidden="true" className="text-primary-600 size-5" />}
                {st === 'some' && <Minus aria-hidden="true" className="text-muted size-5" />}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="text-muted-glass text-caption mb-1 block font-semibold">{ru.editor.newTag}</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder={ru.editor.newTagPlaceholder}
            enterKeyHint="done"
            aria-invalid={!!error}
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-[#dfe6f3] bg-white px-3 outline-none focus:border-primary-500"
          />
          <Button type="submit" variant="soft" icon={<Plus aria-hidden="true" className="size-4" />}>
            {ru.common.create}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-danger-600 text-caption mt-1">
            {error}
          </p>
        )}
      </form>
    </BottomSheet>
  );
}
