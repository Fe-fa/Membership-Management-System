import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ClubLogo } from "@/components/brand/ClubLogo";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { Route } from "@/routes/apply.$companySlug";
import { persistApplyCompany, type ApplyCompanyContext } from "@/services/applyCompany";
import { apiRequest } from "@/services/membership/api";

export function ApplyRegisterPage() {
  const { companySlug } = Route.useParams();
  const context = useQuery({
    queryKey: ["apply-company", companySlug],
    queryFn: async () => {
      const data = await apiRequest<ApplyCompanyContext>(`/api/apply/${encodeURIComponent(companySlug)}`);
      persistApplyCompany(data);
      return data;
    },
    retry: false,
  });

  if (context.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading company…</p>
      </div>
    );
  }

  if (context.isError || !context.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-3 text-center">
          <ClubLogo className="mx-auto h-12" />
          <h1 className="text-2xl font-semibold">Company not found</h1>
          <p className="text-sm text-muted-foreground">
            That apply link is invalid or the company is no longer active.
          </p>
          <Link to="/" className="text-sm text-primary underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return <RegisterPage company={context.data} />;
}
