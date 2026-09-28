-- Baseline schema for dbo.blood_group. This file is not executed by the application.
IF OBJECT_ID(N'dbo.blood_group', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[blood_group] (
        [blood_group_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__blood_gro__sort___1332DBDC] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__blood_gro__is_ac__14270015] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__blood_gro__creat__151B244E] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_blood_group] PRIMARY KEY ([blood_group_id])
    );
END
GO
