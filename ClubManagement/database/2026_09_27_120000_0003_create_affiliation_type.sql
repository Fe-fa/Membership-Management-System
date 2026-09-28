-- Baseline schema for dbo.Affiliation_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Affiliation_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Affiliation_type] (
        [affiliation_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Affiliati__sort___3A4CA8FD] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Affiliati__is_ac__3B40CD36] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Affiliati__creat__3C34F16F] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Affiliation_type] PRIMARY KEY ([affiliation_type_id])
    );
END
GO
