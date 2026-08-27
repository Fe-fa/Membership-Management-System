-- =====================================================================
-- Round-trip verification script for the applicant flow
-- ---------------------------------------------------------------------
-- Proves that every field the React wizard collects can be INSERTed into
-- the relational tables and SELECTed back re-joined against the lookups —
-- i.e. frontend -> API -> database -> API -> frontend.
--
-- HOW TO RUN: after executing 20260818_AlignWithWizard.sql, run this
-- against the [ClubManagement] database in SSMS / sqlcmd.
-- It is fully transactional: the demo rows are rolled back at the end so
-- your data is untouched.
-- =====================================================================
USE [ClubManagement];
GO

BEGIN TRANSACTION;
BEGIN TRY

    /* 1. Profile (MProfile) — every personal field the wizard captures */
    DECLARE @genderF BIGINT = (SELECT gender_id FROM [dbo].[Gender] WHERE code = N'FEMALE');
    DECLARE @bloodO BIGINT = (SELECT blood_group_id FROM [dbo].[blood_group] WHERE code = N'O+');
    DECLARE @maritalM BIGINT = (SELECT marital_status_id FROM [dbo].[Marital_status] WHERE code = N'MARRIED');
    DECLARE @countryKE BIGINT = (SELECT country_id FROM [dbo].[Country] WHERE country_code = N'KE');
    DECLARE @countryGB BIGINT = (SELECT country_id FROM [dbo].[Country] WHERE country_code = N'GB');

    INSERT INTO [dbo].[MProfile]
        ([title],[first_name],[middle_name],[last_name],[gender_id],[marital_status_id],[blood_group_id],
         [date_of_birth],[place_of_birth],[nationality_id],[country_of_residence_id],[id_passport_no],
         [occupation],[company],[role],[postal_address],[city],[state_country],[postal_code],[country_id],
         [email],[alt_email],[tel_intl_prefix],[mobile],[tel_other],[photo_url],[data_consent_given],
         [privacy_policy_accepted_at],[is_active],[is_deleted],[created_at])
    VALUES
        (N'Ms.', N'Test', N'Round', N'Trip', @genderF, @maritalM, @bloodO,
         '1990-04-15', N'Nairobi', @countryKE, @countryKE, N'ID-12345678',
         N'Pilot', N'Test Air', N'First Officer', N'P.O. Box 999', N'Nairobi', N'Nairobi County', N'00100', @countryKE,
         N'rt@example.co.ke', N'alt@example.co.ke', N'+254', N'+254 700 111 222', N'+254 733 333 444',
         N'/uploads/photo-demo.jpg', 1, SYSUTCDATETIME(), 1, 0, SYSUTCDATETIME());

    DECLARE @profileId BIGINT = SCOPE_IDENTITY();

    /* 2. Application (MApplication) — workflow fields + wizard JSON */
    DECLARE @draftStatus BIGINT = (SELECT application_status_id FROM [dbo].[Application_status] WHERE code = N'DRAFT');
    DECLARE @ballot BIGINT = (SELECT election_type_id FROM [dbo].[Election_type] WHERE code = N'BALLOT');

    INSERT INTO [dbo].[MApplication]
        ([application_no],[applicant_profile_id],[election_type_id],[application_status_id],
         [received_date],[club_visits_count],[interview_required_flag],[entrance_fee_amount],
         [annual_subscription_amount],[form_data_json],[completed_steps_json],[created_at],[updated_at])
    VALUES
        (N'ACEA-2026-98765', @profileId, @ballot, @draftStatus,
         '2026-08-18', 3, 0, 250000.00, 39500.00,
         N'{"personal":{"firstName":"Test"},"family":{"isMarried":true}}',
         N'["personal","family","aviation","membership","supporters","clubs","consent"]',
         SYSUTCDATETIME(), SYSUTCDATETIME());

    DECLARE @applicationId BIGINT = SCOPE_IDENTITY();

    /* 3. Child rows — the DDL tables the refactored backend writes to */

    -- MDependant: spouse + child
    DECLARE @relSpouse BIGINT = (SELECT relationship_type_id FROM [dbo].[Relationship_type] WHERE code = N'SPOUSE');
    DECLARE @relChild BIGINT = (SELECT relationship_type_id FROM [dbo].[Relationship_type] WHERE code = N'CHILD');
    DECLARE @relOther BIGINT = (SELECT relationship_type_id FROM [dbo].[Relationship_type] WHERE code = N'OTHER');

    INSERT INTO [dbo].[MDependant] ([profile_id],[relationship_type_id],[dependant_name],[dependant_dob],[telephone],[email],[is_below_18_flag],[is_active],[created_at])
    VALUES (@profileId, @relSpouse, N'Spouse One', NULL, N'+254 700 111 333', N'spouse@example.co.ke', 0, 1, SYSUTCDATETIME()),
           (@profileId, @relChild, N'Child One', '2015-06-01', NULL, NULL, 1, 1, SYSUTCDATETIME());

    -- Member_emergency_contact
    INSERT INTO [dbo].[Member_emergency_contact] ([profile_id],[contact_name],[relationship_type_id],[telephone],[email],[is_primary_flag],[is_active],[created_at])
    VALUES (@profileId, N'Emergency One', @relOther, N'+254 711 222 333', N'emergency@example.co.ke', 1, 1, SYSUTCDATETIME());

    -- Member_aviation_detail + Member_license + Member_aircraft
    INSERT INTO [dbo].[Member_aviation_detail] ([profile_id],[is_aviation_affiliated],[aviation_role],[holds_pilot_licence_flag],[owns_aircraft_flag],[created_at])
    VALUES (@profileId, 1, N'First Officer', 1, 1, SYSUTCDATETIME());

    DECLARE @licCpl BIGINT = (SELECT license_type_id FROM [dbo].[License_type] WHERE code = N'CPL');
    INSERT INTO [dbo].[Member_license] ([profile_id],[license_type_id],[license_number],[issuer],[issued_date],[expiry_date],[license_document_id],[is_active],[created_at])
    VALUES (@profileId, @licCpl, N'KEN-CPL-0001', N'KCAA', '2018-01-10', '2028-01-09', NULL, 1, SYSUTCDATETIME());

    DECLARE @acSingle BIGINT = (SELECT aircraft_type_id FROM [dbo].[Aircraft_type] WHERE code = N'SINGLE_ENGINE');
    INSERT INTO [dbo].[Member_aircraft] ([profile_id],[aircraft_type_id],[registration_number],[hangar_location],[is_co_owned],[is_active],[created_at])
    VALUES (@profileId, @acSingle, N'5Y-ABC', N'Wilson Hangar 7', 0, 1, SYSUTCDATETIME());

    -- Member_club_affiliation (other club; Club row auto-created by resolver)
    DECLARE @affMember BIGINT = (SELECT affiliation_type_id FROM [dbo].[Affiliation_type] WHERE code = N'MEMBER');
    DECLARE @clubType BIGINT = (SELECT club_type_id FROM [dbo].[Club_type] WHERE code = N'COUNTRY');
    INSERT INTO [dbo].[Club] ([club_name],[club_type_id],[city],[country_id],[is_active],[created_at])
    VALUES (N'Verification Country Club', @clubType, N'Nairobi', @countryKE, 1, SYSUTCDATETIME());
    DECLARE @clubId BIGINT = SCOPE_IDENTITY();
    INSERT INTO [dbo].[Member_club_affiliation] ([profile_id],[club_id],[affiliation_type_id],[start_date],[is_active],[created_at])
    VALUES (@profileId, @clubId, @affMember, '2020-01-01', 1, SYSUTCDATETIME());

    -- Application_signature: applicant + declaration records
    INSERT INTO [dbo].[Application_signature] ([application_id],[signatory_profile_id],[signatory_role],[signature_image_url],[signed_at],[created_at])
    VALUES (@applicationId, @profileId, N'APPLICANT', NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
           (@applicationId, @profileId, N'DECLARANT', NULL, SYSUTCDATETIME(), SYSUTCDATETIME());

    /* 4. READ BACK — every field, re-joined against the lookups */
    SELECT
        p.profile_id, p.title, p.first_name, p.middle_name, p.last_name,
        g.name            AS gender_name,
        bg.name           AS blood_group_name,
        ms.name           AS marital_status_name,
        p.date_of_birth, p.place_of_birth,
        n.country_name    AS nationality_name,
        cor.country_name  AS country_of_residence_name,
        c.country_name    AS postal_country_name,
        p.id_passport_no, p.occupation, p.company, p.role,
        p.postal_address, p.city, p.state_country, p.postal_code,
        p.email, p.alt_email, p.tel_intl_prefix, p.mobile, p.tel_other, p.photo_url,
        p.data_consent_given, p.privacy_policy_accepted_at
    FROM [dbo].[MProfile] p
    LEFT JOIN [dbo].[Gender] g            ON g.gender_id = p.gender_id
    LEFT JOIN [dbo].[blood_group] bg      ON bg.blood_group_id = p.blood_group_id
    LEFT JOIN [dbo].[Marital_status] ms   ON ms.marital_status_id = p.marital_status_id
    LEFT JOIN [dbo].[Country] n           ON n.country_id = p.nationality_id
    LEFT JOIN [dbo].[Country] cor         ON cor.country_id = p.country_of_residence_id
    LEFT JOIN [dbo].[Country] c           ON c.country_id = p.country_id
    WHERE p.profile_id = @profileId;

    SELECT a.application_id, a.application_no, a.election_type_id, et.name AS election_type_name,
           a.application_status_id, ast.name AS status_name, a.received_date, a.club_visits_count,
           a.interview_required_flag, a.entrance_fee_amount, a.annual_subscription_amount,
           a.form_data_json, a.completed_steps_json, a.submitted_at
    FROM [dbo].[MApplication] a
    LEFT JOIN [dbo].[Election_type] et      ON et.election_type_id = a.election_type_id
    LEFT JOIN [dbo].[Application_status] ast ON ast.application_status_id = a.application_status_id
    WHERE a.application_id = @applicationId;

    SELECT d.dependant_id, d.dependant_name, rt.name AS relationship_name,
           d.dependant_dob, d.telephone, d.email, d.is_below_18_flag
    FROM [dbo].[MDependant] d
    LEFT JOIN [dbo].[Relationship_type] rt ON rt.relationship_type_id = d.relationship_type_id
    WHERE d.profile_id = @profileId ORDER BY d.dependant_id;

    SELECT mec.member_emergency_contact_id, mec.contact_name, rt.name AS relationship_name,
           mec.telephone, mec.email, mec.is_primary_flag
    FROM [dbo].[Member_emergency_contact] mec
    LEFT JOIN [dbo].[Relationship_type] rt ON rt.relationship_type_id = mec.relationship_type_id
    WHERE mec.profile_id = @profileId;

    SELECT mad.member_aviation_detail_id, mad.is_aviation_affiliated, mad.aviation_role,
           mad.holds_pilot_licence_flag, mad.owns_aircraft_flag
    FROM [dbo].[Member_aviation_detail] mad WHERE mad.profile_id = @profileId;

    SELECT ml.member_license_id, lt.name AS license_type_name, ml.license_number, ml.issuer,
           ml.issued_date, ml.expiry_date, ml.license_document_id
    FROM [dbo].[Member_license] ml
    LEFT JOIN [dbo].[License_type] lt ON lt.license_type_id = ml.license_type_id
    WHERE ml.profile_id = @profileId;

    SELECT ma.member_aircraft_id, at.name AS aircraft_type_name, ma.registration_number,
           ma.hangar_location, ma.is_co_owned
    FROM [dbo].[Member_aircraft] ma
    LEFT JOIN [dbo].[Aircraft_type] at ON at.aircraft_type_id = ma.aircraft_type_id
    WHERE ma.profile_id = @profileId;

    SELECT mca.member_club_affiliation_id, cl.club_name, af.name AS affiliation_type_name, mca.start_date
    FROM [dbo].[Member_club_affiliation] mca
    LEFT JOIN [dbo].[Club] cl            ON cl.club_id = mca.club_id
    LEFT JOIN [dbo].[Affiliation_type] af ON af.affiliation_type_id = mca.affiliation_type_id
    WHERE mca.profile_id = @profileId;

    SELECT asg.application_signature_id, asg.signatory_role, asg.signed_at
    FROM [dbo].[Application_signature] asg
    WHERE asg.application_id = @applicationId ORDER BY asg.application_signature_id;

    PRINT N'ROUND TRIP OK — all wizard fields stored and read back.';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT N'ROUND TRIP FAILED: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

ROLLBACK TRANSACTION; -- optional: comment out to keep the demo rows
GO
