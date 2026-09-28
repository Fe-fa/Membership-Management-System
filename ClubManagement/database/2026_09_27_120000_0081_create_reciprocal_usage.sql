-- Baseline schema for dbo.Reciprocal_usage. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Reciprocal_usage', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Reciprocal_usage] (
        [reciprocal_usage_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [home_club_id] bigint NOT NULL,
        [visit_date] date NOT NULL,
        [days_used] int NOT NULL CONSTRAINT [DF__Reciproca__days___7FB5F314] DEFAULT ((1)),
        [register_signature_url] nvarchar(500) NULL,
        [notes] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Reciproca__creat__00AA174D] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Reciprocal_usage] PRIMARY KEY ([reciprocal_usage_id])
    );
END
GO
