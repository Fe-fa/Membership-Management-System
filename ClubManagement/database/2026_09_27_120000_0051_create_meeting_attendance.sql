-- Baseline schema for dbo.Meeting_attendance. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Meeting_attendance', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Meeting_attendance] (
        [meeting_attendance_id] bigint IDENTITY(1,1) NOT NULL,
        [committee_meeting_id] bigint NOT NULL,
        [committee_member_id] bigint NOT NULL,
        [attended_flag] bit NOT NULL CONSTRAINT [DF__Meeting_a__atten__3BCADD1B] DEFAULT ((0)),
        [notes] nvarchar(MAX) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Meeting_a__creat__3CBF0154] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Meeting_attendance] PRIMARY KEY ([meeting_attendance_id])
    );
END
GO
