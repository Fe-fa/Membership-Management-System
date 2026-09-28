-- Baseline schema for dbo.MAccount. This file is not executed by the application.
IF OBJECT_ID(N'dbo.MAccount', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MAccount] (
        [account_id] bigint IDENTITY(1,1) NOT NULL,
        [profile_id] bigint NOT NULL,
        [application_id] bigint NULL,
        [membership_type_id] bigint NOT NULL,
        [election_type_id] bigint NOT NULL,
        [membership_no] nvarchar(80) NULL,
        [current_member_status_id] bigint NOT NULL,
        [joined_date] date NULL,
        [start_date] date NULL,
        [end_date] date NULL,
        [entrance_fee_amount] decimal(12,2) NULL CONSTRAINT [DF__MAccount__entran__40C49C62] DEFAULT ((0.00)),
        [entrance_fee_waived_flag] bit NOT NULL CONSTRAINT [DF__MAccount__entran__41B8C09B] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__MAccount__is_act__42ACE4D4] DEFAULT ((1)),
        [is_deleted] bit NOT NULL CONSTRAINT [DF__MAccount__is_del__43A1090D] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__MAccount__create__44952D46] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [tenant_id] bigint NOT NULL,
        CONSTRAINT [PK_MAccount] PRIMARY KEY ([account_id])
    );
END
GO
