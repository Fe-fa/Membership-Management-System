import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export type OfficeAccess = {
  view: boolean;
  write: boolean;
};

export type OfficeModulePermission = {
  moduleId: string;
  title: string;
  description: string;
  access: Record<string, OfficeAccess>;
};

export type OfficePermissionMatrix = {
  roleCodes: string[];
  modules: OfficeModulePermission[];
};

export function fetchOfficePermissions() {
  return apiRequest<OfficePermissionMatrix>("/api/settings/office-permissions");
}

export function fetchMyOfficePermissions() {
  return apiRequest<OfficePermissionMatrix>("/api/settings/office-permissions/me");
}

export function saveOfficePermissions(modules: OfficeModulePermission[]) {
  return apiRequest<OfficePermissionMatrix>("/api/settings/office-permissions", {
    method: "PUT",
    body: JSON.stringify({ modules }),
  });
}

export function useOfficePermissionMatrix(enabled = true) {
  return useQuery({
    queryKey: ["office-permissions"],
    queryFn: fetchOfficePermissions,
    enabled,
  });
}

export function useMyOfficePermissions(enabled = true) {
  return useQuery({
    queryKey: ["office-permissions", "me"],
    queryFn: fetchMyOfficePermissions,
    enabled,
  });
}

export function useSaveOfficePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveOfficePermissions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["office-permissions"] });
    },
  });
}

/** True when any of the user's roles grants view on the module. */
export function canViewModule(
  matrix: OfficePermissionMatrix | undefined,
  moduleId: string,
  userRoles: string[] | undefined,
) {
  if (!matrix || !userRoles?.length) return false;
  const row = matrix.modules.find((m) => m.moduleId === moduleId);
  if (!row) return false;
  return userRoles.some((role) => row.access[role]?.view || row.access[role.toUpperCase()]?.view);
}

export function canWriteModule(
  matrix: OfficePermissionMatrix | undefined,
  moduleId: string,
  userRoles: string[] | undefined,
) {
  if (!matrix || !userRoles?.length) return false;
  const row = matrix.modules.find((m) => m.moduleId === moduleId);
  if (!row) return false;
  return userRoles.some((role) => row.access[role]?.write || row.access[role.toUpperCase()]?.write);
}

export { extractErrorMessage };
