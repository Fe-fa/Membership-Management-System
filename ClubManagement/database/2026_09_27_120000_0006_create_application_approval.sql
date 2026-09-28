-- Baseline schema for dbo.Application_approval. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Application_approval', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Application_approval] (
        [application_approval_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [approver_profile_id] bigint NOT NULL,
        [approver_role_id] bigint NOT NULL,
        [approval_decision] nvarchar(30) NOT NULL,
        [approval_signature_url] nvarchar(500) NULL,
        [approved_at] datetime2(7) NULL,
        [date_elected] date NULL,
        [remarks] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Applicati__creat__2DB1C7EE] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Application_approval] PRIMARY KEY ([application_approval_id])
    );
END
GO
