-- Baseline schema for dbo.MApplication. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MApplication', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MApplication] (
        [application_id] bigint IDENTITY(1,1) NOT NULL,
        [application_no] nvarchar(50) NOT NULL,
        [applicant_profile_id] bigint NOT NULL,
        [application_form_version_id] bigint NULL,
        [election_type_id] bigint NOT NULL,
        [proposer_profile_id] bigint NULL,
        [seconder_profile_id] bigint NULL,
        [application_status_id] bigint NOT NULL,
        [received_date] date NULL,
        [club_visits_count] int NOT NULL CONSTRAINT [DF__MApplicat__club___05A3D694] DEFAULT ((0)),
        [interview_required_flag] bit NOT NULL CONSTRAINT [DF__MApplicat__inter__0697FACD] DEFAULT ((0)),
        [entrance_fee_amount] decimal(12,2) NULL CONSTRAINT [DF__MApplicat__entra__078C1F06] DEFAULT ((0.00)),
        [annual_subscription_amount] decimal(12,2) NULL CONSTRAINT [DF__MApplicat__annua__0880433F] DEFAULT ((0.00)),
        [submitted_at] datetime2(7) NULL,
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MApplicat__creat__09746778] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [form_data_json] nvarchar(MAX) NULL,
        [completed_steps_json] nvarchar(MAX) NULL,
        [updated_at] datetime2(7) NULL,
        [club_visits_override] bit NOT NULL CONSTRAINT [DF_app_club_visits_override] DEFAULT ((0)),
        [club_visits_override_reason] nvarchar(1000) NULL,
        [club_visits_override_at] datetime2(7) NULL,
        [club_visits_override_by_user_id] bigint NULL,
        [stage_a_authorized_at] datetime2(7) NULL,
        [stage_a_authorized_by_user_id] bigint NULL,
        [tenant_id] bigint NOT NULL,
        [current_handler_user_id] bigint NULL,
        [previous_handler_user_id] bigint NULL,
        [manager_stage_pending] bit NOT NULL CONSTRAINT [DF_mapp_manager_pending] DEFAULT ((0)),
        [manager_stage_pending_note] nvarchar(500) NULL,
        [manager_stage_pending_at] datetime2(7) NULL,
        CONSTRAINT [PK_MApplication] PRIMARY KEY ([application_id])
    );
END
GO
