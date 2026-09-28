-- Baseline schema for dbo.ApplicationExclusion. This file is not executed by the application.
IF OBJECT_ID(N'dbo.ApplicationExclusion', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ApplicationExclusion] (
        [application_exclusion_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [applicant_profile_id] bigint NOT NULL,
        [adverse_vote_count] int NOT NULL CONSTRAINT [DF__Applicati__adver__20E1DCB5] DEFAULT ((0)),
        [excluded_date] date NOT NULL,
        [excluded_until_date] date NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF__Applicati__is_ac__21D600EE] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Applicati__creat__22CA2527] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_ApplicationExclusion] PRIMARY KEY ([application_exclusion_id])
    );
END
GO
