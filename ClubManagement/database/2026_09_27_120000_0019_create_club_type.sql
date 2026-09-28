-- Baseline schema for dbo.Club_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Club_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Club_type] (
        [club_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Club_type__sort___4BAC3F29] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Club_type__is_ac__4CA06362] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Club_type__creat__4D94879B] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK_Club_type] PRIMARY KEY ([club_type_id])
    );
END
GO
