USE [ClubManagement];
GO
IF COL_LENGTH(N'dbo.User_account', N'account_status') IS NULL
    ALTER TABLE dbo.User_account ADD account_status NVARCHAR(30) NOT NULL CONSTRAINT DF_user_account_status DEFAULT(N'ACTIVE');
GO
IF COL_LENGTH(N'dbo.User_account', N'must_change_password') IS NULL
    ALTER TABLE dbo.User_account ADD must_change_password BIT NOT NULL CONSTRAINT DF_user_must_change_pwd DEFAULT(0);
GO
IF COL_LENGTH(N'dbo.User_account', N'email_verified_at') IS NULL
    ALTER TABLE dbo.User_account ADD email_verified_at DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.User_account', N'password_reset_token') IS NULL
    ALTER TABLE dbo.User_account ADD password_reset_token NVARCHAR(120) NULL;
GO
IF COL_LENGTH(N'dbo.User_account', N'password_reset_expires_at') IS NULL
    ALTER TABLE dbo.User_account ADD password_reset_expires_at DATETIME2 NULL;
GO
