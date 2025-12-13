import chalk from 'chalk';
import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';

export function createCompletionCommand(_: ArkConfig): Command {
  const completion = new Command('completion');
  completion.description('Generate shell completion scripts').action(() => {
    console.log(chalk.cyan('Shell completion for ARK CLI'));
    console.log('');
    console.log('Usage:');
    console.log('  ark completion bash   Generate bash completion script');
    console.log('  ark completion zsh    Generate zsh completion script');
    console.log('');
    console.log('To enable completion, add this to your shell profile:');
    console.log(chalk.grey('  # For bash:'));
    console.log(chalk.grey('  eval "$(ark completion bash)"'));
    console.log(chalk.grey('  # For zsh:'));
    console.log(chalk.grey('  eval "$(ark completion zsh)"'));
  });

  completion
    .command('bash')
    .description('Generate bash completion script')
    .action(() => {
      console.log(
        `
_ark_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  
  case \${COMP_CWORD} in
    1)
      opts="agents chat cluster completion config dashboard docs evaluation export generate import install marketplace memory models queries query routes status targets teams tools uninstall help"
      COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
      return 0
      ;;
    2)
      case \${prev} in
        cluster)
          opts="get-ip get-type"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        completion)
          opts="bash zsh"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        check)
          opts="status"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        targets)
          opts="list ls"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        agents)
          opts="list ls"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        models)
          opts="list ls create"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        teams)
          opts="list ls"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        tools)
          opts="list ls"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        generate)
          opts="agent marketplace mcp-server project query team"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        marketplace)
          opts="list ls"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        memory)
          opts="list ls delete reset"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        install)
          opts="marketplace/services/phoenix marketplace/services/langfuse marketplace/agents/noah"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        uninstall)
          opts="marketplace/services/phoenix marketplace/services/langfuse marketplace/agents/noah"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
        chat)
          # Dynamically fetch available targets using ark targets list
          local targets
          targets=$(ark targets list 2>/dev/null)
          if [ -z "$targets" ]; then
            # Fallback to common targets if API is not available
            targets="agent/sample-agent agent/math agent/weather model/default"
          fi
          COMPREPLY=( $(compgen -W "\${targets}" -- \${cur}) )
          return 0
          ;;
        query)
          # Dynamically fetch available targets for query command
          local targets
          targets=$(ark targets list 2>/dev/null)
          if [ -z "$targets" ]; then
            # Fallback to common targets if API is not available
            targets="model/default agent/sample-agent"
          fi
          COMPREPLY=( $(compgen -W "\${targets}" -- \${cur}) )
          return 0
          ;;
        queries)
          opts="get delete resubmit"
          COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
          return 0
          ;;
      esac
      ;;
  esac
}

complete -F _ark_completion ark
      `.trim()
      );
    });

  completion
    .command('zsh')
    .description('Generate zsh completion script')
    .action(() => {
      // Shell script requires escaped $ characters

      console.log(
        `
#compdef ark

_ark() {
  local context state line
  
  _arguments -C \\
    '1:command:->command' \\
    '2:subcommand:->subcommand' \\
    '*::arg:->args'
    
  case $state in
    command)
      _values 'ark commands' \\
        'agents[List available agents]' \\
        'chat[Interactive chat with agents and models]' \\
        'cluster[Cluster management commands]' \\
        'completion[Generate shell completion scripts]' \\
        'config[Configuration management]' \\
        'dashboard[Open ARK dashboard]' \\
        'docs[Open ARK documentation]' \\
        'evaluation[Execute evaluations against evaluators]' \\
        'export[Export ARK resources to a file]' \\
        'generate[Generate ARK resources]' \\
        'import[Import ARK resources from a file]' \\
        'install[Install ARK services]' \\
        'marketplace[Manage marketplace services]' \\
        'memory[Manage memory sessions and queries]' \\
        'models[List available models]' \\
        'queries[Manage query resources]' \\
        'query[Execute a single query]' \\
        'routes[List available routes]' \\
        'status[Check system status]' \\
        'targets[List available query targets]' \\
        'teams[List available teams]' \\
        'tools[List available tools]' \\
        'uninstall[Uninstall ARK services]' \\
        'help[Show help information]'
      ;;
    subcommand)
      case $words[2] in
        cluster)
          _values 'cluster commands' \\
            'get-ip[Get cluster IP address]' \\
            'get-type[Get cluster type]'
          ;;
        completion)
          _values 'completion shells' \\
            'bash[Generate bash completion]' \\
            'zsh[Generate zsh completion]'
          ;;
        check)
          _values 'check commands' \\
            'status[Check system status]'
          ;;
        targets)
          _values 'targets commands' \\
            'list[List all available targets]' \\
            'ls[List all available targets]'
          ;;
        agents)
          _values 'agents commands' \\
            'list[List all available agents]' \\
            'ls[List all available agents]'
          ;;
        models)
          _values 'models commands' \\
            'list[List all available models]' \\
            'ls[List all available models]' \\
            'create[Create a new model]'
          ;;
        teams)
          _values 'teams commands' \\
            'list[List all available teams]' \\
            'ls[List all available teams]'
          ;;
        tools)
          _values 'tools commands' \\
            'list[List all available tools]' \\
            'ls[List all available tools]'
          ;;
        generate)
          _values 'generate types' \\
            'agent[Generate a new agent]' \\
            'marketplace[Generate marketplace content]' \\
            'mcp-server[Generate MCP server]' \\
            'project[Generate a new project]' \\
            'query[Generate a query]' \\
            'team[Generate a team]'
          ;;
        marketplace)
          _values 'marketplace commands' \\
            'list[List available marketplace services]' \\
            'ls[List available marketplace services]'
          ;;
        memory)
          _values 'memory commands' \\
            'list[List all sessions]' \\
            'ls[List all sessions]' \\
            'delete[Delete memory data]' \\
            'reset[Delete memory data]'
          ;;
        install)
          _values 'services to install' \\
            'marketplace/services/phoenix[Phoenix observability platform]' \\
            'marketplace/services/langfuse[Langfuse LLM analytics]'
          ;;
        uninstall)
          _values 'services to uninstall' \\
            'marketplace/services/phoenix[Phoenix observability platform]' \\
            'marketplace/services/langfuse[Langfuse LLM analytics]'
          ;;
        chat)
          # Get available targets dynamically
          local -a targets
          targets=($(ark targets list 2>/dev/null))
          if [ \${#targets[@]} -eq 0 ]; then
            targets=('agent/sample-agent' 'agent/math' 'agent/weather' 'model/default')
          fi
          _values 'available targets' \${targets[@]}
          ;;
        query)
          # Get available targets dynamically for query
          local -a targets
          targets=($(ark targets list 2>/dev/null))
          if [ \${#targets[@]} -eq 0 ]; then
            targets=('model/default' 'agent/sample-agent')
          fi
          _values 'available targets' \${targets[@]}
          ;;
        queries)
          _values 'queries commands' \\
            'get[Get a specific query]' \\
            'delete[Delete a query]' \\
            'resubmit[Resubmit a query by clearing its status]'
          ;;
      esac
      ;;
  esac
}

_ark
      `.trim()
      );
    });

  return completion;
}
