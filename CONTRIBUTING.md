# Introduction

We welcome any and all contributions to ARK, at whatever level you can manage. Here are a few suggestions, but you are welcome to suggest anything else that you think improves the community for us all!

## Contribute to the project

There are quite a few ways to contribute, such as:

* **Report bugs and security vulnerabilities**: We use [GitHub issues](https://github.com/mckinsey/agents-at-scale-ark/issues) to keep track of known bugs and security vulnerabilities. We keep a close eye on them and update them when we have an internal fix in progress. Before you report a new issue, do your best to ensure your problem hasn't already been reported. If it has, just leave a comment on the existing issue, rather than create a new one.
* **Propose a new feature**: If you have new ideas for functionality then please open a [GitHub issue](https://github.com/mckinsey/agents-at-scale-ark/issues) and describe the feature you would like to see, why you need it, and how it should work.
* **Review pull requests**: See the [repo](https://github.com/mckinsey/agents-at-scale-ark) to find open pull requests and contribute a review!
* **Contribute a fix or feature**: If you're interested in contributing fixes to code or documentation, first read our guidelines for contributing developers below for an explanation of how to get set up and the process you'll follow. Once you are ready to contribute, feel free to pick one of the issues and create a PR.
* **Contribute to the documentation**: You can help us improve the [documentation](https://mckinsey.github.io/agents-at-scale-ark/) online. Send us feedback as a GitHub issue or start a documentation discussion on GitHub. You are also welcome to raise a PR with a bug fix or addition to the documentation.

## Code of conduct

The ARK team pledges to foster and maintain a friendly community. We enforce a [Code of Conduct](./CODE_OF_CONDUCT.md) to ensure every contributor is welcomed and treated with respect.

## Ways of Working

**Principle 1: Team Planning and Prioritization**
- Plan tickets for current and upcoming sprints as a team
- Final prioritization decisions rest with the product manager
- When possible, break out self-contained chunks of development that a wider group of developers can work on

**Principle 2: Design Before Code**
For non-trivial changes:
- Propose design in ticket and gather team feedback
- Use RFC pull requests or spikes to share ideas
- For architectural implications, discuss with TSC (meets weekly)
- Final implementation decisions rest with technical lead

**Principle 3: Spec and Test Driven Development**
Propose new APIs and end-to-end tests showing how proposed functionality changes system behavior and APIs.

**Principle 4: Implementation**
- Keep development focused on ticket requirements. If additional features or ideas arise, create new tickets and track as separate work to be prioritized by the team. Link to the original ticket.
- Use PR title prefixes (`feat:`, `bug:`, `rfc:`) to ensure changelog updates, release notes generation, and semantic versioning are managed properly.
- All pull requests must use conventional commit format in their titles. This is enforced by the `validate_pr_title` workflow and is required for Automatic version determination, Changelog generation, Semantic versioning compliance
- Supported commit types:
    - `feat`: New features (triggers minor version bump)
    - `fix`: Bug fixes (triggers patch version bump)
    - `docs`: Documentation changes
    - `chore`: Maintenance tasks
    - `refactor`: Code refactoring
    - `test`: Test additions or changes
    - `ci`: CI/CD changes
    - `build`: Build system changes
    - `perf`: Performance improvements
- Breaking changes can be indicated with `!` after the type (e.g., `feat!:`) or by including `BREAKING CHANGE:` in the commit body.

**Principle 5: Releasing**
Use conventional commits and semantic versioning.

## Language Guidelines

A number of languages are used in the project, due to specific goals and patterns, which vary across the stack

**Golang**

- Used for low-level Ark System services, which are heavily integrated into Kubernetes, example: `ark-controller`
- Used for low-level Ark services, which are expected to be stable, exposed internally, rarely examined by engineers unless working at the system level, and that demand high performance and concurrency, such as `postgres-memory`, which is a stable low level proxy from HTTP requests to Postgres databases
- Used for low-latency, high-concurrency, fast-startup interfaces, such as `fark`
- Strengths: idiomatic for Kubernetes, excellent for systems programming, high speed, excellent concurrency options
- Limitations: fewer engineers are familiar with the language and its idioms

**Python**

- Used for higher-order Ark services, where logic changes regularly, such as the `ark-api` service
- Used for higher-order Ark services, which are exposed externally, where engineers are likely to examine the code for learning purposes, such as `ark-api` (which includes A2A Gateway functionality)
- Specifically chosen where we want and expect contributions from a wider group in the community
- Specifically chosen when engineers who are using their own Python code to run services may want to inspect the code, such as the Langchain A2A server
- Strengths: popular and commonly understood, expressive for business logic, many examples online such Python when showing how to build AI applications
- Limitations: typically slower to start up, fewer standard idioms mean that development patterns can be inconsistent across projects without care

**Node.JS / JavaScript / TypeScript**

- Used for web user-interfaces, such as `ark-dashboard`, where popular UI libraries such as React.JS are common
- Used for CLI user-interfaces, where many engineers may want to fork and contribute, such as `ark`

Libraries and SDKs currently exist for:

- Python
- Node.JS

## Contributing to docs
You can help us improve the [documentation](https://mckinsey.github.io/agents-at-scale-ark/) online. A contribution to the docs is often the easiest way to get started contributing to the project.

In order to preview the docs locally, you can run `make docs` in the root of the project. This will run the documentation site with live-reload, and you can then view the docs at `http://localhost:3000`.

## Guidelines for contributing developers

Note that any contributions you make will be under the Agents At Scale [license](./LICENSE).
