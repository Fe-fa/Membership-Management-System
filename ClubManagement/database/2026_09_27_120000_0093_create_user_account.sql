-- Baseline schema for dbo.User_account. This file is not executed by the application.
IF OBJECT_ID(N'dbo.User_account', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[User_account] (
        [user_account_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [username] nvarchar(100) NOT NULL,
        [password_hash] nvarchar(255) NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__User_acco__is_ac__62E4AA3C] DEFAULT ((1)),
        [last_login_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__User_acco__creat__63D8CE75] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [account_status] nvarchar(30) NOT NULL CONSTRAINT [DF_user_account_status] DEFAULT (N'ACTIVE'),
        [must_change_password] bit NOT NULL CONSTRAINT [DF_user_must_change_pwd] DEFAULT ((0)),
        [email_verified_at] datetime2(7) NULL,
        [password_reset_token] nvarchar(120) NULL,
        [password_reset_expires_at] datetime2(7) NULL,
        [tenant_id] bigint NOT NULL,
        [email_verification_code_hash] nvarchar(200) NULL,
        [email_verification_expires_at] datetime2(7) NULL,
        CONSTRAINT [PK_User_account] PRIMARY KEY ([user_account_id])
    );
END
GO
