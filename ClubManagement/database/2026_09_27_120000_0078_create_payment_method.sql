-- Baseline schema for dbo.Payment_method. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Payment_method', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Payment_method] (
        [payment_method_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Payment_m__sort___6FE99F9F] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Payment_m__is_ac__70DDC3D8] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Payment_m__creat__71D1E811] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Payment_method] PRIMARY KEY ([payment_method_id])
    );
END
GO
