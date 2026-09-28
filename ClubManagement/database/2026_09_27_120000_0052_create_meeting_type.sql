-- Baseline schema for dbo.Meeting_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Meeting_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Meeting_type] (
        [meeting_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Meeting_t__sort___45BE5BA9] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Meeting_t__is_ac__46B27FE2] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Meeting_t__creat__47A6A41B] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Meeting_type] PRIMARY KEY ([meeting_type_id])
    );
END
GO
