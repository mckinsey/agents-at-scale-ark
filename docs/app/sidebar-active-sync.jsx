'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const normalize = (path) => {
  if (!path) return path
  const clean = path.split('#')[0].split('?')[0]
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean
}

export default function SidebarActiveSync() {
  const pathname = usePathname()

  useEffect(() => {
    const current = normalize(pathname)
    const links = document.querySelectorAll('.nextra-sidebar a[href]')
    links.forEach((link) => {
      const href = link.getAttribute('href') || ''
      if (href.startsWith('/') && normalize(href) === current) {
        link.setAttribute('data-active-alias', '')
      } else {
        link.removeAttribute('data-active-alias')
      }
    })
  }, [pathname])

  return null
}
