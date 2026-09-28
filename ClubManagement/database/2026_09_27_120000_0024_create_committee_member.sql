-- Baseline schema for dbo.Committee_member. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee_member', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee_member] (
        [committee_member_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_id] bigint NOT NULL,
        [profile_id] bigint NOT NULL,
        [committee_role_id] bigint NOT NULL,
        [appointed_date] date NULL,
        [end_date] date NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Committee__is_ac__2057CCD0] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Committee__creat__214BF109] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Committee_member] PRIMARY KEY ([committee_member_id])
    );
END
GO
