-- Baseline schema for dbo.Application_club_visit. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Application_club_visit', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Application_club_visit] (
        [application_club_visit_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [visit_date] date NOT NULL,
        [met_with] nvarchar(200) NOT NULL,
        [notes] nvarchar(1000) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF_Application_club_visit_created] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK_Application_club_visit] PRIMARY KEY ([application_club_visit_id])
    );
END
GO
