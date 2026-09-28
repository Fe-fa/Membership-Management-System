-- Baseline schema for dbo.Interview. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Interview', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Interview] (
        [interview_id] bigint IDENTITY(1,1) NOT NULL,
        [application_id] bigint NOT NULL,
        [committee_meeting_id] bigint NULL,
        [scheduled_at] datetime2(7) NULL,
        [conducted_at] datetime2(7) NULL,
        [interviewer_profile_id] bigint NULL,
        [attended_flag] bit NOT NULL CONSTRAINT [DF__Interview__atten__39237A9A] DEFAULT ((0)),
        [outcome] nvarchar(100) NULL,
        [notes] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Interview__creat__3A179ED3] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [interview_form_json] nvarchar(MAX) NULL,
        CONSTRAINT [PK_Interview] PRIMARY KEY ([interview_id])
    );
END
GO
