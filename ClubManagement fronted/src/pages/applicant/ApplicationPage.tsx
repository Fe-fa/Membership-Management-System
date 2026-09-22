import { ApplicationWizard } from "@/components/membership/ApplicationWizard";
import { PageFrame } from "@/components/layout/PageFrame";

export function ApplicationPage() {
  return (
    <PageFrame width="lg" className="max-w-[1120px]">
      <ApplicationWizard />
    </PageFrame>
  );
}
