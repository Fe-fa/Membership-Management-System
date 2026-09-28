-- Baseline schema for dbo.Governance_document_version. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Governance_document_version', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Governance_document_version] (
        [governance_document_version_id] bigint IDENTITY(1,1) NOT NULL,
        [governance_document_id] bigint NOT NULL,
        [version_label] nvarchar(50) NOT NULL,
        [effective_date] date NULL,
        [document_url] nvarchar(500) NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Governanc__statu__70A8B9AE] DEFAULT (N'EFFECTIVE'),
        [superseded_by_version_id] bigint NULL,
        [created_by_user_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Governanc__creat__719CDDE7] DEFAULT (sysutcdatetime()),
        [updated_at] datetime2(7) NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK_Governance_document_version] PRIMARY KEY ([governance_document_version_id])
    );
END
GO
