-- Align Application_status display names with the admin desk badges.
-- Codes stay stable for workflow; only Name/Description change.
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
GO
