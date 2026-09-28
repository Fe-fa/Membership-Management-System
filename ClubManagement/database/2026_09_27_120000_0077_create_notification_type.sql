-- Baseline schema for dbo.Notification_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Notification_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Notification_type] (
        [notification_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Notificat__sort___56E8E7AB] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Notificat__is_ac__57DD0BE4] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Notificat__creat__58D1301D] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Notification_type] PRIMARY KEY ([notification_type_id])
    );
END
GO
