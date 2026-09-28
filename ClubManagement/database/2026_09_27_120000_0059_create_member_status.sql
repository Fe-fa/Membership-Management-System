-- Baseline schema for dbo.Member_status. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_status', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_status] (
        [member_status_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Member_st__sort___619B8048] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_st__is_ac__628FA481] DEFAULT ((1)),
        [is_terminal] bit NOT NULL CONSTRAINT [DF__Member_st__is_te__6383C8BA] DEFAULT ((0)),
        [is_active_status] bit NOT NULL CONSTRAINT [DF__Member_st__is_ac__6477ECF3] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_st__creat__656C112C] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_status] PRIMARY KEY ([member_status_id])
    );
END
GO
