'use client';

import { useAtomValue } from 'jotai';

import { isFilesBrowserAvailableAtom } from '@/atoms/experimental-features';
import { FilesSection } from '@/components/sections/files-section';
import { FilesSetupInstructions } from '@/components/sections/files-setup-instructions';

export default function FilesPage() {
  const isFilesBrowserAvailable = useAtomValue(isFilesBrowserAvailableAtom);

  if (!isFilesBrowserAvailable) {
    return <FilesSetupInstructions />;
  }

  return <FilesSection />;
}
