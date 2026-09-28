-- Baseline schema for dbo.Member_emergency_contact. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_emergency_contact', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_emergency_contact] (
        [member_emergency_contact_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [contact_name] nvarchar(150) NOT NULL,
        [relationship_type_id] bigint NOT NULL,
        [telephone] nvarchar(30) NULL,
        [email] nvarchar(150) NULL,
        [is_primary_flag] bit NOT NULL CONSTRAINT [DF__Member_em__is_pr__10AB74EC] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_em__is_ac__119F9925] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_em__creat__1293BD5E] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_emergency_contact] PRIMARY KEY ([member_emergency_contact_id])
    );
END
GO
