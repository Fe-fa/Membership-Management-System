import { apiRequest } from "@/services/membership/api";

export type ClubSetupCountry = {
  id: number;
  countryCode: string;
  countryName: string;
  currencyDescription?: string | null;
};

export type ClubSetupCompany = {
  id: number;
  logoUrl?: string | null;
  companyCode: string;
  companyName: string;
  slug?: string | null;
  payrollName?: string | null;
  postalAddress?: string | null;
  physicalLocation?: string | null;
  town?: string | null;
  pinNumber?: string | null;
  countryId?: number | null;
  countryName?: string | null;
  currencyDescription?: string | null;
};

export type ClubSetupDesignation = {
  id: number;
  designationCode: string;
  description: string;
  isActive: boolean;
  companyId?: number | null;
  companyName?: string | null;
  isGlobal: boolean;
  isProtected: boolean;
};

export function listClubCountries() {
  return apiRequest<ClubSetupCountry[]>("/api/club-setup/countries");
}

export function saveClubCountry(payload: Omit<ClubSetupCountry, "id">, id?: number) {
  return apiRequest<ClubSetupCountry>(id ? `/api/club-setup/countries/${id}` : "/api/club-setup/countries", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
}

export function listClubCompanies() {
  return apiRequest<ClubSetupCompany[]>("/api/club-setup/companies");
}

export function saveClubCompany(payload: Omit<ClubSetupCompany, "id">, id?: number) {
  return apiRequest<ClubSetupCompany>(id ? `/api/club-setup/companies/${id}` : "/api/club-setup/companies", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteClubCompany(id: number) {
  return apiRequest<void>(`/api/club-setup/companies/${id}`, { method: "DELETE" });
}

export function listClubDesignations() {
  return apiRequest<ClubSetupDesignation[]>("/api/club-setup/designations");
}

export function saveClubDesignation(payload: Omit<ClubSetupDesignation, "id">, id?: number) {
  return apiRequest<ClubSetupDesignation>(
    id ? `/api/club-setup/designations/${id}` : "/api/club-setup/designations",
    {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteClubDesignation(id: number) {
  return apiRequest<void>(`/api/club-setup/designations/${id}`, { method: "DELETE" });
}
