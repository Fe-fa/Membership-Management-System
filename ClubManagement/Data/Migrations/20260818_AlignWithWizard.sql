-- =====================================================================
-- ClubManagement alignment migration
-- Purpose: bring the SQL Server schema in line with the React wizard and
-- the corrected .NET backend (form payload persistence + relational child
-- tables + lookup seed data). Idempotent: safe to run more than once.
-- =====================================================================
USE [ClubManagement];
GO

/* ---------------------------------------------------------------------
   0. Fix DDL typo from the original schema script
   --------------------------------------------------------------------- */
-- The original script declared the Subscription amount column as
-- "[arre       ars_amount]" (broken name). If that column still exists and
-- the corrected name does not, rename it so the .NET entity
-- (ArrearsAmount -> arrears_amount) binds. The Aplication_document table
-- name is intentionally LEFT AS-IS: the .NET entity maps to that exact
-- (misspelled) name for EF compatibility.
IF COL_LENGTH('dbo.Subscription', 'arrears_amount') IS NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Subscription')
                 AND name LIKE 'arre%ars_amount')
    BEGIN
        DECLARE @badCol NVARCHAR(128) = (SELECT TOP 1 name FROM sys.columns
                                         WHERE object_id = OBJECT_ID('dbo.Subscription')
                                           AND name LIKE 'arre%ars_amount');
        DECLARE @sql NVARCHAR(400) = N'EXEC sp_rename ''dbo.Subscription.' + @badCol + N''', ''arrears_amount'', ''COLUMN'';';
        EXEC sp_executesql @sql;
    END
END
GO

/* ---------------------------------------------------------------------
   1. MApplication: persist the wizard draft + step progress + updated_at
   --------------------------------------------------------------------- */
IF COL_LENGTH('dbo.MApplication', 'form_data_json') IS NULL
    ALTER TABLE [dbo].[MApplication] ADD [form_data_json] NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.MApplication', 'completed_steps_json') IS NULL
    ALTER TABLE [dbo].[MApplication] ADD [completed_steps_json] NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.MApplication', 'updated_at') IS NULL
    ALTER TABLE [dbo].[MApplication] ADD [updated_at] DATETIME2 NULL;
GO

/* ---------------------------------------------------------------------
   2. Lookup seed data
   The backend resolves wizard display values (gender, blood group, marital
   status, nationality, licence type, aircraft type, relationship, club…)
   to FK ids on these tables. Seed the rows the wizard relies on; the
   backend auto-inserts any missing lookup values on demand.
   --------------------------------------------------------------------- */

-- Application statuses (ids 1..6 are referenced by the client + workflow options)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Application_status])
BEGIN
    SET IDENTITY_INSERT [dbo].[Application_status] ON;
    INSERT INTO [dbo].[Application_status]
        ([application_status_id],[code],[name],[description],[sort_order],[is_active],[is_terminal])
    VALUES
        (1, N'DRAFT',       N'Draft',        N'Application drafted, not yet submitted',        1, 1, 0),
        (2, N'SUBMITTED',   N'Submitted',    N'Submitted, awaiting committee review',          2, 1, 0),
        (3, N'UNDERREVIEW', N'Under Review', N'Being reviewed by the committee',               3, 1, 0),
        (4, N'APPROVED',    N'Approved',     N'Application approved',                          4, 1, 1),
        (5, N'REJECTED',    N'Rejected',     N'Application rejected',                          5, 1, 1),
        (6, N'WAITLIST',    N'Waitlist',     N'Placed on the waiting list',                    6, 1, 0);
    SET IDENTITY_INSERT [dbo].[Application_status] OFF;
END;
GO

MERGE [dbo].[Application_status] AS target
USING (VALUES
    (7, N'WITHDRAWN', N'Withdrawn', N'Application withdrawn by applicant', 7, 1, 1)
) AS src ([application_status_id],[code],[name],[description],[sort_order],[is_active],[is_terminal])
ON target.[application_status_id] = src.[application_status_id]
WHEN MATCHED THEN
    UPDATE SET
        [code] = src.[code],
        [name] = src.[name],
        [description] = src.[description],
        [sort_order] = src.[sort_order],
        [is_active] = src.[is_active],
        [is_terminal] = src.[is_terminal]
WHEN NOT MATCHED THEN
    INSERT ([application_status_id],[code],[name],[description],[sort_order],[is_active],[is_terminal])
    VALUES (src.[application_status_id], src.[code], src.[name], src.[description], src.[sort_order], src.[is_active], src.[is_terminal]);
GO

-- Member statuses: an "active" flag drives the eligible-supporters query
IF NOT EXISTS (SELECT 1 FROM [dbo].[Member_status])
BEGIN
    SET IDENTITY_INSERT [dbo].[Member_status] ON;
    INSERT INTO [dbo].[Member_status]
        ([member_status_id],[code],[name],[description],[sort_order],[is_active],[is_terminal],[is_active_status])
    VALUES
        (1, N'ACTIVE',    N'Active',    N'Member in good standing', 1, 1, 0, 1),
        (2, N'SUSPENDED', N'Suspended', N'Membership suspended',    2, 1, 0, 0),
        (3, N'RESIGNED',  N'Resigned',  N'Member resigned',         3, 1, 1, 0);
    SET IDENTITY_INSERT [dbo].[Member_status] OFF;
END;
GO

-- Election type (the wizard posts electionTypeId = 1)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Election_type])
BEGIN
    SET IDENTITY_INSERT [dbo].[Election_type] ON;
    INSERT INTO [dbo].[Election_type] ([election_type_id],[code],[name],[description],[sort_order],[is_active])
    VALUES (1, N'BALLOT', N'Ballot', N'Standard ballot election', 1, 1);
    SET IDENTITY_INSERT [dbo].[Election_type] OFF;
END;
GO

-- Document types used by the attachments step (photo / cv / license)
MERGE [dbo].[Document_type] AS target
USING (VALUES
    (N'PHOTO',   N'Passport photo',   1),
    (N'CV',      N'Curriculum vitae', 2),
    (N'LICENSE', N'Pilot licence',    3)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active])
    VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

-- Core membership types
MERGE [dbo].[Membership_type] AS target
USING (VALUES
    (N'FULL',     N'Full',     1),
    (N'COUNTRY',  N'Country',  2),
    (N'OVERSEAS', N'Overseas', 3)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active],[can_vote],[can_run_for_office],[reciprocation_allowed],[can_introduce_guests],[is_permanent])
    VALUES (src.[code], src.[name], src.[sort_order], 1, 1, 1, 1, 1, 1);
GO

-- Kenya + a couple of common nationalities for the profile country lookups
MERGE [dbo].[Country] AS target
USING (VALUES
    (N'KE', N'Kenya',         1),
    (N'GB', N'United Kingdom',2),
    (N'US', N'United States', 3)
) AS src ([country_code],[country_name],[sort_order])
ON target.[country_code] = src.[country_code]
WHEN NOT MATCHED THEN
    INSERT ([country_code],[country_name],[sort_order],[is_active])
    VALUES (src.[country_code], src.[country_name], src.[sort_order], 1);
GO

-- Wizard lookups resolved by name/code at write time (auto-created if missing)
MERGE [dbo].[Gender] AS target
USING (VALUES
    (N'FEMALE', N'Female', 1), (N'MALE', N'Male', 2),
    (N'OTHER', N'Other', 3), (N'PREFER_NOT_TO_SAY', N'Prefer not to say', 4)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

MERGE [dbo].[blood_group] AS target
USING (VALUES
    (N'A+', N'A+', 1), (N'A-', N'A-', 2), (N'B+', N'B+', 3), (N'B-', N'B-', 4),
    (N'AB+', N'AB+', 5), (N'AB-', N'AB-', 6), (N'O+', N'O+', 7), (N'O-', N'O-', 8),
    (N'UNKNOWN', N'Unknown', 9)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

MERGE [dbo].[Marital_status] AS target
USING (VALUES
    (N'SINGLE', N'Single', 1), (N'MARRIED', N'Married', 2),
    (N'DIVORCED', N'Divorced', 3), (N'WIDOWED', N'Widowed', 4),
    (N'OTHER', N'Other', 5)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

MERGE [dbo].[Relationship_type] AS target
USING (VALUES
    (N'SPOUSE', N'Spouse', 1), (N'CHILD', N'Child', 2), (N'PARENT', N'Parent', 3),
    (N'SIBLING', N'Sibling', 4), (N'OTHER', N'Other', 5)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

-- NOTE: the DDL License_type table has NO sort_order column.
MERGE [dbo].[License_type] AS target
USING (VALUES
    (N'PPL', N'Private Pilot Licence'),
    (N'CPL', N'Commercial Pilot Licence'),
    (N'ATPL', N'Airline Transport Pilot Licence'),
    (N'OTHER', N'Other')
) AS src ([code],[name])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[is_active]) VALUES (src.[code], src.[name], 1);
GO

MERGE [dbo].[Aircraft_type] AS target
USING (VALUES
    (N'SINGLE_ENGINE', N'Single-engine', 1),
    (N'MULTI_ENGINE', N'Multi-engine', 2),
    (N'HELICOPTER', N'Helicopter', 3),
    (N'OTHER', N'Other', 4)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

MERGE [dbo].[Affiliation_type] AS target
USING (VALUES
    (N'MEMBER', N'Member', 1),
    (N'HONORARY', N'Honorary', 2),
    (N'OTHER', N'Other', 3)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

MERGE [dbo].[Club_type] AS target
USING (VALUES
    (N'FLYING',  N'Flying club',  1),
    (N'COUNTRY', N'Country club', 2),
    (N'OTHER',   N'Other',        3)
) AS src ([code],[name],[sort_order])
ON target.[code] = src.[code]
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[sort_order],[is_active]) VALUES (src.[code], src.[name], src.[sort_order], 1);
GO

-- Example member accounts so the proposer/seconder picker works after seeding.
-- Re-run safe: identity columns prevent duplicates.
IF NOT EXISTS (SELECT 1 FROM [dbo].[MProfile])
BEGIN
    DECLARE @genderF BIGINT = (SELECT gender_id FROM [dbo].[Gender] WHERE code = N'FEMALE');
    DECLARE @genderM BIGINT = (SELECT gender_id FROM [dbo].[Gender] WHERE code = N'MALE');
    DECLARE @bloodO BIGINT = (SELECT blood_group_id FROM [dbo].[blood_group] WHERE code = N'O+');
    DECLARE @bloodA BIGINT = (SELECT blood_group_id FROM [dbo].[blood_group] WHERE code = N'A+');
    DECLARE @maritalM BIGINT = (SELECT marital_status_id FROM [dbo].[Marital_status] WHERE code = N'MARRIED');
    DECLARE @maritalS BIGINT = (SELECT marital_status_id FROM [dbo].[Marital_status] WHERE code = N'SINGLE');
    DECLARE @countryKE BIGINT = (SELECT country_id FROM [dbo].[Country] WHERE country_code = N'KE');
    DECLARE @countryGB BIGINT = (SELECT country_id FROM [dbo].[Country] WHERE country_code = N'GB');
    DECLARE @fullType BIGINT = (SELECT membership_type_id FROM [dbo].[Membership_type] WHERE code = N'FULL');
    DECLARE @countryType BIGINT = (SELECT membership_type_id FROM [dbo].[Membership_type] WHERE code = N'COUNTRY');
    DECLARE @overseasType BIGINT = (SELECT membership_type_id FROM [dbo].[Membership_type] WHERE code = N'OVERSEAS');
    DECLARE @activeStatus BIGINT = (SELECT member_status_id FROM [dbo].[Member_status] WHERE code = N'ACTIVE');
    DECLARE @ballot BIGINT = (SELECT election_type_id FROM [dbo].[Election_type] WHERE code = N'BALLOT');

    INSERT INTO [dbo].[MProfile]
        ([membership_no],[title],[first_name],[middle_name],[last_name],[gender_id],[marital_status_id],
         [blood_group_id],[date_of_birth],[place_of_birth],[nationality_id],[country_of_residence_id],
         [occupation],[company],[role],[postal_address],[city],[country_id],[email],[mobile],
         [data_consent_given],[is_active],[created_at])
    VALUES
        (N'ACEA/F/1041', N'Capt.', N'Miriam', NULL, N'Wanjiku', @genderF, @maritalM, @bloodO, '1978-05-12', N'Kisumu', @countryKE, @countryKE, N'Airline Captain', N'Kenya Airways', N'B737 Captain', N'P.O. Box 1041', N'Nairobi', @countryKE, N'm.wanjiku@example.co.ke', N'+254 722 100 220', 1, 1, SYSUTCDATETIME()),
        (N'ACEA/F/1088', N'Eng.', N'Peter', NULL, N'Oduor', @genderM, @maritalM, @bloodA, '1980-11-03', N'Nairobi', @countryKE, @countryKE, N'Aerospace Engineer', N'Safaricom', N'Head of Engineering', N'P.O. Box 1088', N'Nairobi', @countryKE, N'p.oduor@example.co.ke', N'+254 733 441 908', 1, 1, SYSUTCDATETIME()),
        (N'ACEA/C/1156', N'Dr.', N'Aisha', NULL, N'Rahman', @genderF, @maritalS, @bloodO, '1985-02-27', N'Mombasa', @countryKE, @countryKE, N'Consultant', N'UNEP', N'Senior Consultant', N'P.O. Box 1156', N'Mombasa', @countryKE, N'a.rahman@example.co.ke', N'+254 700 552 143', 1, 1, SYSUTCDATETIME()),
        (N'ACEA/F/1203', N'Mr.', N'Julius', NULL, N'Kimani', @genderM, @maritalM, @bloodA, '1972-09-19', N'Nakuru', @countryKE, @countryKE, N'Businessman', N'Kimani Holdings', N'Director', N'P.O. Box 1203', N'Naivasha', @countryKE, N'j.kimani@example.co.ke', N'+254 711 330 771', 1, 1, SYSUTCDATETIME()),
        (N'ACEA/O/1310', N'Ms.', N'Hannah', NULL, N'Lelei', @genderF, @maritalS, @bloodO, '1990-07-08', N'Eldoret', @countryKE, @countryGB, N'Pilot', N'British Airways', N'First Officer', N'12 Clerkenwell Rd', N'London', @countryGB, N'h.lelei@example.com', N'+44 7700 900321', 1, 1, SYSUTCDATETIME()),
        (N'ACEA/F/1402', N'Mrs.', N'Grace', NULL, N'Mumbi', @genderF, @maritalM, @bloodA, '1988-03-25', N'Thika', @countryKE, @countryKE, N'Financial Advisor', N'KCB Group', N'Advisor', N'P.O. Box 1402', N'Nairobi', @countryKE, N'g.mumbi@example.co.ke', N'+254 720 884 010', 1, 1, SYSUTCDATETIME())
    ;

    DECLARE @lastProfileId BIGINT = SCOPE_IDENTITY();

    INSERT INTO [dbo].[MAccount]
        ([profile_id],[application_id],[membership_type_id],[election_type_id],[membership_no],
         [current_member_status_id],[joined_date],[start_date],[is_active],[created_at])
    VALUES
        (@lastProfileId - 5, NULL, @fullType, @ballot, N'ACEA/F/1041', @activeStatus, '2009-01-15', '2009-01-15', 1, SYSUTCDATETIME()),
        (@lastProfileId - 4, NULL, @fullType, @ballot, N'ACEA/F/1088', @activeStatus, '2014-04-22', '2014-04-22', 1, SYSUTCDATETIME()),
        (@lastProfileId - 3, NULL, @countryType, @ballot, N'ACEA/C/1156', @activeStatus, '2016-06-30', '2016-06-30', 1, SYSUTCDATETIME()),
        (@lastProfileId - 2, NULL, @fullType, @ballot, N'ACEA/F/1203', @activeStatus, '2004-02-10', '2004-02-10', 1, SYSUTCDATETIME()),
        (@lastProfileId - 1, NULL, @overseasType, @ballot, N'ACEA/O/1310', @activeStatus, '2019-10-05', '2019-10-05', 1, SYSUTCDATETIME()),
        (@lastProfileId - 0, NULL, @fullType, @ballot, N'ACEA/F/1402', @activeStatus, '2022-08-17', '2022-08-17', 1, SYSUTCDATETIME())
    ;
END;
GO

PRINT N'ClubManagement alignment migration completed.';
GO
