import {Text, Box, useInput, useApp} from 'ink';
import SelectInput from 'ink-select-input';
import * as React from 'react';

import {execa} from 'execa';
import {getUIGeneratorChoices, UI_CONFIG} from '../commands/generate/config.js';

interface GeneratorState {
  error: string | null;
}

const GeneratorUI: React.FC = () => {
  const [state, setState] = React.useState<GeneratorState>({
    error: null,
  });

  const {exit} = useApp();
  const generatorChoices = getUIGeneratorChoices();

  useInput((input: string, key: any) => {
    if (key.escape || input === 'q') {
      // Exit the UI
      exit();
    }
  });

  const handleGeneratorTypeSelect = async (choice: {value: string}) => {
    if (choice.value === 'back') {
      // Exit the UI
      exit();
      return;
    }

    if (choice.value === 'project') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        // We need to spawn this in a way that doesn't interfere with the current process
        setTimeout(() => {
          execa('ark', ['generate', 'project'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }

    if (choice.value === 'agent') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        setTimeout(() => {
          execa('ark', ['generate', 'agent'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }

    if (choice.value === 'team') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        setTimeout(() => {
          execa('ark', ['generate', 'team'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }

    if (choice.value === 'query') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        setTimeout(() => {
          execa('ark', ['generate', 'query'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }

    if (choice.value === 'mcp-server') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        setTimeout(() => {
          execa('ark', ['generate', 'mcp-server'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }

    if (choice.value === 'marketplace') {
      try {
        // Exit the UI and run the CLI command
        exit();

        // Run the CLI command
        setTimeout(() => {
          execa('ark', ['generate', 'marketplace'], {
            stdio: 'inherit',
            cwd: process.cwd(),
          }).catch((error) => {
            console.error('Failed to run generator:', error.message);
            process.exit(1);
          });
        }, 100); // Small delay to let UI exit cleanly
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to launch generator';

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      }
    }
  };

  return (
    <Box flexDirection="column">
      <Text color={UI_CONFIG.colors.primary} bold>
        {UI_CONFIG.icons.generator} Generator - Create new ARK resources
      </Text>
      <Box marginBottom={1}>
        <Text color={UI_CONFIG.colors.secondary}>
          {UI_CONFIG.messages.generatorTypePrompt}
        </Text>
      </Box>

      {state.error && (
        <Box marginBottom={1}>
          <Text color={UI_CONFIG.colors.error}>
            {UI_CONFIG.icons.error} {state.error}
          </Text>
        </Box>
      )}

      <SelectInput
        items={generatorChoices}
        onSelect={handleGeneratorTypeSelect}
      />

      <Box marginTop={1}>
        <Text color="gray">Press ESC or 'q' to exit</Text>
      </Box>
    </Box>
  );
};

export default GeneratorUI;
