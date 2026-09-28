-- Baseline schema for dbo.Application_status. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Application_status', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Application_status] (
        [application_status_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Applicati__sort___693CA210] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Applicati__is_ac__6A30C649] DEFAULT ((1)),
        [is_terminal] bit NOT NULL CONSTRAINT [DF__Applicati__is_te__6B24EA82] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Applicati__creat__6C190EBB] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Application_status] PRIMARY KEY ([application_status_id])
    );
END
GO
