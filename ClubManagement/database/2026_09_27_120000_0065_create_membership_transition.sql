-- Baseline schema for dbo.Membership_transition. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Membership_transition', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Membership_transition] (
        [membership_transition_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [kind] nvarchar(30) NOT NULL,
        [status] nvarchar(30) NOT NULL,
        [nominated_at] datetime2(7) NOT NULL,
        [nominated_by_user_id] bigint NULL,
        [gm_date] date NULL,
        [notes] nvarchar(1000) NULL,
        [decided_at] datetime2(7) NULL,
        [decided_by_user_id] bigint NULL,
        [letter_html] nvarchar(MAX) NULL,
        [letter_sent_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL,
        CONSTRAINT [PK_Membership_transition] PRIMARY KEY ([membership_transition_id])
    );
END
GO
