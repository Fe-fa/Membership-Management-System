-- Baseline schema for dbo.Endorsement. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Endorsement', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Endorsement] (
        [endorsement_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [endorser_profile_id] bigint NOT NULL,
        [endorser_role] nvarchar(30) NOT NULL,
        [years_known_candidate] int NULL,
        [personal_knowledge] nvarchar(MAX) NULL,
        [professional_knowledge] nvarchar(MAX) NULL,
        [value_addition] nvarchar(MAX) NULL,
        [endorser_year_of_joining] int NULL,
        [endorser_phone] nvarchar(30) NULL,
        [endorser_email] nvarchar(150) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Endorseme__creat__1B9317B3] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [status] nvarchar(20) NULL,
        [declined_at] datetime2(7) NULL,
        [decline_reason] nvarchar(1000) NULL,
        [hidden_from_endorser] bit NOT NULL CONSTRAINT [DF_endorsement_hidden] DEFAULT ((0)),
        CONSTRAINT [PK_Endorsement] PRIMARY KEY ([endorsement_id])
    );
END
GO
