-- Baseline schema for dbo.Fee_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Fee_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Fee_type] (
        [fee_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Fee_type__sort_o__7B5B524B] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Fee_type__is_act__7C4F7684] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Fee_type__create__7D439ABD] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Fee_type] PRIMARY KEY ([fee_type_id])
    );
END
GO
