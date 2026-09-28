-- Baseline schema for dbo.Club_setting. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Club_setting', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Club_setting] (
        [club_setting_id] bigint IDENTITY(1,1) NOT NULL,
        [setting_key] nvarchar(100) NOT NULL,
        [setting_value] nvarchar(MAX) NOT NULL,
        [effective_date] date NULL,
        [authorizing_resolution_id] bigint NULL,
        [description] nvarchar(MAX) NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Club_sett__is_ac__1758727B] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Club_sett__creat__184C96B4] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [tenant_id] bigint NOT NULL,
        CONSTRAINT [PK_Club_setting] PRIMARY KEY ([club_setting_id])
    );
END
GO
