-- Baseline schema for dbo.Document_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Document_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Document_type] (
        [document_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Document___sort___29221CFB] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Document___is_ac__2A164134] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Document___creat__2B0A656D] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Document_type] PRIMARY KEY ([document_type_id])
    );
END
GO
