'use client'

import { useEffect, useState } from 'react'
import styles from './contributors.module.css'

interface Contributor {
    url: string
    avatar: string
    name: string
    contributions: {
        type: string
        emoji: string
    }[]
}

export default function ContributorsGrid() {
    const [contributors, setContributors] = useState<Contributor[]>([])
    const [loading, setLoading] = useState<boolean>(true)

    useEffect(() => {
        fetch('/contributors.html')
            .then((res: Response) => res.text())
            .then((html: string) => {
                const parser = new DOMParser()
                const doc = parser.parseFromString(html, 'text/html')
                const table = doc.querySelector('table')

                if (!table) {
                    setLoading(false)
                    return
                }

                const contributorsList: Contributor[] = []
                const cells = table.querySelectorAll<HTMLTableCellElement>('td[align="center"]')

                cells.forEach((cell: HTMLTableCellElement) => {
                    const link = cell.querySelector<HTMLAnchorElement>('a[href*="github.com"]')
                    const img = cell.querySelector<HTMLImageElement>('img')
                    const name = cell.querySelector<HTMLElement>('sub b')
                    const badges = cell.querySelectorAll<HTMLAnchorElement>('a[title]')

                    if (link && img && name && link.href && img.src && name.textContent) {
                        contributorsList.push({
                            url: link.href,
                            avatar: img.src,
                            name: name.textContent,
                            contributions: Array.from(badges).map((badge: HTMLAnchorElement) => ({
                                type: badge.title || '',
                                emoji: badge.textContent?.trim() || ''
                            }))
                        })
                    }
                })

                setContributors(contributorsList)
                setLoading(false)
            })
            .catch((err: Error) => {
                console.error('Error loading contributors:', err)
                setLoading(false)
            })
    }, [])

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Loading contributors...</p>
            </div>
        )
    }

    if (contributors.length === 0) {
        return (
            <div className={styles.empty}>
                <p>No contributors found.</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.grid}>
                {contributors.map((contributor, index) => (
                    <a
                        key={index}
                        href={contributor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.card}
                    >
                        <div className={styles.avatarWrapper}>
                            <img
                                src={contributor.avatar}
                                alt={contributor.name}
                                className={styles.avatar}
                            />
                            <div className={styles.avatarGlow}></div>
                        </div>

                        <div className={styles.info}>
                            <h3 className={styles.name}>{contributor.name}</h3>

                            {contributor.contributions.length > 0 && (
                                <div className={styles.badges}>
                                    {contributor.contributions.map((contrib: Contribution, idx: number) => (
                                        <span
                                            key={idx}
                                            className={styles.badge}
                                            title={contrib.type}
                                        >
                                            {contrib.emoji}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </a>
                ))}
            </div>
        </div>
    )
}

