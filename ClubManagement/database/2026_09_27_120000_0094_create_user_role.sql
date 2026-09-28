-- Baseline schema for dbo.User_role. This file is not executed by the application.
IF OBJECT_ID(N'dbo.User_role', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[User_role] (
        [user_role_id] bigint IDENTITY(1,1) NOT NULL,
        [user_account_id] bigint NOT NULL,
        [role_id] bigint NOT NULL,
        [assigned_date] date NOT NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__User_role__creat__689D8392] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_User_role] PRIMARY KEY ([user_role_id])
    );
END
GO
