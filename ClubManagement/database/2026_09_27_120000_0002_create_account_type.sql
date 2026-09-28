-- Baseline schema for dbo.Account_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Account_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Account_type] (
        [account_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Account_t__sort___51300E55] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Account_t__is_ac__5224328E] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Account_t__creat__531856C7] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Account_type] PRIMARY KEY ([account_type_id])
    );
END
GO
