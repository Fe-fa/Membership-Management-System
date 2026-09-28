-- Baseline schema for dbo.Application_status_history. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Application_status_history', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Application_status_history] (
        [application_status_history_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [from_status_id] bigint NULL,
        [to_status_id] bigint NOT NULL,
        [changed_at] datetime2(7) NOT NULL CONSTRAINT [DF__Applicati__chang__336AA144] DEFAULT (sysutcdatetime()),
        [changed_by_user_id] bigint NULL,
        [reason] nvarchar(MAX) NULL,
        [updated_at] datetime2(7) NULL,
        [action] nvarchar(40) NULL,
        CONSTRAINT [PK_Application_status_history] PRIMARY KEY ([application_status_history_id])
    );
END
GO
