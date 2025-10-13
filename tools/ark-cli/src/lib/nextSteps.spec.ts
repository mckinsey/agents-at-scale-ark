import {jest} from '@jest/globals';
import {printNextSteps} from './nextSteps.js';

describe('printNextSteps', () => {
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let output: string[] = [];

  beforeEach(() => {
    output = [];
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('prints successful installation message', () => {
    printNextSteps();
    const fullOutput = output.join('\n');
    expect(fullOutput).toContain('✓ Installation complete');
  });

  it('includes all required commands', () => {
    printNextSteps();
    const fullOutput = output.join('\n');

    // Check for each command
    expect(fullOutput).toContain('ark models create default');
    expect(fullOutput).toContain('ark dashboard');
    expect(fullOutput).toContain('kubectl get agents');
    expect(fullOutput).toContain(
      'ark query model/default "What are large language models?"'
    );
    expect(fullOutput).toContain('ark');
    expect(fullOutput).toContain("# then choose 'Chat'");
    expect(fullOutput).toContain('ark generate project my-agents');
  });

  it('includes all required links', () => {
    printNextSteps();
    const fullOutput = output.join('\n');

    // Check for documentation links
    expect(fullOutput).toContain(
      'https://mckinsey.github.io/agents-at-scale-ark/'
    );
    expect(fullOutput).toContain(
      'https://mckinsey.github.io/agents-at-scale-ark/developer-guide/cli-tools/'
    );
  });

  it('includes all section labels', () => {
    printNextSteps();
    const fullOutput = output.join('\n');

    // Check for labels
    expect(fullOutput).toContain('Next steps:');
    expect(fullOutput).toContain('docs:');
    expect(fullOutput).toContain('create model:');
    expect(fullOutput).toContain('open dashboard:');
    expect(fullOutput).toContain('show agents:');
    expect(fullOutput).toContain('run a query:');
    expect(fullOutput).toContain('interactive chat:');
    expect(fullOutput).toContain('new project:');
    expect(fullOutput).toContain('install fark:');
  });

  it('has correct structure with empty lines', () => {
    printNextSteps();

    // Should have empty lines for formatting
    expect(output[0]).toBe('');
    expect(output[output.length - 1]).toBe('');
  });
});
