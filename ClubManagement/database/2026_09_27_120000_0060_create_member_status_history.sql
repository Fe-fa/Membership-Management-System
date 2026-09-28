-- Baseline schema for dbo.Member_status_history. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_status_history', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_status_history] (
        [member_status_history_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [from_status_id] bigint NULL,
        [to_status_id] bigint NOT NULL,
        [effective_date] date NOT NULL,
        [reason] nvarchar(MAX) NULL,
        [reference_type] nvarchar(30) NULL,
        [reference_id] bigint NULL,
        [changed_by_user_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_st__creat__4C364F0E] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_status_history] PRIMARY KEY ([member_status_history_id])
    );
END
GO
