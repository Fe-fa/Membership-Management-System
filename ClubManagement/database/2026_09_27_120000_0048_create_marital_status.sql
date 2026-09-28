-- Baseline schema for dbo.Marital_status. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Marital_status', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Marital_status] (
        [marital_status_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Marital_s__sort___0D7A0286] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Marital_s__is_ac__0E6E26BF] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Marital_s__creat__0F624AF8] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Marital_status] PRIMARY KEY ([marital_status_id])
    );
END
GO
