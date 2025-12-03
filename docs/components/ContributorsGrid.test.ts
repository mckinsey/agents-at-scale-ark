import { describe, it, expect } from 'vitest'
import * as cheerio from 'cheerio'

describe('ContributorsGrid - HTML Parsing Logic', () => {
  it('should parse contributor data from HTML correctly', () => {
    const mockHTML = `
      <table>
        <tbody>
          <tr>
            <td align="center">
              <a href="https://github.com/user1">
                <img src="https://avatars.githubusercontent.com/u/123?v=4" width="100px;" alt=""/>
                <br />
                <sub><b>John Doe</b></sub>
              </a>
              <br />
              <a href="#code-user1" title="Code">💻</a>
              <a href="#doc-user1" title="Documentation">📖</a>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const $ = cheerio.load(mockHTML)
    const contributors: Array<{
      profile: string
      avatar_url: string
      name: string
      contributions: Array<{ type: string; emoji: string }>
    }> = []

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
          contributors.push({
            profile,
            avatar_url,
            name,
            contributions: contributionBadges
          })
        }
      }
    })

    expect(contributors).toHaveLength(1)
    expect(contributors[0].name).toBe('John Doe')
    expect(contributors[0].profile).toBe('https://github.com/user1')
    expect(contributors[0].avatar_url).toContain('avatars.githubusercontent.com')
    expect(contributors[0].contributions).toHaveLength(2)
    expect(contributors[0].contributions[0].type).toBe('Code')
    expect(contributors[0].contributions[0].emoji).toBe('💻')
  })

  it('should handle empty HTML', () => {
    const $ = cheerio.load('')
    const contributors: any[] = []

    $('td[align="center"]').each((_, cell) => {
      contributors.push(cell)
    })

    expect(contributors).toHaveLength(0)
  })

  it('should filter out incomplete contributor entries', () => {
    const mockHTML = `
      <table>
        <tbody>
          <tr>
            <td align="center">
              <a href="https://github.com/user1">
                <img src="https://avatars.githubusercontent.com/u/123?v=4" width="100px;" alt=""/>
                <br />
                <sub><b>Complete User</b></sub>
              </a>
            </td>
            <td align="center">
              <a href="https://github.com/user2">
                <br />
                <sub><b>Missing Image</b></sub>
              </a>
            </td>
            <td align="center">
              <img src="https://avatars.githubusercontent.com/u/456?v=4" width="100px;" alt=""/>
              <br />
              <sub><b>Missing Link</b></sub>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const $ = cheerio.load(mockHTML)
    const contributors: Array<{
      profile: string
      avatar_url: string
      name: string
      contributions: Array<{ type: string; emoji: string }>
    }> = []

    $('td[align="center"]').each((_, cell) => {
      const $cell = $(cell)
      const profileLink = $cell.find('a[href]').first()
      const img = $cell.find('img').first()
      const nameElement = $cell.find('sub b').first()

      if (profileLink.length && img.length && nameElement.length) {
        const profile = profileLink.attr('href') || ''
        const avatar_url = img.attr('src') || ''
        const name = nameElement.text().trim()

        if (profile && avatar_url && name) {
          contributors.push({
            profile,
            avatar_url,
            name,
            contributions: []
          })
        }
      }
    })

    expect(contributors).toHaveLength(1)
    expect(contributors[0].name).toBe('Complete User')
  })

  it('should parse multiple contributors', () => {
    const mockHTML = `
      <table>
        <tbody>
          <tr>
            <td align="center">
              <a href="https://github.com/user1">
                <img src="https://avatars.githubusercontent.com/u/123?v=4" width="100px;" alt=""/>
                <br />
                <sub><b>User One</b></sub>
              </a>
            </td>
            <td align="center">
              <a href="https://github.com/user2">
                <img src="https://avatars.githubusercontent.com/u/456?v=4" width="100px;" alt=""/>
                <br />
                <sub><b>User Two</b></sub>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const $ = cheerio.load(mockHTML)
    const contributors: Array<{
      profile: string
      avatar_url: string
      name: string
    }> = []

    $('td[align="center"]').each((_, cell) => {
      const $cell = $(cell)
      const profileLink = $cell.find('a[href]').first()
      const img = $cell.find('img').first()
      const nameElement = $cell.find('sub b').first()

      if (profileLink.length && img.length && nameElement.length) {
        const profile = profileLink.attr('href') || ''
        const avatar_url = img.attr('src') || ''
        const name = nameElement.text().trim()

        if (profile && avatar_url && name) {
          contributors.push({ profile, avatar_url, name })
        }
      }
    })

    expect(contributors).toHaveLength(2)
    expect(contributors[0].name).toBe('User One')
    expect(contributors[1].name).toBe('User Two')
  })

  it('should extract contribution badges correctly', () => {
    const mockHTML = `
      <table>
        <tbody>
          <tr>
            <td align="center">
              <a href="https://github.com/user1">
                <img src="https://avatars.githubusercontent.com/u/123?v=4" width="100px;" alt=""/>
                <br />
                <sub><b>John Doe</b></sub>
              </a>
              <br />
              <a href="#code" title="Code">💻</a>
              <a href="#doc" title="Documentation">📖</a>
              <a href="#bug" title="Bug reports">🐛</a>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const $ = cheerio.load(mockHTML)
    const $cell = $('td[align="center"]').first()
    const badges = $cell.find('a[title]')

    const contributionBadges = badges
      .map((_, badge) => {
        const $badge = $(badge)
        const type = $badge.attr('title') || ''
        const emoji = $badge.text().trim()
        return { type, emoji }
      })
      .get()
      .filter(badge => badge.type && badge.emoji)

    expect(contributionBadges).toHaveLength(3)
    expect(contributionBadges[0]).toEqual({ type: 'Code', emoji: '💻' })
    expect(contributionBadges[1]).toEqual({ type: 'Documentation', emoji: '📖' })
    expect(contributionBadges[2]).toEqual({ type: 'Bug reports', emoji: '🐛' })
  })
})
