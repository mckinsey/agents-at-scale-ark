import React, { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { useAtom } from 'jotai';
import { storedIsExperimentalDarkModeEnabledAtom, isExperimentalFeaturesEnabledAtom } from '@/atoms/experimental-features';
import { Switch } from '@/components/ui/switch';
import { atomWithStorage, RESET } from 'jotai/utils'
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type ExperimentalFeature = {
  feature: string;
  description?: string;
  atom: ReturnType<typeof atomWithStorage<boolean>>
}

const EXPERIMENTAL_MODAL_KEYBOARD_SHORTCUT = 'e'

const experimentalFeatures: ExperimentalFeature[] = [
  {
    feature: 'Experimental Features',
    description: 'Turning this off will disable experimental features',
    atom: isExperimentalFeaturesEnabledAtom
  },
  {
    feature: 'Experimental Dark Mode',
    atom: storedIsExperimentalDarkModeEnabledAtom
  }
]

type ExperimentalFeatureToggleProps<> = {
  feature: ExperimentalFeature
}

function ExperimentalFeatureToggle({ feature }: ExperimentalFeatureToggleProps) {
  const [atomValue, setAtom] = useAtom(feature.atom)

  const toggleAtomValue = useCallback(() => {
    setAtom(prev => prev ? RESET : true)
  }, [setAtom])

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="space-y-0.5">
        <Label>{feature.feature}</Label>
        {feature.description && <p className="text-muted-foreground text-sm">{feature.description}</p>}
      </div>
      <Switch
        checked={atomValue}
        onCheckedChange={toggleAtomValue}
      />
    </div>
  )
}

export function ExperimentalFeaturesDialog() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleModal = useCallback(() => {
    setIsDialogOpen(prev => !prev)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === EXPERIMENTAL_MODAL_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleModal()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleModal])

  return (
    <Dialog open={isDialogOpen} onOpenChange={toggleModal}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Experimental features</DialogTitle>
          <DialogDescription>Enable experimental features</DialogDescription>
        </DialogHeader>
        <div className='py-4 px-2 space-y-2'>
          {experimentalFeatures.map((feature, index) => (
            <Fragment key={feature.feature}>
              {index !== 0 && <Separator />}
              <ExperimentalFeatureToggle feature={feature} />
            </Fragment>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}