-- Baseline schema for dbo.Disciplinary_action_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Disciplinary_action_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Disciplinary_action_type] (
        [disciplinary_action_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Disciplin__sort___2EDAF651] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Disciplin__is_ac__2FCF1A8A] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Disciplin__creat__30C33EC3] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Disciplinary_action_type] PRIMARY KEY ([disciplinary_action_type_id])
    );
END
GO
