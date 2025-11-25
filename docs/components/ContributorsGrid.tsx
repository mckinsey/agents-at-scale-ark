import React from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as cheerio from 'cheerio'
import styles from './contributors.module.css'

interface Contributor {
    profile: string
    avatar_url: string
    name: string
    contributions: {
        type: string
        emoji: string
    }[]
}

export function getContributors(): Contributor[] {
    try {
        const possiblePaths = [
            join(process.cwd(), 'public', 'contributors.html'),
            join(process.cwd(), 'docs', 'public', 'contributors.html'),
        ]
        
        let html = ''
        for (const filePath of possiblePaths) {
            try {
                html = readFileSync(filePath, 'utf-8')
                break
            } catch {
                continue
            }
        }
        
        if (!html) {
            console.error('Could not find contributors.html file')
            return []
        }
        const $ = cheerio.load(html)
        const contributorsList: Contributor[] = []

        $('td[align="center"]').each((_, cell) => {
            const $cell = $(cell)
            const profileLink = $cell.find('a[href]').first()
            const img = $cell.find('img').first()
            const nameElement = $cell.find('sub b').first()
            const badges = $cell.find('a[title]')

            if (profileLink.length && img.length && nameElement.length) {
                const profile = profileLink.attr('href') || ''
                const avatar_url = img.attr('src') || ''
                const name = nameElement.text().trim()

                const contributionBadges = badges
                    .map((_, badge) => {
                        const $badge = $(badge)
                        const type = $badge.attr('title') || ''
                        const emoji = $badge.text().trim()
                        return { type, emoji }
                    })
                    .get()
                    .filter(badge => badge.type && badge.emoji)

                if (profile && avatar_url && name) {
                    contributorsList.push({
                        profile,
                        avatar_url,
                        name,
                        contributions: contributionBadges
                    })
                }
            }
        })

        return contributorsList
    } catch (error) {
        console.error('Error loading contributors:', error)
        return []
    }
}

export default function ContributorsGrid() {
    const contributors = getContributors()

    if (contributors.length === 0) {
        return (
            <div className={styles.empty}>
                <p>No contributors found.</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Our Amazing Contributors</h2>
                <p className={styles.subtitle}>
                    Thank you to all the wonderful people who have contributed to this project! 🎉
                </p>
            </div>

            <div className={styles.grid}>
                {contributors.map((contributor) => (
                    <a
                        key={contributor.profile}
                        href={contributor.profile}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.card}
                    >
                        <div className={styles.avatarWrapper}>
                            <img
                                src={contributor.avatar_url}
                                alt={contributor.name}
                                className={styles.avatar}
                            />
                            <div className={styles.avatarGlow}></div>
                        </div>

                        <div className={styles.info}>
                            <h3 className={styles.name}>{contributor.name}</h3>

                            {contributor.contributions && contributor.contributions.length > 0 && (
                                <div className={styles.badges}>
                                    {contributor.contributions.map((contrib) => (
                                        <span
                                            key={contrib.type}
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
