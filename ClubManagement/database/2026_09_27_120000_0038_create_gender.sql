-- Baseline schema for dbo.Gender. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Gender', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Gender] (
        [gender_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Gender__sort_ord__07C12930] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Gender__is_activ__08B54D69] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Gender__created___09A971A2] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Gender] PRIMARY KEY ([gender_id])
    );
END
GO
