import { atom } from 'jotai';

export const settingsEntryUrlAtom = atom<string | null>(null);

export const lastListUrlAtom = atom<Record<string, string>>({});
