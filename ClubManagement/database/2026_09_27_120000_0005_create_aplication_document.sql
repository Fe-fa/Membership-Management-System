-- Baseline schema for dbo.Aplication_document. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Aplication_document', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Aplication_document] (
        [application_document_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [document_type_id] bigint NOT NULL,
        [file_name] nvarchar(255) NOT NULL,
        [file_url] nvarchar(500) NOT NULL,
        [uploaded_at] datetime2(7) NULL,
        [uploaded_by_user_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Aplicatio__creat__1209AD79] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [is_verified] bit NOT NULL CONSTRAINT [DF_appdoc_is_verified] DEFAULT ((0)),
        [verification_status] nvarchar(40) NULL,
        [verification_notes] nvarchar(500) NULL,
        [verified_at] datetime2(7) NULL,
        [verified_by_user_id] bigint NULL,
        CONSTRAINT [PK_Aplication_document] PRIMARY KEY ([application_document_id])
    );
END
GO
