-- Baseline schema for dbo.Payment_status. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Payment_status', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Payment_status] (
        [payment_status_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Payment_s__sort___75A278F5] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Payment_s__is_ac__76969D2E] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Payment_s__creat__778AC167] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Payment_status] PRIMARY KEY ([payment_status_id])
    );
END
GO
