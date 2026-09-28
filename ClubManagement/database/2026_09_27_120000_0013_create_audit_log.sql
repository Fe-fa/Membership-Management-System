-- Baseline schema for dbo.Audit_log. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Audit_log] (
        [audit_log_id] bigint IDENTITY(1,1) NOT NULL,
        [table_name] nvarchar(150) NOT NULL,
        [record_id] bigint NOT NULL,
        [action] nvarchar(20) NOT NULL,
        [old_values] nvarchar(MAX) NULL,
        [new_values] nvarchar(MAX) NULL,
        [changed_by_user_id] bigint NULL,
        [changed_at] datetime2(7) NOT NULL CONSTRAINT [DF__Audit_log__chang__473C8FC7] DEFAULT (sysutcdatetime()),
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Audit_log] PRIMARY KEY ([audit_log_id])
    );
END
GO
