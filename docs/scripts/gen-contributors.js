#!/usr/bin/env node
/**
 * Regenerates docs/public/contributors.html from the GitHub contributors API,
 * merged with the curated names and contribution badges in .all-contributorsrc.
 *
 * The result is an all-contributors-style table that ContributorsGrid.tsx parses.
 * Contributors curated in .all-contributorsrc keep their display name and badges;
 * everyone else the API reports (bots excluded) is added with a Code badge.
 *
 * Usage: GITHUB_TOKEN=$(gh auth token) node scripts/gen-contributors.js
 */

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const OWNER = 'mckinsey';
const REPO = 'agents-at-scale-ark';
const PER_ROW = 7;

const EMOJI = {
  code: ['💻', 'Code'],
  doc: ['📖', 'Documentation'],
  ideas: ['🤔', 'Ideas, Planning, & Feedback'],
  bug: ['🐛', 'Bug reports'],
  review: ['👀', 'Reviewed Pull Requests'],
  test: ['⚠️', 'Tests'],
  maintenance: ['🚧', 'Maintenance'],
  projectManagement: ['📆', 'Project Management'],
  design: ['🎨', 'Design'],
  infra: ['🚇', 'Infrastructure'],
  tool: ['🔧', 'Tools'],
  question: ['💬', 'Answering Questions'],
  example: ['💡', 'Examples'],
};

async function fetchContributors() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ark-docs' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; page < 20; page++) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all.filter((c) => c.type !== 'Bot' && !c.login.endsWith('[bot]'));
}

function badgeHtml(login, type) {
  const [emoji, label] = EMOJI[type] || ['✨', type];
  const href =
    type === 'code'
      ? `https://github.com/${OWNER}/${REPO}/commits?author=${login}`
      : `#${type}-${login}`;
  return `<a href="${href}" title="${label}">${emoji}</a>`;
}

function cellHtml(c) {
  const badges = c.contributions.map((t) => badgeHtml(c.login, t)).join(' ');
  return (
    `<td align="center" valign="top" width="14.28%">` +
    `<a href="${c.profile}"><img src="${c.avatar_url}?s=100" width="100px;" alt="${c.name}"/>` +
    `<br /><sub><b>${c.name}</b></sub></a><br />${badges}</td>`
  );
}

async function main() {
  const root = join(__dirname, '..', '..');
  const rc = JSON.parse(readFileSync(join(root, '.all-contributorsrc'), 'utf-8'));

  const byLogin = new Map();
  for (const c of rc.contributors) {
    byLogin.set(c.login.toLowerCase(), {
      login: c.login,
      name: c.name || c.login,
      avatar_url: c.avatar_url.replace(/\?s=\d+$/, ''),
      profile: c.profile,
      contributions: c.contributions,
    });
  }

  const api = await fetchContributors();
  for (const c of api) {
    if (byLogin.has(c.login.toLowerCase())) continue;
    byLogin.set(c.login.toLowerCase(), {
      login: c.login,
      name: c.login,
      avatar_url: c.avatar_url,
      profile: c.html_url,
      contributions: ['code'],
    });
  }

  const contributors = [...byLogin.values()];

  const rows = [];
  for (let i = 0; i < contributors.length; i += PER_ROW) {
    const cells = contributors
      .slice(i, i + PER_ROW)
      .map((c) => `      ${cellHtml(c)}`)
      .join('\n');
    rows.push(`    <tr>\n${cells}\n    </tr>`);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 10px; }
        table { border-collapse: collapse; width: 100%; }
        td { text-align: center; vertical-align: top; padding: 10px; }
        img { border-radius: 50%; }
        a { text-decoration: none; color: #0366d6; }
        sub { font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
${rows.join('\n')}
  </tbody>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

</body>
</html>
`;

  writeFileSync(join(root, 'docs', 'public', 'contributors.html'), html);
  console.log(`Wrote ${contributors.length} contributors (${api.length} from API, ${rc.contributors.length} curated).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
