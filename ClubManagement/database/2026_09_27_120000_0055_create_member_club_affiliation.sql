-- Baseline schema for dbo.Member_club_affiliation. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_club_affiliation', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_club_affiliation] (
        [member_club_affiliation_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [club_id] bigint NOT NULL,
        [affiliation_type_id] bigint NOT NULL,
        [start_date] date NULL,
        [end_date] date NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_cl__is_ac__6CA31EA0] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_cl__creat__6D9742D9] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_club_affiliation] PRIMARY KEY ([member_club_affiliation_id])
    );
END
GO
