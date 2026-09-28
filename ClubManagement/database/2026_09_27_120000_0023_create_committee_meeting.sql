-- Baseline schema for dbo.Committee_meeting. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Committee_meeting', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Committee_meeting] (
        [committee_meeting_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_id] bigint NOT NULL,
        [meeting_type_id] bigint NOT NULL,
        [meeting_date] date NOT NULL,
        [chair_profile_id] bigint NULL,
        [minutes_url] nvarchar(500) NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Committee__statu__2704CA5F] DEFAULT (N'SCHEDULED'),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Committee__creat__27F8EE98] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [meeting_name] nvarchar(200) NULL,
        [meeting_time] nvarchar(20) NULL,
        [venue_mode] nvarchar(20) NULL,
        [duration_minutes] int NULL,
        [location] nvarchar(300) NULL,
        [notes] nvarchar(2000) NULL,
        CONSTRAINT [PK_Committee_meeting] PRIMARY KEY ([committee_meeting_id])
    );
END
GO
