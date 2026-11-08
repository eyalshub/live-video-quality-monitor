import type { MouseEvent, ReactNode } from 'react'

import { navigate } from './router'

/** In-app link: plain <a href> (works with new tab / copy link), client-side navigation on click. */
export function Link({
  to,
  children,
  className,
  ariaCurrent,
}: {
  to: string
  children: ReactNode
  className?: string
  ariaCurrent?: boolean
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle new-tab / new-window clicks.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(to)
  }
  return (
    <a
      href={to}
      onClick={onClick}
      className={className}
      aria-current={ariaCurrent ? 'page' : undefined}
    >
      {children}
    </a>
  )
}
