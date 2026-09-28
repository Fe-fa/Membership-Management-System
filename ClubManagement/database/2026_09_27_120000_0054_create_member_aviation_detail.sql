-- Baseline schema for dbo.Member_aviation_detail. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_aviation_detail', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_aviation_detail] (
        [member_aviation_detail_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [is_aviation_affiliated] bit NOT NULL CONSTRAINT [DF__Member_av__is_av__59904A2C] DEFAULT ((0)),
        [aviation_role] nvarchar(150) NULL,
        [holds_pilot_licence_flag] bit NOT NULL CONSTRAINT [DF__Member_av__holds__5A846E65] DEFAULT ((0)),
        [owns_aircraft_flag] bit NOT NULL CONSTRAINT [DF__Member_av__owns___5B78929E] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_av__creat__5C6CB6D7] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_aviation_detail] PRIMARY KEY ([member_aviation_detail_id])
    );
END
GO
