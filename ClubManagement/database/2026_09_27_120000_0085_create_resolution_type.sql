-- Baseline schema for dbo.Resolution_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Resolution_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Resolution_type] (
        [resolution_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Resolutio__sort___4B7734FF] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Resolutio__is_ac__4C6B5938] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Resolutio__creat__4D5F7D71] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Resolution_type] PRIMARY KEY ([resolution_type_id])
    );
END
GO
