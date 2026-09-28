-- Baseline schema for dbo.General_meeting. This file is not executed by the application.
IF OBJECT_ID(N'dbo.General_meeting', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[General_meeting] (
        [general_meeting_id] bigint IDENTITY(1,1) NOT NULL,
        [meeting_type] nvarchar(30) NOT NULL,
        [meeting_date] date NOT NULL,
        [notice_sent_date] date NULL,
        [notice_method] nvarchar(30) NULL,
        [quorum_required] int NOT NULL CONSTRAINT [DF__General_m__quoru__6D6238AF] DEFAULT ((20)),
        [quorum_met_flag] bit NOT NULL CONSTRAINT [DF__General_m__quoru__6E565CE8] DEFAULT ((0)),
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__General_m__statu__6F4A8121] DEFAULT (N'SCHEDULED'),
        [adjourned_from_meeting_id] bigint NULL,
        [minutes_url] nvarchar(500) NULL,
        [chairman_profile_id] bigint NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__General_m__creat__703EA55A] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [agenda_text] nvarchar(2000) NULL,
        [papers_url] nvarchar(500) NULL,
        [venue] nvarchar(200) NULL,
        [ballot_window_open] bit NOT NULL CONSTRAINT [DF_gm_ballot_open] DEFAULT ((0)),
        [ballot_opens_at] datetime2(7) NULL,
        [ballot_closes_at] datetime2(7) NULL,
        [ballot_conductor_profile_id] bigint NULL,
        [scrutineer_1_profile_id] bigint NULL,
        [scrutineer_2_profile_id] bigint NULL,
        [result_declared_at] datetime2(7) NULL,
        [result_declared_by_profile_id] bigint NULL,
        [result_summary] nvarchar(1000) NULL,
        [minutes_text] nvarchar(MAX) NULL,
        [minutes_status] nvarchar(20) NOT NULL CONSTRAINT [DF_gm_minutes_status] DEFAULT ('DRAFT'),
        [minutes_recorded_by_profile_id] bigint NULL,
        [minutes_recorded_at] datetime2(7) NULL,
        [minutes_signed_by_profile_id] bigint NULL,
        [minutes_signed_at] datetime2(7) NULL,
        CONSTRAINT [PK_General_meeting] PRIMARY KEY ([general_meeting_id])
    );
END
GO
