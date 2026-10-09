import { NavLink } from 'react-router';
import { BarChart3, BookOpen, Dumbbell, Sun } from 'lucide-react';
import { ru } from '@/i18n/ru';

const TABS = [
  { to: '/', label: ru.tabs.today, Icon: Sun, end: true },
  { to: '/library', label: ru.tabs.library, Icon: BookOpen, end: false },
  { to: '/train', label: ru.tabs.train, Icon: Dumbbell, end: false },
  { to: '/stats', label: ru.tabs.stats, Icon: BarChart3, end: false },
] as const;

/** Glass bottom tab bar, sits above the home indicator. */
export function TabBar() {
  return (
    <nav
      aria-label={ru.tabs.nav}
      className="glass relative z-30 shrink-0 rounded-none border-x-0 border-b-0"
      style={{ paddingBottom: 'var(--safe-bottom)', paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
    >
      <ul className="mx-auto flex max-w-lg" style={{ height: 'var(--tabbar-height)' }}>
        {TABS.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-0.5 text-[0.69rem] font-medium no-select ${
                  isActive ? 'text-primary-600' : 'text-muted-glass'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-primary-100' : ''
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.9} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
