# ARK Generate Command

The `ark generate` (or `ark g`) command is a powerful code generation tool for creating ARK resources from templates. It provides an intuitive way to scaffold projects, agents, teams, and queries with best practices built-in.

## 🚀 Quick Start

```bash
# Create a new project
ark generate project my-ai-project

# Navigate and deploy
cd my-ai-project
source .env  # Edit first to add your API keys
make quickstart

# Check your deployment
kubectl get agents,teams,queries
```

## 📋 Available Generators

### 🏗️ Project Generator

Creates a complete ARK project with all necessary structure and configurations.

```bash
ark g project
ark generate project my-project [options]
```

**What you get:**

- Complete Helm chart with all ARK resources
- CI/CD pipeline with GitHub Actions
- Sample agents, teams, and queries
- Model configurations for major providers (Azure, OpenAI, Claude, Gemini)
- Security best practices and RBAC
- Comprehensive documentation and Makefile

**Options:**

- `--project-type <type>` - 'empty' or 'with-samples' (default: with-samples)
- `--namespace <name>` - Kubernetes namespace (default: project name)
- `--skip-models` - Skip model provider configuration
- `--skip-git` - Skip git repository initialization

### 🤖 Agent Generator

Creates a new AI agent within an existing ARK project.

```bash
ark generate agent customer-support
ark g agent
```

**Features:**

- Creates agent YAML definition with best practices
- Validates project structure before generation
- Optional query generation for testing
- Handles name conflicts gracefully
- Must be run within an ARK project directory

### 👥 Team Generator

Creates a team of collaborative agents with different strategies.

```bash
ark g team
ark generate team research-team
```

**Features:**

- Interactive agent selection from existing agents
- Can create new agents on-the-fly
- Multiple collaboration strategies:
  - **Sequential** - Agents work in order
  - **Round-robin** - Agents take turns
  - **Graph** - Custom workflow with dependencies
  - **Selector** - AI chooses the next agent
- Optional query generation for testing

### 📝 Query Generator

Creates queries to test agents or teams (automatically generated with agents/teams).

### 🏪 Marketplace Generator

Creates a central repository for sharing reusable ARK components across teams and projects.

```bash
ark generate marketplace
```

**Features:**

- Central repository structure for component sharing
- Organized directories for all ARK component types (agents, teams, models, tools, mcp-servers)
- Built-in contribution guidelines and documentation
- Git repository initialization with best practices
- Ready for CI/CD integration and automated validation
- Component templates for easy contribution

**Use Cases:**

- Team sharing of proven agent configurations
- Cross-project component libraries
- Community marketplace for ARK resources
- Internal organization component registry

## 🔧 Usage Patterns

### Basic Usage

Generate with minimal options (you'll be prompted for required information):

```bash
ark g project
ark g agent
ark g team
```

### With Command Line Options

Provide options upfront to skip some prompts:

```bash
ark g project analytics --project-type with-samples --namespace analytics-ns
ark g agent data-processor
ark g team analysis-pipeline
```

### List Available Generators

```bash
ark generate list
ark g ls --detailed  # Show examples and details
```

## 📁 Project Structure

Generated projects follow this structure:

```
my-project/
├── agents/                 # Agent definitions
│   └── sample-agent.yaml
├── teams/                  # Team definitions
│   └── sample-team.yaml
├── queries/                # Query definitions
│   └── sample-query.yaml
├── models/                 # Model configurations
│   └── default.yaml
├── tools/                  # Custom MCP tools
├── scripts/                # Setup and utility scripts
├── docs/                   # Documentation
├── .github/                # CI/CD workflows
├── Chart.yaml              # Helm chart
├── values.yaml             # Helm values
├── Makefile               # Build and deploy commands
├── README.md              # Project documentation
└── .env                   # Environment variables
```

## 🔐 Security Features

- **Input validation** - All names and paths are validated
- **Path traversal protection** - Prevents directory traversal attacks
- **Template validation** - Templates are checked for malicious content
- **Secure file operations** - All file operations use secure methods
- **Environment sanitization** - Environment variables are sanitized

## 🏛️ Architecture

The generate system is built with extensibility and security in mind:

### Core Components

1. **Template Engine** (`templateEngine.ts`) - Secure file copying and variable substitution
2. **Template Discovery** (`templateDiscovery.ts`) - Template location and validation
3. **Generators** (`generators/`) - Generator implementations with error handling
4. **Security Utils** (`security.ts`) - Input validation and secure operations
5. **Error Handling** (`errors.ts`) - Centralized error management

### Template Variables

Templates support variable substitution using two formats:

- `{{variableName}}` - Standard template syntax
- `__variableName__` - Alternative syntax for file names and paths

Common variables:

- `__projectName__` - Project name
- `__agentName__` - Agent name
- `__teamName__` - Team name
- `__namespace__` - Kubernetes namespace

## 🧪 Testing Your Generated Resources

### Quick Test

```bash
# In your project directory
devspace dev

# Test a query
kubectl apply -f queries/sample-query.yaml
kubectl get query sample-query -o yaml
```

### Validation

```bash
# Validate YAML files
make test-manifests

# Check deployment status
make status

# View logs
make logs
```

## 🔍 Troubleshooting

### Common Issues

**Generator not found:**

```bash
ark generate list  # Check available generators
```

**Invalid project structure:**

```bash
# Ensure you're in a project directory
ls Chart.yaml agents/ teams/ queries/  # Should exist
```

**Template errors:**

```bash
# Check template permissions and existence
ark generate <type> --help  # See requirements
```

### Debug Mode

```bash
DEBUG=true ark generate project my-project
NODE_ENV=development ark g agent my-agent
```

## 🆘 Getting Help

```bash
ark generate --help           # General help
ark generate project --help   # Project-specific help
ark g list --detailed         # Detailed generator info
```

## 🔄 Adding New Generators

To add a new generator:

1. Create a new file in `generators/`
2. Implement the `Generator` interface
3. Register it in the main command (`index.ts`)
4. Add corresponding templates to `templates/`
5. Add security validation for inputs
6. Include comprehensive error handling

Example:

```typescript
export function createMyGenerator(): Generator {
  return {
    name: 'my-generator',
    description: 'Generate custom resources',
    templatePath: 'templates/my-generator',
    generate: async (name, destination, options) => {
      return ErrorHandler.catchAndHandle(async () => {
        // Implementation here
      }, 'Generating custom resource');
    },
  };
}
```

## 📚 Related Documentation

- [ARK Documentation](https://mckinsey.github.io/agents-at-scale-ark/)
- [Template Development Guide](./templateEngine.ts)
- [Security Guidelines](../../lib/security.ts)
- [Error Handling](../../lib/errors.ts)
