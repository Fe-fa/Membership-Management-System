-- Baseline schema for dbo.Election_nomination. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Election_nomination', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Election_nomination] (
        [election_nomination_id] bigint IDENTITY(1,1) NOT NULL,
        [general_meeting_id] bigint NOT NULL,
        [nominee_profile_id] bigint NOT NULL,
        [proposer_profile_id] bigint NOT NULL,
        [seconder_profile_id] bigint NOT NULL,
        [role_standing_for] nvarchar(120) NOT NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF_enom_created] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        CONSTRAINT [PK_Election_nomination] PRIMARY KEY ([election_nomination_id])
    );
END
GO
