import { startTransition, useEffect } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';

import { OnboardingPrerequisitesPage } from '@/renderer/components/onboarding-prerequisites-page';
import { useGHUser } from '@/renderer/hooks/use-gh-user';

export const Route = createFileRoute('/onboarding-prerequisites')({
  component: OnboardingPrerequisitesRoute,
});

function OnboardingPrerequisitesRoute() {
  const user = useGHUser();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      return;
    }

    startTransition(() => {
      void router.navigate({ to: '/', replace: true });
    });
  }, [router, user]);

  if (user !== null) {
    return null;
  }

  return <OnboardingPrerequisitesPage />;
}
