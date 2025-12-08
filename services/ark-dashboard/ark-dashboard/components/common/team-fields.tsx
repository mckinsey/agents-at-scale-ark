import { Label } from '@radix-ui/react-label';
import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Team, teamsService } from '@/lib/services';

interface TeamFieldsProps {
  selectedTeam: string;
  setSelectedTeam: (team: string) => void;
  namespace: string;
  open: boolean;
}

function TeamFields({
  selectedTeam,
  setSelectedTeam,
  namespace,
  open,
}: TeamFieldsProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      if (open) {
        setLoadingTeams(true);
        try {
          const teamList = await teamsService.getAll();
          setTeams(teamList);
        } catch (error) {
          console.error('Failed to load teams:', error);
        } finally {
          setLoadingTeams(false);
        }
      }
    };
    fetchTeams();
  }, [open, namespace]);

  return (
    <div className="grid gap-2">
      <Label htmlFor="team">Team</Label>
      <Select value={selectedTeam} onValueChange={setSelectedTeam}>
        <SelectTrigger id="team">
          <SelectValue
            placeholder={loadingTeams ? 'Loading teams...' : 'Select team...'}
          />
        </SelectTrigger>
        <SelectContent>
          {loadingTeams ? (
            <SelectItem value="loading" disabled>
              Loading teams...
            </SelectItem>
          ) : teams.length === 0 ? (
            <SelectItem value="no-teams" disabled>
              No teams available
            </SelectItem>
          ) : (
            teams.map(team => (
              <SelectItem key={team.id} value={team.name}>
                {team.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export { TeamFields };
