import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Team, ArkApiClient} from '../lib/arkApiClient.js';

interface TeamSelectorProps {
  arkApiClient: ArkApiClient;
  onSelect: (team: Team) => void;
  onExit: () => void;
}

export function TeamSelector({
  arkApiClient,
  onSelect,
  onExit,
}: TeamSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    arkApiClient
      .getTeams()
      .then((fetchedTeams) => {
        setTeams(fetchedTeams);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch teams');
        setLoading(false);
      });
  }, [arkApiClient]);

  useInput((input: string, key: any) => {
    if (key.escape) {
      onExit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev === 0 ? teams.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev === teams.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(teams[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= teams.length) {
        onSelect(teams[num - 1]);
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading teams...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (teams.length === 0) {
    return (
      <Box>
        <Text>No teams available</Text>
      </Box>
    );
  }

  const selectedTeam = teams[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Select Team</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Choose a team to start a conversation with</Text>
      </Box>

      <Box flexDirection="column">
        {teams.map((team, index) => (
          <Box key={team.name} marginBottom={0}>
            <Text color={index === selectedIndex ? 'green' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {index + 1}. {team.name}
              {team.strategy ? ` (${team.strategy})` : ''}
            </Text>
          </Box>
        ))}
      </Box>

      {selectedTeam &&
        (selectedTeam.description || selectedTeam.members_count) && (
          <Box marginTop={1} paddingLeft={2}>
            <Text dimColor wrap="wrap">
              {selectedTeam.description ||
                `Members: ${selectedTeam.members_count}`}
            </Text>
          </Box>
        )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Number to select · Esc to exit</Text>
      </Box>
    </Box>
  );
}
