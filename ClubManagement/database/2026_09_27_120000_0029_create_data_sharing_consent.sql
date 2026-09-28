-- Baseline schema for dbo.Data_sharing_consent. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Data_sharing_consent', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Data_sharing_consent] (
        [data_sharing_consent_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [third_party_name] nvarchar(150) NOT NULL,
        [purpose] nvarchar(255) NULL,
        [consented_flag] bit NOT NULL CONSTRAINT [DF__Data_shar__conse__278EDA44] DEFAULT ((0)),
        [consented_at] datetime2(7) NULL,
        [withdrawn_at] datetime2(7) NULL,
        [privacy_policy_version] nvarchar(50) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Data_shar__creat__2882FE7D] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Data_sharing_consent] PRIMARY KEY ([data_sharing_consent_id])
    );
END
GO
