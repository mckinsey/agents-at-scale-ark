---
name: ark-research
description: Research technical solutions by searching the web, examining GitHub repos, and gathering evidence. Use when exploring implementation options or evaluating technologies.
---

# Ark Research

Research technical solutions and gather evidence before implementation.

## Research Process

### 1. Web Search First

Always start with web search to find:
- Official documentation
- GitHub repositories
- Blog posts and tutorials
- Protocol specifications (PDFs, RFCs)

### 2. Examine GitHub Repositories

GitHub raw content is often blocked. Clone repos to examine them:

```bash
cd /tmp
git clone https://github.com/owner/repo.git
cat /tmp/repo/README.md
```

Look for:
- README documentation
- Code examples
- Architecture patterns
- Dependencies and requirements

### 3. Handle Blocked Content

If a website cannot be loaded:
- Ask the user to paste the relevant content
- Request PDFs or specification documents
- Ask for screenshots if visual content is needed

Example prompt:
> "I found a relevant resource at [URL] but cannot access it. Could you paste the key content or provide the PDF?"

### 4. Local Research Workspace

Store findings in `./scratch/research/` for review:

```bash
mkdir -p ./scratch/research
```

Save:
- Cloned repo summaries
- Code snippets
- Architecture diagrams
- Comparison notes

### 5. Evidence Requirements

**Minimum 2-3 datapoints required** before recommending a solution:
- GitHub repo with active maintenance
- Documentation or specification
- Real-world usage examples
- Community feedback (issues, discussions)

If insufficient evidence, ask for guidance:
> "I found only one reference to this approach. Can you point me to additional resources or clarify the requirements?"

## Output Format

Always back up findings with sources:

```markdown
## Research: [Topic]

### Option 1: [Solution Name]
- **Source**: [URL or repo link]
- **Pros**: ...
- **Cons**: ...
- **Evidence**: [What confirms this works]

### Option 2: [Solution Name]
...

### Recommendation
Based on [N] sources, I recommend [Option] because...

### Sources
- [Title](URL)
- [Repo](GitHub URL) - cloned and examined
- [Spec](URL) - user provided
```

## Example Usage

User: "Research options for terminal recording in an MCP server"

1. Web search: "terminal recording library node typescript"
2. Find GitHub repos → clone to /tmp and examine
3. Find asciinema, VHS, xterm.js
4. Compare approaches in ./scratch/research/terminal-recording.md
5. Present options with 2-3 sources each
