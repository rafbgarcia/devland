import { Navigate, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding-prerequisites')({
  component: OnboardingPrerequisitesRoute,
});

function OnboardingPrerequisitesRoute() {
  return <Navigate replace to="/" />;
}
