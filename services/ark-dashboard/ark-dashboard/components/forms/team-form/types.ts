export enum TeamFormMode {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  CREATE = 'CREATE',
}

export interface TeamFormProps {
  mode: TeamFormMode;
  teamName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}
