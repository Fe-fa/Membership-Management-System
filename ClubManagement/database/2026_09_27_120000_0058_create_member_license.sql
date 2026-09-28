-- Baseline schema for dbo.Member_license. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Member_license', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Member_license] (
        [member_license_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [license_type_id] bigint NOT NULL,
        [license_number] nvarchar(100) NOT NULL,
        [issuer] nvarchar(150) NULL,
        [issued_date] date NULL,
        [expiry_date] date NULL,
        [license_document_id] bigint NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Member_li__is_ac__603D47BB] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Member_li__creat__61316BF4] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Member_license] PRIMARY KEY ([member_license_id])
    );
END
GO
