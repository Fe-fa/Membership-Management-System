import type { MemberProfile } from "@/services/admin/membershipDesk";
import { emptyDraft, normalizeDraft, type ApplicationDraft, type FileRef } from "@/services/membership/schema";

function fileFromUrl(url?: string | null, fileName = "file"): FileRef | null {
  if (!url) return null;
  return { id: fileName, fileName, size: 0, contentType: "application/octet-stream", url };
}

export function memberProfileToDraft(profile: MemberProfile): ApplicationDraft {
  const license = profile.aviation.licenses[0];
  const aircraft = profile.aviation.aircraft[0];
  const emergency = profile.emergencyContacts[0];
  return normalizeDraft({
    ...emptyDraft(),
    personal: {
      ...emptyDraft().personal,
      firstName: profile.identity.firstName,
      middleName: profile.identity.middleName ?? "",
      lastName: profile.identity.lastName,
      postalAddress: profile.contact.postalAddress ?? "",
      city: profile.contact.city ?? "",
      stateCountry: profile.contact.stateCountry ?? "",
      postalCode: profile.contact.postalCode ?? "",
      country: profile.contact.country ?? "Kenya",
      email: profile.contact.email ?? "",
      altEmail: profile.contact.altEmail ?? "",
      telPrefix: profile.contact.telIntlPrefix || "+254",
      mobile: profile.contact.mobile ?? "",
      telOther: profile.contact.telOther ?? "",
      idPassportNo: profile.identity.idPassportNo ?? "",
      nationality: profile.identity.nationality ?? "",
      dateOfBirth: profile.identity.dateOfBirth?.slice(0, 10) ?? "",
      placeOfBirth: profile.identity.placeOfBirth ?? "",
      countryOfResidence: profile.contact.countryOfResidence ?? "Kenya",
      occupation: profile.identity.occupation ?? "",
      company: profile.identity.company ?? "",
      role: profile.identity.role ?? "",
      bloodGroup: (profile.identity.bloodGroup ?? "") as never,
      gender: (profile.identity.gender ?? "") as never,
      photo: fileFromUrl(profile.identity.photoUrl, "photo"),
      cv: fileFromUrl(profile.identity.cvUrl, "cv"),
    },
    family: {
      isMarried: profile.spouses.length > 0 || Boolean(profile.identity.maritalStatus?.toLowerCase().includes("married")),
      spouses: profile.spouses.map((row) => ({ name: row.name, phone: row.phone ?? "", email: row.email ?? "" })),
      hasChildren: profile.children.length > 0,
      children: profile.children.map((row) => ({ name: row.name, dateOfBirth: row.dateOfBirth?.slice(0, 10) ?? "" })),
      emergencyName: emergency?.name ?? "",
      emergencyPhone: emergency?.phone ?? "",
      emergencyEmail: emergency?.email ?? "",
    },
    aviation: {
      isAffiliated: profile.aviation.isAffiliated,
      aviationRole: profile.aviation.aviationRole ?? "",
      holdsLicense: profile.aviation.holdsLicense,
      licenseType: license?.licenseType ?? "",
      licenseNumber: license?.licenseNumber ?? "",
      licenseIssuer: license?.issuer ?? "",
      licenseFile: fileFromUrl(license?.copyFileUrl, license?.copyFileName ?? "licence"),
      ownsAircraft: profile.aviation.ownsAircraft,
      aircraftType: aircraft?.aircraftType ?? "",
      aircraftRegistration: aircraft?.registrationNumber ?? "",
      hangarLocation: aircraft?.hangarLocation ?? "",
    },
    membership: {
      membershipType: profile.governance.membershipTypeCode || profile.governance.membershipTypeName,
      applicantSignature: "",
      signatureDate: profile.joinedDate?.slice(0, 10) ?? "",
    },
    supporters: {
      proposer: {
        memberProfileId: profile.governance.proposer ? String(profile.governance.proposer.profileId) : "",
        membershipNo: profile.governance.proposer?.membershipNo ?? "",
        name: profile.governance.proposer?.fullName ?? "",
      },
      seconder: {
        memberProfileId: profile.governance.seconder ? String(profile.governance.seconder.profileId) : "",
        membershipNo: profile.governance.seconder?.membershipNo ?? "",
        name: profile.governance.seconder?.fullName ?? "",
      },
    },
    clubs: {
      memberOfOtherClub: profile.clubs?.memberOfOtherClub ?? false,
      otherClubs: (profile.clubs?.otherClubs ?? []).map((club) => ({ name: club.name })),
    },
    consent: {
      privacyPolicyAccepted: profile.consent?.privacyPolicyAccepted || undefined,
      declarationAccepted: profile.consent?.declarationAccepted || undefined,
      declarationName: profile.consent?.declarationName ?? profile.fullName,
      declarationSignature: profile.consent?.declarationSignature ?? "",
      declarationDate: profile.consent?.declarationDate?.slice(0, 10) ?? "",
    },
  });
}

export function draftToMemberUpdate(draft: ApplicationDraft, membershipNo: string, membershipTypeId: number) {
  return {
    membershipNo,
    identity: {
      firstName: draft.personal.firstName,
      middleName: draft.personal.middleName,
      lastName: draft.personal.lastName,
      photoUrl: draft.personal.photo?.url ?? null,
      cvUrl: draft.personal.cv?.url ?? null,
      idPassportNo: draft.personal.idPassportNo,
      nationality: draft.personal.nationality,
      dateOfBirth: draft.personal.dateOfBirth || null,
      placeOfBirth: draft.personal.placeOfBirth,
      bloodGroup: draft.personal.bloodGroup,
      gender: draft.personal.gender,
      maritalStatus: draft.family.isMarried ? "Married" : "Single",
      occupation: draft.personal.occupation,
      company: draft.personal.company,
      role: draft.personal.role,
    },
    contact: {
      postalAddress: draft.personal.postalAddress,
      city: draft.personal.city,
      stateCountry: draft.personal.stateCountry,
      postalCode: draft.personal.postalCode,
      country: draft.personal.country,
      countryOfResidence: draft.personal.countryOfResidence,
      email: draft.personal.email,
      altEmail: draft.personal.altEmail,
      telIntlPrefix: draft.personal.telPrefix,
      mobile: draft.personal.mobile,
      telOther: draft.personal.telOther,
    },
    spouses: draft.family.isMarried ? draft.family.spouses : [],
    children: draft.family.hasChildren ? draft.family.children : [],
    emergencyContacts: draft.family.emergencyName
      ? [
          {
            name: draft.family.emergencyName,
            phone: draft.family.emergencyPhone,
            email: draft.family.emergencyEmail,
            isPrimary: true,
          },
        ]
      : [],
    aviation: {
      isAffiliated: draft.aviation.isAffiliated,
      aviationRole: draft.aviation.aviationRole,
      holdsLicense: draft.aviation.holdsLicense,
      ownsAircraft: draft.aviation.ownsAircraft,
      licenses: draft.aviation.holdsLicense
        ? [
            {
              licenseType: draft.aviation.licenseType,
              licenseNumber: draft.aviation.licenseNumber,
              issuer: draft.aviation.licenseIssuer,
              copyFileUrl: draft.aviation.licenseFile?.url,
              copyFileName: draft.aviation.licenseFile?.fileName,
            },
          ]
        : [],
      aircraft: draft.aviation.ownsAircraft
        ? [
            {
              aircraftType: draft.aviation.aircraftType,
              registrationNumber: draft.aviation.aircraftRegistration,
              hangarLocation: draft.aviation.hangarLocation,
            },
          ]
        : [],
    },
    clubs: {
      memberOfOtherClub: draft.clubs.memberOfOtherClub,
      otherClubs: draft.clubs.otherClubs,
    },
    consent: {
      privacyPolicyAccepted: Boolean(draft.consent.privacyPolicyAccepted),
      declarationAccepted: Boolean(draft.consent.declarationAccepted),
      declarationName: draft.consent.declarationName,
      declarationSignature: draft.consent.declarationSignature,
      declarationDate: draft.consent.declarationDate || null,
    },
    joinedDate: draft.membership.signatureDate || null,
    membershipTypeId,
    changeReason: "Admin updated member from application-style form",
  };
}
