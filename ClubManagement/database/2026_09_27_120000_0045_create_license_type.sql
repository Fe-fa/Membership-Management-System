-- Baseline schema for dbo.License_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.License_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[License_type] (
        [license_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__License_t__is_ac__245D67DE] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__License_t__creat__25518C17] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_License_type] PRIMARY KEY ([license_type_id])
    );
END
GO
