-- Baseline schema for dbo.Election_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Election_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Election_type] (
        [election_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Election___sort___5BE2A6F2] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Election___is_ac__5CD6CB2B] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Election___creat__5DCAEF64] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Election_type] PRIMARY KEY ([election_type_id])
    );
END
GO
