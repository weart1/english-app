import { CircleCheck, Database, Share, SquarePlus } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { useStandalone } from '@/hooks/useStandalone';
import { ru } from '@/i18n/ru';

export default function InstallGuide() {
  const standalone = useStandalone();
  return (
    <Screen title={ru.install.guideTitle} large={false} back>
      <div className="flex flex-col gap-4 pt-2">
        {standalone && (
          <p className="text-success-600 flex items-center gap-2 rounded-[18px] bg-[#e3f6ee] px-4 py-3 font-semibold">
            <CircleCheck aria-hidden="true" className="size-5" />
            {ru.install.standaloneOk}
          </p>
        )}
        <section className="solid-card p-5">
          <div className="mb-4 flex items-center justify-center gap-6" aria-hidden="true">
            <span className="bg-primary-100 text-primary-600 flex size-16 items-center justify-center rounded-[20px]">
              <Share className="size-8" />
            </span>
            <span className="text-muted text-2xl">→</span>
            <span className="bg-primary-100 text-primary-600 flex size-16 items-center justify-center rounded-[20px]">
              <SquarePlus className="size-8" />
            </span>
          </div>
          <ol className="flex flex-col gap-3">
            {ru.install.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="bg-primary-500 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="solid-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Database aria-hidden="true" className="text-primary-600 size-5" />
            {ru.install.storageTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {ru.install.storageBody.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  );
}
