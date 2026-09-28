-- Baseline schema for dbo.Relationship_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Relationship_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Relationship_type] (
        [relationship_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Relations__sort___3493CFA7] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Relations__is_ac__3587F3E0] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Relations__creat__367C1819] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Relationship_type] PRIMARY KEY ([relationship_type_id])
    );
END
GO
