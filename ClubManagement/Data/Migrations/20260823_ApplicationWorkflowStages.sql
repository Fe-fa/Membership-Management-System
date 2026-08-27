-- Stage workflow for membership applications.
-- After submit the row stays Active (SUBMITTED). Admin Review writes Under Review
-- to Application_status and a row to Application_status_history. Endorsement is
-- only used after screening is approved — not at submit time.
USE [ClubManagement];
GO

UPDATE [dbo].[Application_status]
SET [name] = N'Pre-requisites',
    [description] = N'Submitted — collecting or verifying application pre-requisites.',
    [updated_at] = SYSUTCDATETIME()
WHERE [code] IN (N'SUBMITTED', N'Submitted');

UPDATE [dbo].[Application_status]
SET [name] = N'Screening',
    [description] = N'Admin is reviewing applicant details (screening).',
    [updated_at] = SYSUTCDATETIME()
WHERE [code] IN (N'UNDERREVIEW', N'UNDER_REVIEW', N'UnderReview');

UPDATE [dbo].[Application_status]
SET [name] = N'Fully approved',
    [description] = N'Application fully approved for membership.',
    [updated_at] = SYSUTCDATETIME()
WHERE [code] IN (N'APPROVED', N'Approved');

MERGE [dbo].[Application_status] AS target
USING (VALUES
    (N'ENDORSEMENT',          N'Endorsement',          N'Waiting for proposer and seconder to endorse.',                 8,  1, 0),
    (N'ENDORSEMENT_REVIEW',   N'Endorsement Review',   N'Admin is reviewing proposer and seconder endorsements.',        9,  1, 0),
    (N'INTERVIEW',            N'Interview',            N'Waiting at interview stage.',                                  10, 1, 0),
    (N'INTERVIEW_REVIEW',     N'Interview Review',     N'Admin is reviewing the interview.',                            11, 1, 0),
    (N'ELECTION_REVIEW',      N'Election Review',      N'Admin is reviewing the election stage.',                       12, 1, 0),
    (N'COMMITTEE',            N'Committee signatures', N'Waiting for committee signatures.',                            13, 1, 0),
    (N'COMMITTEE_REVIEW',     N'Committee Review',     N'Admin is reviewing committee signatures.',                     14, 1, 0)
) AS src ([code],[name],[description],[sort_order],[is_active],[is_terminal])
ON target.[code] = src.[code]
WHEN MATCHED THEN
    UPDATE SET
        [name] = src.[name],
        [description] = src.[description],
        [sort_order] = src.[sort_order],
        [is_active] = src.[is_active],
        [is_terminal] = src.[is_terminal],
        [updated_at] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT ([code],[name],[description],[sort_order],[is_active],[is_terminal],[created_at],[updated_at])
    VALUES (src.[code], src.[name], src.[description], src.[sort_order], src.[is_active], src.[is_terminal], SYSUTCDATETIME(), SYSUTCDATETIME());
GO
