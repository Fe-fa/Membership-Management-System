-- Baseline schema for dbo.Member_guarantorship. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_guarantorship', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_guarantorship] (
        [member_guarantorship_id] bigint IDENTITY(1,1) NOT NULL,
        [temporary_account_id] bigint NOT NULL,
        [guarantor_profile_id] bigint NOT NULL,
        [guarantor_years_standing_at_signup] int NULL,
        [start_date] date NOT NULL,
        [end_date] date NULL,
        [extended_flag] bit NOT NULL CONSTRAINT [DF__Member_gu__exten__09FE775D] DEFAULT ((0)),
        [extended_until_date] date NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_gu__is_ac__0AF29B96] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_gu__creat__0BE6BFCF] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_guarantorship] PRIMARY KEY ([member_guarantorship_id])
    );
END
GO
