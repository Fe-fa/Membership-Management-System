-- Baseline schema for dbo.Application_signature. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Application_signature', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Application_signature] (
        [application_signature_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [signatory_profile_id] bigint NOT NULL,
        [signatory_role] nvarchar(30) NOT NULL,
        [signature_image_url] nvarchar(500) NULL,
        [signed_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Applicati__creat__16CE6296] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Application_signature] PRIMARY KEY ([application_signature_id])
    );
END
GO
