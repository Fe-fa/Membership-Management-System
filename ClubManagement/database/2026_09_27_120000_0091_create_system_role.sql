-- Baseline schema for dbo.System_role. This file is not executed by the application.
IF OBJECT_ID(N'dbo.System_role', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[System_role] (
        [system_role_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__System_ro__sort___5CA1C101] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__System_ro__is_ac__5D95E53A] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__System_ro__creat__5E8A0973] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [tenant_id] bigint NULL,
        CONSTRAINT [PK_System_role] PRIMARY KEY ([system_role_id])
    );
END
GO
