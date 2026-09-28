-- Baseline schema for dbo.Proxy. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Proxy] (
        [proxy_id] bigint IDENTITY(1,1) NOT NULL,
        [general_meeting_id] bigint NOT NULL,
        [appointing_profile_id] bigint NOT NULL,
        [proxy_profile_id] bigint NULL,
        [proxy_name] nvarchar(150) NULL,
        [proxy_contact] nvarchar(150) NULL,
        [vote_instruction] nvarchar(30) NULL,
        [instrument_received_at] datetime2(7) NULL,
        [deposited_on_time_flag] bit NOT NULL CONSTRAINT [DF__Proxy__deposited__7BB05806] DEFAULT ((0)),
        [is_valid_flag] bit NOT NULL CONSTRAINT [DF__Proxy__is_valid___7CA47C3F] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Proxy__created_a__7D98A078] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [proxy_title] nvarchar(20) NULL,
        [alternate_title] nvarchar(20) NULL,
        [alternate_name] nvarchar(200) NULL,
        [leave_to_discretion] bit NOT NULL CONSTRAINT [DF_proxy_discretion] DEFAULT ((0)),
        [appointing_name] nvarchar(200) NULL,
        [appointing_po_box] nvarchar(200) NULL,
        [is_poll] bit NOT NULL CONSTRAINT [DF_proxy_poll] DEFAULT ((0)),
        [proxy_notes] nvarchar(2000) NULL,
        [signed_form_url] nvarchar(500) NULL,
        [review_status] nvarchar(20) NULL,
        [review_reason] nvarchar(500) NULL,
        [reviewed_at] datetime2(7) NULL,
        [reviewed_by_profile_id] bigint NULL,
        CONSTRAINT [PK_Proxy] PRIMARY KEY ([proxy_id])
    );
END
GO
