-- Baseline schema for dbo.Notification. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Notification', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Notification] (
        [notification_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NULL,
        [notification_type_id] bigint NOT NULL,
        [recipient] nvarchar(255) NOT NULL,
        [channel] nvarchar(50) NOT NULL,
        [sent_date] datetime2(7) NULL,
        [content] nvarchar(MAX) NULL,
        [related_entity_type] nvarchar(100) NULL,
        [related_entity_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Notificat__creat__5C37ACAD] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [read_at] datetime2(7) NULL,
        [dismissed_at] datetime2(7) NULL,
        CONSTRAINT [PK_Notification] PRIMARY KEY ([notification_id])
    );
END
GO
