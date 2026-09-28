-- Baseline schema for dbo.Committee_role. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee_role', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee_role] (
        [committee_role_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Committee__sort___01142BA1] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Committee__is_ac__02084FDA] DEFAULT ((1)),
        [can_approve_credit] bit NOT NULL CONSTRAINT [DF__Committee__can_a__02FC7413] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Committee__creat__03F0984C] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Committee_role] PRIMARY KEY ([committee_role_id])
    );
END
GO
